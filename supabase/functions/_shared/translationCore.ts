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

export function buildTranslationPrompt(texts: string[], originalLanguage: string): string {
  const langNames: Record<string, string> = { en: "English", ru: "Russian", sv: "Swedish" };
  const sourceLang = langNames[originalLanguage] || "Russian";

  return `I have sentences written in ${sourceLang}. I need you to translate them.

IMPORTANT: The "en" field MUST contain the ENGLISH translation. The "ru" field MUST contain the RUSSIAN text. The "sv" field MUST contain the SWEDISH translation.
${originalLanguage === "ru" ? 'The original text is in Russian. You MUST translate it into English for the "en" field - do NOT copy the Russian text into "en".' : ''}
${originalLanguage === "en" ? 'The original text is in English. You MUST translate it into Russian for the "ru" field and Swedish for the "sv" field.' : ''}

Return ONLY a JSON array where each element has: {"n": 1, "en": "English text here", "ru": "Russian text here", "sv": "Swedish text here"}
The "n" field MUST echo the sentence number shown in brackets.
No extra text, no markdown fences. Just the JSON array.

Sentences to translate:
${texts.map((text, idx) => `[${idx + 1}] ${text}`).join("\n")}`;
}

export function mapTranslations(
  parsed: unknown,
  count: number,
): Array<{ en: string; ru: string; sv: string } | null> {
  const out: Array<{ en: string; ru: string; sv: string } | null> = new Array(count).fill(null);
  if (!Array.isArray(parsed)) return out;

  const applied = new Set<number>();
  for (const t of parsed as Array<{ n?: unknown; en?: unknown; ru?: unknown; sv?: unknown } | null | undefined>) {
    const n = Number(t?.n);
    const en = t?.en;
    const ru = t?.ru;
    const sv = t?.sv;
    if (
      Number.isInteger(n) &&
      n >= 1 &&
      n <= count &&
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
