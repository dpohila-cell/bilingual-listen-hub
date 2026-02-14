import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?…»"])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

// Detect if bytes are valid UTF-8; if not, decode as Windows-1251
function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // Try UTF-8 first
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Check if it has actual content (not just question marks / replacement chars)
    const questionMarkRatio = (utf8.match(/\uFFFD/g) || []).length / utf8.length;
    if (questionMarkRatio < 0.1) {
      return utf8;
    }
  } catch {
    // UTF-8 decoding failed, try other encodings
  }

  // Try Windows-1251 (common for Russian text)
  try {
    return new TextDecoder("windows-1251").decode(bytes);
  } catch {
    // Fallback
  }

  // Try KOI8-R
  try {
    return new TextDecoder("koi8-r").decode(bytes);
  } catch {
    // Final fallback: lossy UTF-8
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
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
    const { bookId, filePath } = await req.json();

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
    const rawBytes = new Uint8Array(rawBuffer);
    console.log("First 20 bytes hex:", Array.from(rawBytes.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log("First 20 bytes decimal:", Array.from(rawBytes.slice(0, 20)).join(', '));
    const text = decodeText(rawBuffer);
    console.log("Decoded text first 100 chars:", JSON.stringify(text.substring(0, 100)));
    let sentences = splitIntoSentences(text);

    if (sentences.length === 0) {
      await supabase.from("books").update({ status: "error" }).eq("id", bookId);
      return new Response(JSON.stringify({ error: "No sentences found in file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit sentences to avoid timeout
    const MAX_SENTENCES = 100;
    const truncated = sentences.length > MAX_SENTENCES;
    if (truncated) {
      sentences = sentences.slice(0, MAX_SENTENCES);
    }

    // Delete any existing sentences for this book (in case of retry)
    await supabase.from("sentences").delete().eq("book_id", bookId);

    // Process in batches of 10 sentences for translation
    const BATCH_SIZE = 10;
    const allRows: Array<{
      book_id: string;
      sentence_order: number;
      original_text: string;
      en_translation: string;
      ru_translation: string;
      sv_translation: string;
    }> = [];

    for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
      const batch = sentences.slice(i, i + BATCH_SIZE);
      const prompt = `Translate each sentence below into English, Russian, and Swedish.
Return ONLY a JSON array where each element has: {"en": "...", "ru": "...", "sv": "..."}
No extra text, no markdown fences. Just the JSON array.

Sentences:
${batch.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}`;

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

        const aiData = await aiResponse.json();
        let translations: Array<{ en: string; ru: string; sv: string }>;

        try {
          let content = aiData.choices[0].message.content.trim();
          if (content.startsWith("```")) {
            content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          translations = JSON.parse(content);
        } catch {
          translations = batch.map((s) => ({ en: s, ru: s, sv: s }));
        }

        for (let j = 0; j < batch.length; j++) {
          const t = translations[j] || { en: batch[j], ru: batch[j], sv: batch[j] };
          allRows.push({
            book_id: bookId,
            sentence_order: i + j + 1,
            original_text: batch[j],
            en_translation: t.en,
            ru_translation: t.ru,
            sv_translation: t.sv,
          });
        }
      } catch (err) {
        console.error(`Translation batch ${i} failed:`, err);
        // Fallback: use original text
        for (let j = 0; j < batch.length; j++) {
          allRows.push({
            book_id: bookId,
            sentence_order: i + j + 1,
            original_text: batch[j],
            en_translation: batch[j],
            ru_translation: batch[j],
            sv_translation: batch[j],
          });
        }
      }
    }

    // Insert sentences
    const { error: insertError } = await supabase.from("sentences").insert(allRows);
    if (insertError) {
      console.error("Insert error:", insertError);
      await supabase.from("books").update({ status: "error" }).eq("id", bookId);
      return new Response(JSON.stringify({ error: "Failed to save sentences" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("books")
      .update({ status: "ready", sentence_count: allRows.length })
      .eq("id", bookId);

    return new Response(
      JSON.stringify({ success: true, sentenceCount: allRows.length, truncated }),
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
