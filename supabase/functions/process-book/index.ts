import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function splitIntoSentences(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

  return normalized
    .split(/(?<=[.!?…»"])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
}

function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    const swapped = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length - 1; i += 2) {
      swapped[i] = bytes[i + 1];
      swapped[i + 1] = bytes[i];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const questionMarkRatio = (utf8.match(/\uFFFD/g) || []).length / utf8.length;
    if (questionMarkRatio < 0.1) return utf8;
  } catch {}

  try { return new TextDecoder("windows-1251").decode(bytes); } catch {}
  try { return new TextDecoder("koi8-r").decode(bytes); } catch {}
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function translateBatch(
  sentences: string[],
  lovableApiKey: string,
  originalLanguage: string = "en"
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
${sentences.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}`;

  try {
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      }
    );

    if (!aiResponse.ok) {
      console.error("AI gateway error in process-book:", aiResponse.status, await aiResponse.text());
      return sentences.map((s) => ({ en: s, ru: s, sv: s }));
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error("No content from AI in process-book");
      return sentences.map((s) => ({ en: s, ru: s, sv: s }));
    }
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(content);
  } catch {
    return sentences.map((s) => ({ en: s, ru: s, sv: s }));
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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { bookId, filePath, originalLanguage } = await req.json();

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("ebooks")
      .download(filePath);
    if (downloadError || !fileData) {
      await supabase.from("books").update({ status: "error" }).eq("id", bookId);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBuffer = await fileData.arrayBuffer();
    const text = decodeText(rawBuffer);
    const sentences = splitIntoSentences(text);

    if (sentences.length === 0) {
      await supabase.from("books").update({ status: "error" }).eq("id", bookId);
      return new Response(JSON.stringify({ error: "No sentences found in file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Total sentences found: ${sentences.length}`);

    // Delete any existing sentences for this book (in case of retry)
    await supabase.from("sentences").delete().eq("book_id", bookId);

    // Step 1: Save ALL sentences with original text only (no translations yet)
    const SAVE_BATCH = 500;
    for (let i = 0; i < sentences.length; i += SAVE_BATCH) {
      const batch = sentences.slice(i, i + SAVE_BATCH);
      const rows = batch.map((s, j) => ({
        book_id: bookId,
        sentence_order: i + j + 1,
        original_text: s,
        en_translation: null,
        ru_translation: null,
        sv_translation: null,
      }));
      const { error: insertError } = await supabase.from("sentences").insert(rows);
      if (insertError) console.error(`Insert error at ${i}:`, insertError);
    }

    console.log(`All ${sentences.length} originals saved. Translating first 25...`);

    // Step 2: Translate only the first 25 sentences
    const firstBatch = sentences.slice(0, 25);
    const translations = await translateBatch(firstBatch, lovableApiKey, originalLanguage || "en");

    for (let j = 0; j < firstBatch.length; j++) {
      const t = translations[j] || { en: firstBatch[j], ru: firstBatch[j], sv: firstBatch[j] };
      await supabase
        .from("sentences")
        .update({
          en_translation: t.en,
          ru_translation: t.ru,
          sv_translation: t.sv,
        })
        .eq("book_id", bookId)
        .eq("sentence_order", j + 1);
    }

    await supabase
      .from("books")
      .update({ status: "ready", sentence_count: sentences.length })
      .eq("id", bookId);

    return new Response(
      JSON.stringify({ success: true, sentenceCount: sentences.length, translated: firstBatch.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Process book error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
