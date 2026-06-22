import { describe, expect, it } from "vitest";
import { splitIntoSentences } from "../../supabase/functions/_shared/text.ts";

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
