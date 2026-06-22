import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateText,
  getOpenAIApiKey,
  isInsufficientQuota,
  OpenAIProviderError,
} from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    // Find last complete object
    const lastClose = s.lastIndexOf("}");
    if (lastClose > 0) s = s.substring(0, lastClose + 1) + "]";
  }

  try { return JSON.parse(s); } catch (e) {
    throw new Error(`JSON repair failed: ${(e as Error).message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { bookId, startOrder, count = 25 } = await req.json();

    if (!bookId || !startOrder) {
      return new Response(JSON.stringify({ error: "Missing bookId or startOrder" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership and get original language
    const { data: book } = await supabase
      .from("books").select("id, user_id, original_language").eq("id", bookId).single();
    if (!book || book.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found or not owned" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const originalLanguage = book.original_language || "en";

    // Get sentences in the requested window.
    const { data: sentences, error: fetchErr } = await supabase
      .from("sentences")
      .select("id, sentence_order, original_text, en_translation, ru_translation, sv_translation")
      .eq("book_id", bookId)
      .gte("sentence_order", startOrder)
      .lt("sentence_order", startOrder + count)
      .order("sentence_order", { ascending: true });

    if (fetchErr || !sentences || sentences.length === 0) {
      return new Response(JSON.stringify({ message: "No sentences in range", translated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const needsTranslation = (s: typeof sentences[number]) =>
      !s.en_translation || !s.ru_translation || !s.sv_translation;
    const untranslated = sentences.filter(needsTranslation);
    if (untranslated.length === 0) {
      return new Response(JSON.stringify({ message: "Already translated", translated: 0, complete: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Translating ${untranslated.length} sentences starting at order ${startOrder}`);

    const langNames: Record<string, string> = { en: "English", ru: "Russian", sv: "Swedish" };
    const sourceLang = langNames[originalLanguage] || "Russian";

    // Translate
    const prompt = `I have sentences written in ${sourceLang}. I need you to translate them.

IMPORTANT: The "en" field MUST contain the ENGLISH translation. The "ru" field MUST contain the RUSSIAN text. The "sv" field MUST contain the SWEDISH translation.
${originalLanguage === "ru" ? 'The original text is in Russian. You MUST translate it into English for the "en" field - do NOT copy the Russian text into "en".' : ''}
${originalLanguage === "en" ? 'The original text is in English. You MUST translate it into Russian for the "ru" field and Swedish for the "sv" field.' : ''}

Return ONLY a JSON array where each element has: {"n": 1, "en": "English text here", "ru": "Russian text here", "sv": "Swedish text here"}
The "n" field MUST echo the sentence number shown in brackets.
No extra text, no markdown fences. Just the JSON array.

Sentences to translate:
${untranslated.map((s, idx) => `[${idx + 1}] ${s.original_text}`).join("\n")}`;

    let translations: Array<{ n: unknown; en: unknown; ru: unknown; sv: unknown }>;
    try {
      let content = await generateText(openAIApiKey, prompt);
      if (!content) {
        console.error("No content in AI response");
        return new Response(JSON.stringify({ error: "AI returned empty content" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (content.startsWith("```")) {
        content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const parsed = repairAndParseJson(content);
      if (!Array.isArray(parsed)) {
        console.error("AI response was not a JSON array");
        return new Response(JSON.stringify({ error: "Translation failed", details: "AI response was not a JSON array" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      translations = parsed as Array<{ n: unknown; en: unknown; ru: unknown; sv: unknown }>;
    } catch (aiErr) {
      console.error("AI translation failed:", aiErr);
      const status = isInsufficientQuota(aiErr)
        ? 402
        : aiErr instanceof OpenAIProviderError && aiErr.status === 429
          ? 429
          : 500;
      return new Response(JSON.stringify({ error: "Translation failed", details: String(aiErr) }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update each sentence with translations
    let updated = 0;
    const applied = new Set<number>();
    for (const t of translations) {
      const n = t && typeof t === "object" ? Number(t.n) : NaN;
      if (
        !Number.isInteger(n) ||
        n < 1 ||
        n > untranslated.length ||
        applied.has(n) ||
        typeof t.en !== "string" ||
        typeof t.ru !== "string" ||
        typeof t.sv !== "string" ||
        t.en.trim().length === 0 ||
        t.ru.trim().length === 0 ||
        t.sv.trim().length === 0
      ) {
        continue;
      }

      const { error: updateErr } = await supabase
        .from("sentences")
        .update({
          en_translation: t.en,
          ru_translation: t.ru,
          sv_translation: t.sv,
        })
        .eq("id", untranslated[n - 1].id);
      if (!updateErr) {
        updated++;
        applied.add(n);
      }
    }

    console.log(`Translated ${updated} sentences`);
    const complete = updated === untranslated.length;

    return new Response(
      JSON.stringify({ success: true, translated: updated, complete }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Translate batch error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
