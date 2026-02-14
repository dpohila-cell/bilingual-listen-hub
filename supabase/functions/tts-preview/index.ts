import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LANG_CODE_MAP: Record<string, string> = {
  en: "en-US",
  ru: "ru-RU",
  sv: "sv-SE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!GOOGLE_TTS_API_KEY) {
      return new Response("TTS not configured", { status: 500, headers: corsHeaders });
    }

    const { text, voice, language } = await req.json();
    if (!text || !voice || !language) {
      return new Response("Missing params", { status: 400, headers: corsHeaders });
    }

    const languageCode = LANG_CODE_MAP[language] || "en-US";

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, name: voice },
          audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return new Response(err, { status: 500, headers: corsHeaders });
    }

    const result = await response.json();
    const binaryString = atob(result.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Response(bytes, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    return new Response(error.message, { status: 500, headers: corsHeaders });
  }
});
