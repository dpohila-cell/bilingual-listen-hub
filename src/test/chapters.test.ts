import { describe, expect, it } from "vitest";
import {
  extractEpubChapterTitle,
  parseFb2TopLevelSections,
  splitTextIntoChapters,
} from "../../supabase/functions/_shared/chapters.ts";

describe("splitTextIntoChapters", () => {
  it("splits only on isolated conservative chapter headings and keeps heading text", () => {
    const text = [
      "Preface text.",
      "",
      "Chapter 1 The Beginning",
      "First paragraph.",
      "",
      "Another paragraph.",
      "",
      "Глава II Продолжение",
      "Second paragraph.",
      "",
      "Final paragraph.",
    ].join("\n");

    expect(splitTextIntoChapters(text)).toEqual([
      { title: null, text: "Preface text.\n" },
      {
        title: "Chapter 1 The Beginning",
        text: "Chapter 1 The Beginning\nFirst paragraph.\n\nAnother paragraph.\n",
      },
      {
        title: "Глава II Продолжение",
        text: "Глава II Продолжение\nSecond paragraph.\n\nFinal paragraph.",
      },
    ]);
  });

  it("falls back to a single chapter when headings are suspiciously dense", () => {
    const text = Array.from({ length: 20 }, (_, index) => `Chapter ${index + 1}\nShort.`).join("\n\n");

    expect(splitTextIntoChapters(text)).toEqual([{ title: null, text }]);
  });
});

describe("parseFb2TopLevelSections", () => {
  it("returns only direct body sections and ignores nested section titles", () => {
    const xml = `
      <FictionBook>
        <body>
          <section>
            <title><p>Outer One</p></title>
            <p>Outer text.</p>
            <section>
              <title><p>Nested</p></title>
              <p>Nested text.</p>
            </section>
          </section>
          <section>
            <title><p>Outer Two</p></title>
            <p>More text.</p>
          </section>
        </body>
      </FictionBook>
    `;

    const sections = parseFb2TopLevelSections(xml);

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Outer One");
    expect(sections[0].innerXml).toContain("Nested text.");
    expect(sections[1].title).toBe("Outer Two");
  });

  it("supports titleless direct sections", () => {
    const xml = "<FictionBook><body><section><p>No title text.</p></section></body></FictionBook>";

    expect(parseFb2TopLevelSections(xml)).toEqual([
      { title: null, innerXml: "<p>No title text.</p>" },
    ]);
  });
});

describe("extractEpubChapterTitle", () => {
  it("uses the first h1-h3 heading after stripping nested tags", () => {
    expect(extractEpubChapterTitle("<p>Intro</p><h2><span>Chapter&nbsp;One</span></h2>")).toBe(
      "Chapter One",
    );
  });

  it("returns null when no h1-h3 heading exists", () => {
    expect(extractEpubChapterTitle("<h4>Too deep</h4><p>Text</p>")).toBeNull();
  });
});
