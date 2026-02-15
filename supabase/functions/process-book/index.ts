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
  let clean = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  clean = clean.replace(/<\/(p|div|h[1-6]|li|br|tr|blockquote)>/gi, "\n");
  clean = clean.replace(/<br\s*\/?>/gi, "\n");
  clean = clean.replace(/<[^>]+>/g, "");
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

function stripXmlTags(xml: string): string {
  // Remove XML processing instructions and comments
  let clean = xml.replace(/<\?[^?]*\?>/g, "");
  clean = clean.replace(/<!--[\s\S]*?-->/g, "");
  // Replace paragraph/break tags with newlines
  clean = clean.replace(/<\/w:p>/gi, "\n");
  clean = clean.replace(/<w:br[^>]*\/>/gi, "\n");
  clean = clean.replace(/<w:tab[^>]*\/>/gi, " ");
  // Remove all remaining tags
  clean = clean.replace(/<[^>]+>/g, "");
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

// ── Format detection ────────────────────────────────────────────

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function isOle2(bytes: Uint8Array): boolean {
  // OLE2 Compound Document magic: D0 CF 11 E0 A1 B1 1A E1
  return bytes.length > 8 &&
    bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 &&
    bytes[4] === 0xA1 && bytes[5] === 0xB1 && bytes[6] === 0x1A && bytes[7] === 0xE1;
}

function isPdf(bytes: Uint8Array): boolean {
  // %PDF
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isMobi(bytes: Uint8Array): boolean {
  if (bytes.length < 68) return false;
  const type = String.fromCharCode(bytes[60], bytes[61], bytes[62], bytes[63]);
  const creator = String.fromCharCode(bytes[64], bytes[65], bytes[66], bytes[67]);
  return (type === "BOOK" && creator === "MOBI") || (type === "MOBI");
}

// ── MOBI/PalmDoc extraction ─────────────────────────────────────

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function palmDocDecompress(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;
  while (i < data.length) {
    const byte = data[i++];
    if (byte === 0) {
      // Literal null
      output.push(0);
    } else if (byte >= 1 && byte <= 8) {
      // Copy next 'byte' bytes as-is
      for (let j = 0; j < byte && i < data.length; j++) {
        output.push(data[i++]);
      }
    } else if (byte >= 0x09 && byte <= 0x7F) {
      // Literal byte
      output.push(byte);
    } else if (byte >= 0xC0) {
      // Space + lower 7 bits as character
      output.push(0x20);
      output.push(byte & 0x7F);
    } else {
      // 0x80-0xBF: LZ77 distance-length pair (2 bytes)
      if (i >= data.length) break;
      const next = data[i++];
      const combined = (byte << 8) | next;
      const dist = (combined >> 3) & 0x7FF;
      const len = (combined & 0x07) + 3;
      if (dist > 0) {
        for (let j = 0; j < len; j++) {
          const srcIdx = output.length - dist;
          if (srcIdx >= 0) {
            output.push(output[srcIdx]);
          }
        }
      }
    }
  }
  return new Uint8Array(output);
}

function extractTextFromMobi(bytes: Uint8Array): string {
  // PalmDB header: 78 bytes
  // Number of records at offset 76
  const numRecords = readUint16BE(bytes, 76);
  if (numRecords < 2) return "";

  // Record info list starts at offset 78, each entry is 8 bytes (offset:4, attrs:1, id:3)
  const recordOffsets: number[] = [];
  for (let i = 0; i < numRecords; i++) {
    recordOffsets.push(readUint32BE(bytes, 78 + i * 8));
  }

  // Record 0 is the PalmDoc/MOBI header
  const rec0Start = recordOffsets[0];
  const compression = readUint16BE(bytes, rec0Start); // 1=none, 2=PalmDoc, 17480=HUFF/CDIC
  const textRecordCount = readUint16BE(bytes, rec0Start + 8);
  const textEncoding = readUint32BE(bytes, rec0Start + 28); // In MOBI header: 0x10 offset from rec0 + 16 = MOBI magic

  // Check MOBI magic at rec0Start + 16
  const hasMobiHeader = bytes.length > rec0Start + 20 &&
    bytes[rec0Start + 16] === 0x4D && bytes[rec0Start + 17] === 0x4F &&
    bytes[rec0Start + 18] === 0x42 && bytes[rec0Start + 19] === 0x49;

  // Encoding: read from MOBI header at rec0Start + 28 (relative to MOBI start at rec0Start + 16)
  // MOBI header offset 28 = encoding (65001=UTF-8, 1252=CP1252)
  let encoding = "utf-8";
  if (hasMobiHeader) {
    const mobiEncoding = readUint32BE(bytes, rec0Start + 16 + 28);
    if (mobiEncoding === 1252) encoding = "windows-1252";
  }

  // Extract text records (records 1..textRecordCount)
  const actualTextRecords = Math.min(textRecordCount, numRecords - 1);
  const textParts: string[] = [];

  for (let i = 1; i <= actualTextRecords; i++) {
    const start = recordOffsets[i];
    const end = i + 1 < numRecords ? recordOffsets[i + 1] : bytes.length;
    const recordData = bytes.slice(start, end);

    let decompressed: Uint8Array;
    if (compression === 2) {
      decompressed = palmDocDecompress(recordData);
    } else if (compression === 1) {
      decompressed = recordData;
    } else {
      // HUFF/CDIC or unknown — skip
      console.warn(`Unsupported MOBI compression: ${compression}`);
      decompressed = recordData;
    }

    try {
      textParts.push(new TextDecoder(encoding, { fatal: false }).decode(decompressed));
    } catch {
      textParts.push(new TextDecoder("utf-8", { fatal: false }).decode(decompressed));
    }
  }

  const rawText = textParts.join("");
  // MOBI text often contains HTML
  return stripHtmlTags(rawText).trim();
}

// ── EPUB extraction ─────────────────────────────────────────────

function extractTextFromEpub(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const files = unzipSync(bytes);

  let opfPath = "";
  const containerPath = Object.keys(files).find((f) =>
    f.toLowerCase() === "meta-inf/container.xml"
  );

  if (containerPath) {
    const containerXml = new TextDecoder("utf-8").decode(files[containerPath]);
    const match = containerXml.match(/full-path="([^"]+\.opf)"/i);
    if (match) opfPath = match[1];
  }

  let orderedFiles: string[] = [];
  const opfDir = opfPath ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  if (opfPath && files[opfPath]) {
    const opfXml = new TextDecoder("utf-8").decode(files[opfPath]);
    const manifest: Record<string, string> = {};
    const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*/gi;
    let m;
    while ((m = itemRegex.exec(opfXml)) !== null) {
      manifest[m[1]] = m[2];
    }

    const spineRegex = /<itemref\s+[^>]*idref="([^"]+)"/gi;
    while ((m = spineRegex.exec(opfXml)) !== null) {
      const href = manifest[m[1]];
      if (href) {
        orderedFiles.push(opfDir + href);
      }
    }
  }

  if (orderedFiles.length === 0) {
    orderedFiles = Object.keys(files)
      .filter((f) => /\.(x?html?|htm)$/i.test(f))
      .sort();
  }

  const textParts: string[] = [];
  for (const path of orderedFiles) {
    const data = files[path] || files[decodeURIComponent(path)];
    if (!data) continue;
    const html = new TextDecoder("utf-8").decode(data);
    const text = stripHtmlTags(html).trim();
    if (text.length > 0) textParts.push(text);
  }

  return textParts.join("\n\n");
}

