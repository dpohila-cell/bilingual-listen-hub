import { describe, expect, it } from "vitest";
import { buildSynthesisInput, escapeXml } from "../../supabase/functions/_shared/tts.ts";

describe("escapeXml", () => {
  it("escapes all XML reserved characters", () => {
    expect(escapeXml(`Tom & Jerry <tag> "quote" 'apostrophe'`)).toBe(
      "Tom &amp; Jerry &lt;tag&gt; &quot;quote&quot; &apos;apostrophe&apos;"
    );
  });

  it("escapes ampersands before generated XML entities", () => {
    expect(escapeXml("<")).toBe("&lt;");
  });
});

describe("buildSynthesisInput", () => {
  it("uses plain text for Chirp voices", () => {
    expect(buildSynthesisInput("Hello & welcome", "en-US-Chirp3-HD-Charon")).toEqual({
      text: "Hello & welcome",
    });
  });

  it("uses SSML with a leading break and escaped text for Wavenet voices", () => {
    expect(buildSynthesisInput(`Hello & "world"`, "ru-RU-Wavenet-D")).toEqual({
      ssml: `<speak><break time="300ms"/>Hello &amp; &quot;world&quot;</speak>`,
    });
  });
});
