import { describe, expect, it } from "vitest";
import { buildFileDataUrl } from "../../supabase/functions/_shared/fileDataUrl.ts";

describe("buildFileDataUrl", () => {
  it("adds the default PDF data URL prefix to bare base64", () => {
    expect(buildFileDataUrl("JVBERi0xLjQ=")).toBe("data:application/pdf;base64,JVBERi0xLjQ=");
  });

  it("uses a provided mime type", () => {
    expect(buildFileDataUrl("abc123", "application/octet-stream")).toBe(
      "data:application/octet-stream;base64,abc123",
    );
  });

  it("leaves existing data URLs unchanged", () => {
    const existing = "data:application/pdf;base64,JVBERi0xLjQ=";

    expect(buildFileDataUrl(existing)).toBe(existing);
  });
});
