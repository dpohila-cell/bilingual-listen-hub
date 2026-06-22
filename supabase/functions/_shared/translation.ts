import { generateText } from "./openai.ts";

export function repairAndParseJson(raw: string): unknown {
  // Strip control chars except newlines/tabs
  let s = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("");
  try { return JSON.parse(s); } catch { /* continue */ }

  // Fix trailing commas
  s = s.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  // If truncated array/object, close it
  if (s.startsWith("[") && !s.endsWith("]")) {
    // Find last complete object
    const lastClose = s.lastIndexOf("}");
    if (lastClose > 0) s = s.substring(0, lastClose + 1) + "]";
  }

  try { return JSON.parse(s); } catch (e) {
    throw new Error(`JSON repair failed: ${(e as Error).message}`);
  }
}

export async function translateTexts(
  apiKey: string,
  texts: string[],
  originalLanguage: string,
): Promise<Array<{ en: string; ru: string; sv: string } | null>> {
  const langNames: Record<string, string> = { en: "English", ru: "Russian", sv: "Swedish" };
  const sourceLang = langNames[originalLanguage] || "Russian";

  const prompt = `I have sentences written in ${sourceLang}. I need you to translate them.

IMPORTANT: The "en" field MUST contain the ENGLISH translation. The "ru" field MUST contain the RUSSIAN text. The "sv" field MUST contain the SWEDISH translation.
${originalLanguage === "ru" ? 'The original text is in Russian. You MUST translate it into English for the "en" field - do NOT copy the Russian text into "en".' : ''}
${originalLanguage === "en" ? 'The original text is in English. You MUST translate it into Russian for the "ru" field and Swedish for the "sv" field.' : ''}

Return ONLY a JSON array where each element has: {"n": 1, "en": "English text here", "ru": "Russian text here", "sv": "Swedish text here"}
The "n" field MUST echo the sentence number shown in brackets.
No extra text, no markdown fences. Just the JSON array.

Sentences to translate:
${texts.map((text, idx) => `[${idx + 1}] ${text}`).join("\n")}`;

  let content = await generateText(apiKey, prompt);
  if (!content) {
    throw new Error("AI returned empty content");
  }
  if (content.startsWith("```")) {
    content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = repairAndParseJson(content);
  if (!Array.isArray(parsed)) {
    throw new Error("AI response was not a JSON array");
  }

  const out: Array<{ en: string; ru: string; sv: string } | null> = new Array(texts.length).fill(null);
  const applied = new Set<number>();
  for (const t of parsed as Array<{ n?: unknown; en?: unknown; ru?: unknown; sv?: unknown } | null | undefined>) {
    const n = Number(t?.n);
    const en = t?.en;
    const ru = t?.ru;
    const sv = t?.sv;
    if (
      Number.isInteger(n) &&
      n >= 1 &&
      n <= texts.length &&
      !applied.has(n) &&
      typeof en === "string" &&
      typeof ru === "string" &&
      typeof sv === "string" &&
      en.trim().length > 0 &&
      ru.trim().length > 0 &&
      sv.trim().length > 0
    ) {
      out[n - 1] = { en, ru, sv };
      applied.add(n);
    }
  }

  return out;
}
