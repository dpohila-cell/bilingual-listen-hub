import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Text utilities ──────────────────────────────────────────────

function stripNullBytes(text: string): string {
  return text.replace(/\0/g, "");
}

function stripHtmlTags(html: string): string {
  // Remove scripts and styles entirely
  let clean = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Replace block-level tags with newlines
  clean = clean.replace(/<\/(p|div|h[1-6]|li|br|tr|blockquote)>/gi, "\n");
  clean = clean.replace(/<br\s*\/?>/gi, "\n");
  // Remove remaining tags
  clean = clean.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return clean;
}

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

// ── Encoding detection for plain text ───────────────────────────

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
  } catch { /* fallback */ }

  try { return new TextDecoder("windows-1251").decode(bytes); } catch { /* fallback */ }
  try { return new TextDecoder("koi8-r").decode(bytes); } catch { /* fallback */ }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// ── EPUB extraction ─────────────────────────────────────────────

function isEpub(bytes: Uint8Array): boolean {
  // ZIP magic: PK\x03\x04
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function extractTextFromEpub(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const files = unzipSync(bytes);

  // 1. Find the OPF (content.opf) via container.xml
  let opfPath = "";
  const containerPath = Object.keys(files).find((f) =>
    f.toLowerCase() === "meta-inf/container.xml"
  );

  if (containerPath) {
    const containerXml = new TextDecoder("utf-8").decode(files[containerPath]);
    const match = containerXml.match(/full-path="([^"]+\.opf)"/i);
    if (match) opfPath = match[1];
  }

  // 2. Parse OPF to get reading order (spine + manifest)
  let orderedFiles: string[] = [];
  const opfDir = opfPath ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  if (opfPath && files[opfPath]) {
    const opfXml = new TextDecoder("utf-8").decode(files[opfPath]);

    // Extract manifest items: id -> href
    const manifest: Record<string, string> = {};
    const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*/gi;
    let m;
    while ((m = itemRegex.exec(opfXml)) !== null) {
      manifest[m[1]] = m[2];
    }

    // Extract spine order
    const spineRegex = /<itemref\s+[^>]*idref="([^"]+)"/gi;
    while ((m = spineRegex.exec(opfXml)) !== null) {
      const href = manifest[m[1]];
      if (href) {
        orderedFiles.push(opfDir + href);
      }
    }
  }

  // 3. Fallback: sort xhtml/html files alphabetically
  if (orderedFiles.length === 0) {
    orderedFiles = Object.keys(files)
      .filter((f) => /\.(x?html?|htm)$/i.test(f))
      .sort();
  }

  // 4. Extract text from each file in order
  const textParts: string[] = [];
  for (const path of orderedFiles) {
    // Try exact path and also normalized path
    const data = files[path] || files[decodeURIComponent(path)];
    if (!data) continue;
    const html = new TextDecoder("utf-8").decode(data);
    const text = stripHtmlTags(html).trim();
    if (text.length > 0) textParts.push(text);
  }

  return textParts.join("\n\n");
}

// ── Translation ─────────────────────────────────────────────────

async function translateBatch(
  sentences: string[],
  lovableApiKey: string,
  originalLanguage: string = "en"
): Promise<Array<{ en: string; ru: string; sv: string }>> {
  const langNames: Record<string, string> = { en: "English", ru: "Russian", sv: "Swedish" };
  const sourceLang = langNames[originalLanguage] || "Russian";

  const prompt = `I have sentences written in ${sourceLang}. I need you to translate them.

IMPORTANT: The "en" field MUST contain the ENGLISH translation. The "ru" field MUST contain the RUSSIAN text. The "sv" field MUST contain the SWEDISH translation.
${originalLanguage === "ru" ? 'The original text is in Russian. You MUST translate it into English for the "en" field - do NOT copy the Russian text into "en".' : ""}
${originalLanguage === "en" ? 'The original text is in English. You MUST translate it into Russian for the "ru" field and Swedish for the "sv" field.' : ""}

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
      console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
      return sentences.map((s) => ({ en: s, ru: s, sv: s }));
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error("No content from AI");
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

// ── FB2 extraction ──────────────────────────────────────────────

function isFb2Xml(text: string): boolean {
  return /<FictionBook[\s>]/i.test(text.substring(0, 500));
}

function extractTextFromFb2(xml: string): string {
  // Extract <body> content (FB2 can have multiple bodies; main is first)
  const bodyRegex = /<body[^>]*>([\s\S]*?)<\/body>/gi;
  const parts: string[] = [];
  let m;
  while ((m = bodyRegex.exec(xml)) !== null) {
    parts.push(m[1]);
  }
  if (parts.length === 0) return "";

  const bodyHtml = parts.join("\n\n");
  return stripHtmlTags(bodyHtml).trim();
}

// ── Main handler ────────────────────────────────────────────────

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
    const bytes = new Uint8Array(rawBuffer);

    // Extract text: EPUB (ZIP), FB2 (XML), or plain text
    let text: string;
    if (isEpub(bytes)) {
      console.log("Detected EPUB format, extracting...");
      text = extractTextFromEpub(rawBuffer);
    } else {
      // Decode as text first, then check if it's FB2 XML
      text = decodeText(rawBuffer);
      if (isFb2Xml(text)) {
        console.log("Detected FB2 format, extracting...");
        text = extractTextFromFb2(text);
      }
    }

    // Strip null bytes that break Postgres
    text = stripNullBytes(text);

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
        original_text: stripNullBytes(s),
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

    // Fire-and-forget: translate remaining sentences in the background
    if (sentences.length > 25) {
      console.log(`Triggering background translation for remaining ${sentences.length - 25} sentences`);
      try {
        const bgResponse = await fetch(
          `${supabaseUrl}/functions/v1/translate-all`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
              "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
            },
            body: JSON.stringify({ bookId }),
          }
        );
        console.log(`translate-all triggered, status: ${bgResponse.status}`);
      } catch (bgErr) {
        console.error("Failed to trigger background translation:", bgErr);
      }
    }

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
