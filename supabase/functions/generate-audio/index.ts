import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VOICE_MAP: Record<string, string> = {
  en: "JBFqnCBsd6RMkjVDRZzb", // George
  ru: "onwK4e9ZLuTAKqWW03F9", // Daniel
  sv: "TX3LPaxmHKxFdv7VOQHJ", // Liam
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
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

    // Verify user
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

    // Verify user owns the book
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

    // Fetch all sentences for this book
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

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ElevenLabs API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const voiceId = VOICE_MAP[language] || VOICE_MAP["en"];
    const langField = `${language}_translation` as const;

    // Check which audio files already exist
    const storagePath = `${bookId}/${language}`;
    const { data: existingFiles } = await adminClient.storage
      .from("audio")
      .list(storagePath);

    const existingSet = new Set(
      (existingFiles || []).map((f: { name: string }) => f.name)
    );

    // Filter sentences that need audio generation
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

    // Process in batches of 5
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

          const ttsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
            {
              method: "POST",
              headers: {
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text,
                model_id: "eleven_turbo_v2_5",
                voice_settings: {
                  stability: 0.6,
                  similarity_boost: 0.75,
                  speed: 1.0,
                },
              }),
            }
          );

          if (!ttsResponse.ok) {
            const errText = await ttsResponse.text();
            throw new Error(`TTS failed for sentence ${sentence.sentence_order}: ${ttsResponse.status} ${errText}`);
          }

          const audioBuffer = await ttsResponse.arrayBuffer();
          const fileName = `${String(sentence.sentence_order).padStart(5, "0")}.mp3`;
          const filePath = `${storagePath}/${fileName}`;

          const { error: uploadError } = await adminClient.storage
            .from("audio")
            .upload(filePath, audioBuffer, {
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
