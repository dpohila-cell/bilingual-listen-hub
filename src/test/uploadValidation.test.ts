import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE, validateFile } from "@/lib/uploadValidation";

describe("validateFile", () => {
  it("returns null for a small .epub file", () => {
    const file = new File(["book"], "book.epub", { type: "application/epub+zip" });

    expect(validateFile(file)).toBeNull();
  });

  it("returns an unsupported-type message for a .exe file", () => {
    const file = new File(["binary"], "setup.exe", { type: "application/octet-stream" });

    expect(validateFile(file)).toContain("Unsupported file type. Allowed:");
  });

  it("returns a too-large message for an oversized file", () => {
    const file = new File(["book"], "big.epub", { type: "application/epub+zip" });
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE + 1 });

    expect(validateFile(file)).toBe("File is too large (max 25 MB).");
  });
});
