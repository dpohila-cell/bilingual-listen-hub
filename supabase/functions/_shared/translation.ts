import { generateText } from "./openai.ts";
import { buildTranslationPrompt, mapTranslations, repairAndParseJson } from "./translationCore.ts";

export async function translateTexts(
  apiKey: string,
  texts: string[],
  originalLanguage: string,
): Promise<Array<{ en: string; ru: string; sv: string } | null>> {
  const prompt = buildTranslationPrompt(texts, originalLanguage);
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

  return mapTranslations(parsed, texts.length);
}
