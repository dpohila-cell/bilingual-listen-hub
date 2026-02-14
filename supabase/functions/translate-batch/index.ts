import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

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

    // Verify ownership
    const { data: book } = await supabase
      .from("books").select("id, user_id").eq("id", bookId).single();
    if (!book || book.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found or not owned" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sentences that need translation (en_translation is null)
    const { data: sentences, error: fetchErr } = await supabase
      .from("sentences")
      .select("id, sentence_order, original_text, en_translation")
      .eq("book_id", bookId)
      .gte("sentence_order", startOrder)
      .lt("sentence_order", startOrder + count)
      .order("sentence_order", { ascending: true });

    if (fetchErr || !sentences || sentences.length === 0) {
      return new Response(JSON.stringify({ message: "No sentences in range", translated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter to only untranslated sentences
    const untranslated = sentences.filter((s) => !s.en_translation);
    if (untranslated.length === 0) {
      return new Response(JSON.stringify({ message: "Already translated", translated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Translating ${untranslated.length} sentences starting at order ${startOrder}`);

    // Translate
    const prompt = `Translate each sentence below into English, Russian, and Swedish.
Return ONLY a JSON array where each element has: {"en": "...", "ru": "...", "sv": "..."}
No extra text, no markdown fences. Just the JSON array.

Sentences:
${untranslated.map((s, idx) => `${idx + 1}. ${s.original_text}`).join("\n")}`;

    let translations: Array<{ en: string; ru: string; sv: string }>;
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
      let content = aiData.choices[0].message.content.trim();
      if (content.startsWith("```")) {
        content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      translations = JSON.parse(content);
    } catch {
      translations = untranslated.map((s) => ({ en: s.original_text, ru: s.original_text, sv: s.original_text }));
    }

    // Update each sentence with translations
    let updated = 0;
    for (let j = 0; j < untranslated.length; j++) {
      const t = translations[j] || { en: untranslated[j].original_text, ru: untranslated[j].original_text, sv: untranslated[j].original_text };
      const { error: updateErr } = await supabase
        .from("sentences")
        .update({
          en_translation: t.en,
          ru_translation: t.ru,
          sv_translation: t.sv,
        })
        .eq("id", untranslated[j].id);
      if (!updateErr) updated++;
    }

    console.log(`Translated ${updated} sentences`);

    return new Response(
      JSON.stringify({ success: true, translated: updated }),
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
