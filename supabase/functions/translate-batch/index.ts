import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getOpenAIApiKey,
  isInsufficientQuota,
  OpenAIProviderError,
} from "../_shared/openai.ts";
import { translateTexts } from "../_shared/translation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    let results: Array<{ en: string; ru: string; sv: string } | null>;
    try {
      results = await translateTexts(
        openAIApiKey,
        untranslated.map((s) => s.original_text),
        originalLanguage,
      );
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
    for (let i = 0; i < untranslated.length; i++) {
      const t = results[i];
      if (!t) continue;
      const { error: updateErr } = await supabase
        .from("sentences")
        .update({
          en_translation: t.en,
          ru_translation: t.ru,
          sv_translation: t.sv,
        })
        .eq("id", untranslated[i].id);
      if (!updateErr) {
        updated++;
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