// ── DOCX extraction ─────────────────────────────────────────────

function isDocx(files: Record<string, Uint8Array>): boolean {
  return Object.keys(files).some((f) => f === "word/document.xml" || f === "word/document.xml".toLowerCase());
}

function extractTextFromDocx(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const files = unzipSync(bytes);

  // Find word/document.xml
  const docPath = Object.keys(files).find(
    (f) => f.toLowerCase() === "word/document.xml"
  );
  if (!docPath || !files[docPath]) return "";

  const xml = new TextDecoder("utf-8").decode(files[docPath]);
  return stripXmlTags(xml).trim();
}

// ── FB2 extraction ──────────────────────────────────────────────

function isFb2Xml(text: string): boolean {
  return /<FictionBook[\s>]/i.test(text.substring(0, 500));
}

function extractTextFromFb2(xml: string): string {
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

// ── DOC (OLE2) native text extraction ───────────────────────────

function extractTextFromDoc(bytes: Uint8Array): string {
  // OLE2 Compound Binary File: extract raw text by scanning for readable text runs
  // DOC files store text in the "WordDocument" stream, but parsing the full OLE2
  // structure is complex. Instead, we extract all readable text sequences.
  
  const textParts: string[] = [];
  
  // Try to find UTF-16LE text runs (Word stores text as UTF-16LE)
  let i = 0;
  let currentRun: number[] = [];
  
  while (i < bytes.length - 1) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    
    // Check if this is a printable UTF-16LE character
    if (hi === 0 && ((lo >= 0x20 && lo <= 0x7E) || lo === 0x0A || lo === 0x0D || lo === 0x09)) {
      // ASCII range in UTF-16LE
      currentRun.push(lo);
      i += 2;
    } else if (hi === 0x04 && lo >= 0x10 && lo <= 0x4F) {
      // Cyrillic range U+0410-U+044F in UTF-16LE
      currentRun.push(lo | (hi << 8));
      i += 2;
    } else if (hi === 0x04 && (lo === 0x01 || lo === 0x51)) {
      // Cyrillic Ё (U+0401) and ё (U+0451)
      currentRun.push(lo | (hi << 8));
      i += 2;
    } else if (hi >= 0x00 && hi <= 0x05 && lo >= 0x20) {
      // Extended Latin/Cyrillic range
      const cp = lo | (hi << 8);
      if (cp >= 0x20) {
        currentRun.push(cp);
        i += 2;
      } else {
        if (currentRun.length > 10) {
          const decoded = String.fromCharCode(...currentRun);
          textParts.push(decoded);
        }
        currentRun = [];
        i += 2;
      }
    } else {
      // Non-text byte pair: flush current run if long enough
      if (currentRun.length > 10) {
        const decoded = String.fromCharCode(...currentRun);
        textParts.push(decoded);
      }
      currentRun = [];
      i += 2;
    }
  }
  
  // Flush last run
  if (currentRun.length > 10) {
    const decoded = String.fromCharCode(...currentRun);
    textParts.push(decoded);
  }
  
  // Join and clean up
  let result = textParts.join("\n");
  // Remove control characters except newlines/tabs
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  // Collapse excessive whitespace
  result = result.replace(/ {3,}/g, " ").replace(/\n{3,}/g, "\n\n");
  
  return result.trim();
}



