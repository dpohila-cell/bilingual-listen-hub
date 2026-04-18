import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateText,
  getOpenAIApiKey,
  isInsufficientQuota,
  isRateLimited,
} from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_BATCH_SIZE = 25;
const MAX_PER_CALL = 25; // 1 AI call per function invocation to avoid timeout

async function logFunctionEvent(
  supabase: ReturnType<typeof createClient>,
  level: "info" | "error",
  message: string,
  options: { bookId?: string; details?: unknown } = {},
) {
  try {
    const details = typeof options.details === "string"
      ? options.details
      : options.details
        ? JSON.stringify(options.details)
        : null;

    await supabase.from("function_logs").insert({
      function_name: "translate-all",
      level,
      book_id: options.bookId ?? null,
      message,
      details: details ? details.slice(0, 5000) : null,
    });
  } catch (logError) {
    console.error("Failed to write function log:", logError);
  }
}

function repairAndParseJson(raw: string): unknown {
  // Strip control chars except newlines/tabs
  let s = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("");
  try { return JSON.parse(s); } catch { /* continue */ }

  // Fix trailing commas
  s = s.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  // If truncated array/object, close it
  if (s.startsWith("[") && !s.endsWith("]")) {
    const lastClose = s.lastIndexOf("}");
    if (lastClose > 0) s = s.substring(0, lastClose + 1) + "]";
  }

  try { return JSON.parse(s); } catch (e) {
    throw new Error(`JSON repair failed: ${(e as Error).message}`);
  }
}

async function translateBatch(
  sentences: Array<{ id: string; original_text: string }>,
  openAIApiKey: string,
  originalLanguage: string
): Promise<Array<{ en: string; ru: string; sv: string }>> {
  const langNames: Record<string, string> = { en: "English", ru: "Russian", sv: "Swedish" };
  const sourceLang = langNames[originalLanguage] || "Russian";

  const prompt = `I have sentences written in ${sourceLang}. I need you to translate them.

IMPORTANT: The "en" field MUST contain the ENGLISH translation. The "ru" field MUST contain the RUSSIAN text. The "sv" field MUST contain the SWEDISH translation.
${originalLanguage === "ru" ? 'The original text is in Russian. You MUST translate it into English for the "en" field - do NOT copy the Russian text into "en".' : ''}
${originalLanguage === "en" ? 'The original text is in English. You MUST translate it into Russian for the "ru" field and Swedish for the "sv" field.' : ''}

Return ONLY a JSON array where each element has: {"en": "English text here", "ru": "Russian text here", "sv": "Swedish text here"}
No extra text, no markdown fences. Just the JSON array.

Sentences to translate:
${sentences.map((s, idx) => `${idx + 1}. ${s.original_text}`).join("\n")}`;

  let content = await generateText(openAIApiKey, prompt);
  if (!content) throw new Error("AI returned empty content");
  if (content.startsWith("```")) {
    content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return repairAndParseJson(content) as Array<{ en: string; ru: string; sv: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openAIApiKey = getOpenAIApiKey();

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { bookId } = await req.json();

    if (!bookId) {
      return new Response(JSON.stringify({ error: "Missing bookId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logFunctionEvent(supabase, "info", "translate-all invoked", { bookId });

    const { data: book } = await supabase
      .from("books").select("id, user_id, original_language").eq("id", bookId).single();
    if (!book || book.user_id !== user.id) {
      await logFunctionEvent(supabase, "error", "book not found or not owned", {
        bookId,
        details: { userId: user.id },
      });
      return new Response(JSON.stringify({ error: "Not found or not owned" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const originalLanguage = book.original_language || "en";

    // Fetch up to MAX_PER_CALL untranslated sentences
    const { data: untranslated, error: fetchErr } = await supabase
      .from("sentences")
      .select("id, sentence_order, original_text")
      .eq("book_id", bookId)
      .is("en_translation", null)
      .order("sentence_order", { ascending: true })
      .limit(MAX_PER_CALL);

    if (fetchErr) throw fetchErr;

    if (!untranslated || untranslated.length === 0) {
      await logFunctionEvent(supabase, "info", "no untranslated sentences found", { bookId });
      return new Response(JSON.stringify({ message: "All translated", translated: 0, hasMore: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`translate-all: processing ${untranslated.length} sentences for book ${bookId}`);
    await logFunctionEvent(supabase, "info", "processing untranslated sentences", {
      bookId,
      details: { count: untranslated.length, originalLanguage },
    });

    let totalTranslated = 0;

    for (let i = 0; i < untranslated.length; i += AI_BATCH_SIZE) {
      const batch = untranslated.slice(i, i + AI_BATCH_SIZE);

      try {
        const translations = await translateBatch(batch, openAIApiKey, originalLanguage);

        for (let j = 0; j < batch.length; j++) {
          const t = translations[j];
          if (!t) continue;
          const { error: updateErr } = await supabase
            .from("sentences")
            .update({
              en_translation: t.en,
              ru_translation: t.ru,
              sv_translation: t.sv,
            })
            .eq("id", batch[j].id);
          if (!updateErr) totalTranslated++;
        }
      } catch (err) {
        console.error(`translate-all batch error at ${i}:`, err);
        if (isInsufficientQuota(err)) {
          await logFunctionEvent(supabase, "error", "OpenAI quota exhausted", {
            bookId,
            details: String(err),
          });
          return new Response(JSON.stringify({
            error: "OpenAI quota exhausted",
            details: "OpenAI returned insufficient_quota. Check API billing, credits, and project limits.",
            translated: totalTranslated,
            hasMore: true,
          }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // If rate limited, stop and let client retry
        if (isRateLimited(err)) {
          await logFunctionEvent(supabase, "error", "rate limited by OpenAI", {
            bookId,
            details: String(err),
          });
          return new Response(JSON.stringify({
            translated: totalTranslated,
            hasMore: true,
            retryAfter: 10,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await logFunctionEvent(supabase, "error", "translation failed", {
          bookId,
          details: String(err),
        });

        return new Response(JSON.stringify({
          error: "Translation failed",
          details: String(err),
          translated: totalTranslated,
          hasMore: true,
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check if there are more untranslated sentences
    const { count } = await supabase
      .from("sentences")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId)
      .is("en_translation", null);

    const hasMore = (count || 0) > 0;

    console.log(`translate-all: ${totalTranslated} done, hasMore: ${hasMore}`);
    await logFunctionEvent(supabase, "info", "translation batch completed", {
      bookId,
      details: { totalTranslated, hasMore },
    });

    return new Response(
      JSON.stringify({ success: true, translated: totalTranslated, hasMore }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("translate-all error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
