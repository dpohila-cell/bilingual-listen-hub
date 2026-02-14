import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

const VOICE_MAP: Record<string, string> = {
  en: "en-US-GuyNeural",
  ru: "ru-RU-DmitryNeural",
  sv: "sv-SE-MattiasNeural",
};

function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function dateToString(): string {
  const d = new Date();
  return d.toUTCString();
}

function buildSSML(text: string, voice: string, rate = "+0%", volume = "+0%", pitch = "+0Hz"): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
    `${escaped}` +
    `</prosody></voice></speak>`;
}

async function synthesize(text: string, voice: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    const ws = new WebSocket(WSS_URL);
    const audioChunks: Uint8Array[] = [];
    let audioStarted = false;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("TTS timeout after 30s"));
    }, 30000);

    ws.onopen = () => {
      // Send config message
      const configMsg =
        `X-Timestamp:${dateToString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });
      ws.send(configMsg);

      // Send SSML request
      const ssml = buildSSML(text, voice);
      const ssmlMsg =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${dateToString()}\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMsg);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();
          // Concatenate audio chunks
          const totalLen = audioChunks.reduce((acc, c) => acc + c.length, 0);
          const result = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of audioChunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(result);
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Binary message: audio data
        const view = new Uint8Array(event.data);
        // Find the separator between header and audio data
        // Header ends with \r\n\r\n in binary
        const headerEnd = findHeaderEnd(view);
        if (headerEnd >= 0) {
          audioChunks.push(view.slice(headerEnd));
          audioStarted = true;
        } else if (audioStarted) {
          audioChunks.push(view);
        }
      } else if (event.data instanceof Blob) {
        // Handle Blob data
        event.data.arrayBuffer().then((ab: ArrayBuffer) => {
          const view = new Uint8Array(ab);
          const headerEnd = findHeaderEnd(view);
          if (headerEnd >= 0) {
            audioChunks.push(view.slice(headerEnd));
            audioStarted = true;
          } else if (audioStarted) {
            audioChunks.push(view);
          }
        });
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err}`));
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (audioChunks.length === 0) {
        reject(new Error(`WebSocket closed without audio. Code: ${event.code}`));
      }
    };
  });
}

function findHeaderEnd(data: Uint8Array): number {
  // Look for the pattern: 0x00 0x00 after the 2-byte header length
  // Edge TTS binary messages start with a 2-byte big-endian header length
  if (data.length < 2) return -1;
  const headerLen = (data[0] << 8) | data[1];
  if (data.length > headerLen + 2) {
    return headerLen + 2;
  }
  return -1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { bookId, language } = await req.json();
    if (!bookId || !language) {
      return new Response(JSON.stringify({ error: "Missing bookId or language" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify ownership
    const { data: book, error: bookError } = await adminClient
      .from("books")
      .select("id, user_id")
      .eq("id", bookId)
      .single();

    if (bookError || !book || book.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Book not found or not owned" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch sentences
    const { data: sentences, error: sentError } = await adminClient
      .from("sentences")
      .select("id, sentence_order, original_text, en_translation, ru_translation, sv_translation")
      .eq("book_id", bookId)
      .order("sentence_order", { ascending: true });

    if (sentError || !sentences || sentences.length === 0) {
      return new Response(JSON.stringify({ error: "No sentences found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const voice = VOICE_MAP[language] || VOICE_MAP["en"];
    const storagePath = `${bookId}/${language}`;

    // Check existing files
    const { data: existingFiles } = await adminClient.storage
      .from("audio")
      .list(storagePath);

    const existingSet = new Set(
      (existingFiles || []).map((f: { name: string }) => f.name)
    );

    const toGenerate = sentences.filter((s) => {
      const fileName = `${String(s.sentence_order).padStart(5, "0")}.mp3`;
      return !existingSet.has(fileName);
    });

    if (toGenerate.length === 0) {
      return new Response(
        JSON.stringify({ message: "All audio already generated", total: sentences.length, generated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process in batches of 3 (conservative for WebSocket connections)
    const BATCH_SIZE = 3;
    let generated = 0;
    const errors: string[] = [];

    for (let i = 0; i < toGenerate.length; i += BATCH_SIZE) {
      const batch = toGenerate.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (sentence) => {
          const text =
            language === "en" ? (sentence.en_translation || sentence.original_text) :
            language === "ru" ? (sentence.ru_translation || sentence.original_text) :
            language === "sv" ? (sentence.sv_translation || sentence.original_text) :
            sentence.original_text;

          if (!text || text.trim().length === 0) return;

          const audioData = await synthesize(text, voice);

          const fileName = `${String(sentence.sentence_order).padStart(5, "0")}.mp3`;
          const filePath = `${storagePath}/${fileName}`;

          const { error: uploadError } = await adminClient.storage
            .from("audio")
            .upload(filePath, audioData, {
              contentType: "audio/mpeg",
              upsert: true,
            });

          if (uploadError) {
            throw new Error(`Upload failed for ${fileName}: ${uploadError.message}`);
          }

          generated++;
        })
      );

      for (const r of results) {
        if (r.status === "rejected") {
          console.error(r.reason);
          errors.push(String(r.reason));
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Audio generation complete",
        total: sentences.length,
        generated,
        skipped: sentences.length - toGenerate.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-audio:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
