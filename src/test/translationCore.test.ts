import { describe, expect, it } from "vitest";
import {
  mapTranslations,
  repairAndParseJson,
} from "../../supabase/functions/_shared/translationCore.ts";

const row = (n: number, suffix = `${n}`) => ({
  n,
  en: `English ${suffix}`,
  ru: `Russian ${suffix}`,
  sv: `Swedish ${suffix}`,
});

const mappedRow = (suffix: string | number) => ({
  en: `English ${suffix}`,
  ru: `Russian ${suffix}`,
  sv: `Swedish ${suffix}`,
});

describe("repairAndParseJson", () => {
  it("parses a valid JSON array", () => {
    expect(repairAndParseJson(JSON.stringify([row(1)]))).toEqual([row(1)]);
  });

  it("repairs trailing commas", () => {
    expect(repairAndParseJson('[{"n":1,"en":"English","ru":"Russian","sv":"Swedish",},]')).toEqual([
      { n: 1, en: "English", ru: "Russian", sv: "Swedish" },
    ]);
  });

  it("repairs a truncated array by closing it after the last complete object", () => {
    expect(repairAndParseJson('[{"n":1,"en":"English","ru":"Russian","sv":"Swedish"}')).toEqual([
      { n: 1, en: "English", ru: "Russian", sv: "Swedish" },
    ]);
  });

  it("throws on non-JSON garbage", () => {
    expect(() => repairAndParseJson("not json")).toThrow("JSON repair failed");
  });
});

describe("mapTranslations", () => {
  it("maps an in-order array one-to-one", () => {
    expect(mapTranslations([row(1), row(2)], 2)).toEqual([mappedRow(1), mappedRow(2)]);
  });

  it("maps reordered items by n instead of array position", () => {
    expect(mapTranslations([row(2), row(1)], 2)).toEqual([mappedRow(1), mappedRow(2)]);
  });

  it("ignores out-of-range n values and leaves that slot null", () => {
    expect(mapTranslations([row(1), row(3)], 2)).toEqual([mappedRow(1), null]);
  });

  it("keeps only the first duplicate n", () => {
    expect(mapTranslations([row(1, "first"), row(1, "second")], 1)).toEqual([mappedRow("first")]);
  });

  it("leaves missing items null", () => {
    expect(mapTranslations([row(1)], 2)).toEqual([mappedRow(1), null]);
  });

  it("leaves items with empty string fields null", () => {
    expect(mapTranslations([{ ...row(1), en: "" }], 1)).toEqual([null]);
  });

  it("returns all-null when parsed is not an array", () => {
    expect(mapTranslations({ n: 1 }, 2)).toEqual([null, null]);
  });
});
