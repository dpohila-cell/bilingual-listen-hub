import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_VOICES: Record<string, { languageCode: string; name: string }> = {
  en: { languageCode: "en-US", name: "en-US-Wavenet-D" },
  ru: { languageCode: "ru-RU", name: "ru-RU-Wavenet-B" },
  sv: { languageCode: "sv-SE", name: "sv-SE-Wavenet-A" },
};

const LANG_CODE_MAP: Record<string, string> = {
  en: "en-US",
  ru: "ru-RU",
  sv: "sv-SE",
};

async function synthesize(text: string, languageCode: string, voiceName: string, apiKey: string): Promise<Uint8Array> {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000 },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google TTS error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const binaryString = atob(result.audioContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

serve(async (req) => {
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

    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!GOOGLE_TTS_API_KEY) {
      console.error("Google TTS API key not configured");
      return new Response(JSON.stringify({ error: "Service unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { bookId, language, voice, forceRegenerate, startOrder, count } = await req.json();
    if (!bookId || !language) {
      return new Response(JSON.stringify({ error: "Missing bookId or language" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const batchStart = startOrder ?? 1;
    const batchCount = count ?? 10;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: book, error: bookError } = await adminClient
      .from("books").select("id, user_id, original_language").eq("id", bookId).single();

    if (bookError || !book || book.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Book not found or not owned" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bookOriginalLang = book.original_language || "en";

    const { data: sentences, error: sentError } = await adminClient
      .from("sentences")
      .select("id, sentence_order, original_text, en_translation, ru_translation, sv_translation")
      .eq("book_id", bookId)
      .gte("sentence_order", batchStart)
      .lt("sentence_order", batchStart + batchCount)
      .order("sentence_order", { ascending: true });

    if (sentError || !sentences || sentences.length === 0) {
      return new Response(JSON.stringify({ error: "No sentences found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use custom voice or default
    const defaultVoice = DEFAULT_VOICES[language] || DEFAULT_VOICES["en"];
    const voiceName = voice || defaultVoice.name;
    const languageCode = LANG_CODE_MAP[language] || defaultVoice.languageCode;

    const safeVoiceName = voiceName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${bookId}/${language}/${safeVoiceName}`;

    // If forceRegenerate, delete only the files in this batch range
    if (forceRegenerate && sentences.length > 0) {
      const filesToDelete = sentences.map((s) => {
        const fileName = `${String(s.sentence_order).padStart(5, "0")}.mp3`;
        return `${storagePath}/${fileName}`;
      });
      await adminClient.storage.from("audio").remove(filesToDelete);
    }

    const { data: existingFiles } = await adminClient.storage.from("audio").list(storagePath);
    const existingSet = new Set((existingFiles || []).map((f: { name: string }) => f.name));

    let skippedExisting = 0;
    let skippedMissingTranslation = 0;

    const toGenerate = sentences.filter((s) => {
      const fileName = `${String(s.sentence_order).padStart(5, "0")}.mp3`;
      if (existingSet.has(fileName)) {
        skippedExisting++;
        return false;
      }
      // If generating audio for the book's original language, original_text is fine
      if (language === bookOriginalLang) return true;
      // For other languages, skip if translation is not yet available
      const translationField = language === "en" ? s.en_translation : language === "sv" ? s.sv_translation : language === "ru" ? s.ru_translation : null;
      const hasTranslation = translationField != null && translationField.trim().length > 0;
      if (!hasTranslation) skippedMissingTranslation++;
      return hasTranslation;
    });

    if (toGenerate.length === 0) {
      return new Response(
        JSON.stringify({
          message: skippedMissingTranslation > 0
            ? "Translations not ready for audio generation"
            : "All audio already generated",
          total: sentences.length,
          generated: 0,
          skippedExisting,
          skippedMissingTranslation,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const BATCH_SIZE = 5;
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

          const audioData = await synthesize(text, languageCode, voiceName, GOOGLE_TTS_API_KEY);

          const fileName = `${String(sentence.sentence_order).padStart(5, "0")}.mp3`;
          const filePath = `${storagePath}/${fileName}`;

          const { error: uploadError } = await adminClient.storage
            .from("audio")
            .upload(filePath, audioData, { contentType: "audio/mpeg", upsert: true });

          if (uploadError) throw new Error(`Upload failed for ${fileName}: ${uploadError.message}`);
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
        skippedExisting,
        skippedMissingTranslation,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-audio:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
