import { describe, expect, it } from "vitest";
import {
  sanitizeExtractedText,
  splitIntoSentences,
} from "../../supabase/functions/_shared/text.ts";

describe("splitIntoSentences", () => {
  it("returns trimmed non-empty sentences for a multi-sentence paragraph", () => {
    expect(splitIntoSentences("Hello world. How are you? I am fine!")).toEqual([
      "Hello world.",
      "How are you?",
      "I am fine!",
    ]);
  });

  it("handles empty and whitespace input", () => {
    expect(splitIntoSentences(" \n\t  ")).toEqual([]);
  });
});

describe("sanitizeExtractedText", () => {
  it("removes hidden extraction artifacts while preserving visible text and paragraphs", () => {
    const openingLine =
      "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.";
    const secondParagraph =
      "However little known the feelings or views of such a man may be on his first entering a neighbourhood.";

    const input =
      "\uFEFF" +
      openingLine
        .replace("truth", "tr\u200Buth")
        .replace("universally", "univer\u00ADsally")
        .replace("single man", "single\u00A0man")
        .replace("good fortune", "good\tfortune") +
      "\u0007\r\n" +
      "\n" +
      secondParagraph;

    const sanitized = sanitizeExtractedText(input);

    expect(sanitized).not.toMatch(/[\u200B\u00AD\u0000-\u0009\u000B-\u001F\u007F\u0080-\u009F\uFEFF]/);
    expect(sanitized).toContain("single man");
    expect(sanitized).toContain("good fortune");
    expect(sanitized).not.toContain("\u00A0");
    expect(sanitized).not.toContain("\t");
    expect(sanitized).not.toContain("\r\n");
    expect(sanitized).toContain("\n\n");
    expect(sanitized.split(/\n{2,}/)).toHaveLength(2);
    expect(sanitized).toContain(openingLine);
    expect(sanitized).toContain(secondParagraph);
  });
});
