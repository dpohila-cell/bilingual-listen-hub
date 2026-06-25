import { describe, expect, it } from "vitest";
import {
  isExtractionUsable,
  looksLikeExtractionRefusal,
} from "../../supabase/functions/_shared/pdfText.ts";

describe("isExtractionUsable", () => {
  it("returns false for null input from scanned PDFs or parser failures", () => {
    expect(isExtractionUsable(null)).toBe(false);
  });

  it("returns false when most pages have no meaningful text", () => {
    expect(
      isExtractionUsable({
        text: "Chapter One. This is only a small amount of extracted text from one page.",
        totalPages: 20,
        pagesWithText: 2,
      }),
    ).toBe(false);
  });

  it("returns true for healthy text-layer extraction", () => {
    const text = Array.from(
      { length: 12 },
      (_, index) =>
        `Page ${index + 1}. This page contains normal book prose with enough words and letters to be useful for sentence splitting.`,
    ).join("\n\n");

    expect(
      isExtractionUsable({
        text,
        totalPages: 12,
        pagesWithText: 11,
      }),
    ).toBe(true);
  });

  it("returns false for empty text", () => {
    expect(
      isExtractionUsable({
        text: "",
        totalPages: 10,
        pagesWithText: 10,
      }),
    ).toBe(false);
  });
});

describe("looksLikeExtractionRefusal", () => {
  it("returns true for a short refusal apology", () => {
    expect(
      looksLikeExtractionRefusal(
        "I'm sorry, but I can't provide or reproduce copyrighted text from this PDF.",
      ),
    ).toBe(true);
  });

  it("returns false for a normal long paragraph containing sorry", () => {
    const text = Array.from(
      { length: 12 },
      () =>
        "The narrator said sorry in passing, then continued with ordinary public-domain style prose about the room, the weather, and the people arriving for dinner.",
    ).join(" ");

    expect(looksLikeExtractionRefusal(text)).toBe(false);
  });

  it("returns true for empty text", () => {
    expect(looksLikeExtractionRefusal("   ")).toBe(true);
  });

  it("returns false for a short legitimate sentence without refusal phrasing", () => {
    expect(looksLikeExtractionRefusal("Chapter One. The evening was quiet and clear.")).toBe(false);
  });
});