async function extractTextWithAI(
  fileBytes: Uint8Array,
  mimeType: string,
  lovableApiKey: string
): Promise<string> {
  // Convert to base64
  const base64 = btoa(
    Array.from(fileBytes)
      .map((b) => String.fromCharCode(b))
      .join("")
  );

  const dataUrl = `data:${mimeType};base64,${base64}`;

  // Send to Gemini which supports PDF and document understanding
  const response = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract ALL text content from this document. Return ONLY the raw text, preserving paragraph structure. Do not add any commentary, headers, or formatting. Just the document's text content, paragraph by paragraph.`,
              },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 100000,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error(`AI extraction failed (${response.status}):`, errText);
    throw new Error(`AI extraction failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI returned empty content");
  return content;
}

// For large files, we chunk the base64 to stay within AI limits
async function extractTextFromPdfWithAI(
  bytes: Uint8Array,
  lovableApiKey: string
): Promise<string> {
  // Gemini supports up to ~20MB inline. For very large PDFs we try as-is.
  const maxSize = 15 * 1024 * 1024; // 15MB safety margin
  if (bytes.length > maxSize) {
    console.warn(`PDF is ${(bytes.length / 1024 / 1024).toFixed(1)}MB, may exceed AI limits`);
  }
  return await extractTextWithAI(bytes, "application/pdf", lovableApiKey);
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

// ── Detect format from file extension ───────────────────────────

function getFileExtension(filePath: string): string {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
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
    const ext = getFileExtension(filePath);

    // Extract text based on format
    let text: string;

    if (isPdf(bytes)) {
      // ── PDF: AI-based extraction ──
      console.log("Detected PDF format, extracting via AI...");
      text = await extractTextFromPdfWithAI(bytes, lovableApiKey);
    } else if (isZip(bytes)) {
      // ZIP-based formats: EPUB, DOCX, or FB2 inside ZIP
      const files = unzipSync(bytes);

      if (isDocx(files)) {
        console.log("Detected DOCX format, extracting...");
        text = extractTextFromDocx(rawBuffer);
      } else {
        // Assume EPUB
        console.log("Detected EPUB format, extracting...");
        text = extractTextFromEpub(rawBuffer);
      }
    } else if (isMobi(bytes) || ext === "mobi" || ext === "azw" || ext === "azw3") {
      // ── MOBI/AZW: native PalmDoc parser ──
      console.log("Detected MOBI/AZW format, extracting...");
      text = extractTextFromMobi(bytes);
    } else if (isOle2(bytes) || ext === "doc") {
      // ── DOC (OLE2): extract text natively from OLE2 compound document ──
      console.log("Detected DOC format, extracting text from OLE2...");
      text = extractTextFromDoc(bytes);
    } else {
      // Plain text or FB2
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

    // ── Auto-detect language from first ~10 sentences ──
    const sampleText = sentences.slice(0, 10).join(" ");
    let detectedLanguage = "en"; // fallback
    try {
      const detectResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{
              role: "user",
              content: `Detect the language of this text. Reply with ONLY the ISO 639-1 code (e.g. "en", "ru", "sv"). Nothing else.\n\n${sampleText.substring(0, 500)}`,
            }],
            temperature: 0,
            max_tokens: 5,
          }),
        }
      );
      if (detectResponse.ok) {
        const detectData = await detectResponse.json();
        const code = detectData.choices?.[0]?.message?.content?.trim().toLowerCase().replace(/[^a-z]/g, "");
        if (code && ["en", "ru", "sv"].includes(code)) {
          detectedLanguage = code;
        } else if (code) {
          console.log(`Detected unsupported language: ${code}, defaulting to en`);
        }
      }
    } catch (e) {
      console.error("Language detection failed, defaulting to en:", e);
    }
    console.log(`Detected language: ${detectedLanguage}`);

    // Update book with detected language
    await supabase.from("books").update({ original_language: detectedLanguage }).eq("id", bookId);

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
    const translations = await translateBatch(firstBatch, lovableApiKey, detectedLanguage);

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
