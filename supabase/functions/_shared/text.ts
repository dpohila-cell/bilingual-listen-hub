export function sanitizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u0080-\u009F]/g, "")
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .normalize("NFC");
}

export function splitIntoSentences(text: string): string[] {
  {
    const normalized = text
      .replace(/\r\n/g, "\n")
      .replace(/\t+/g, " ")
      .replace(/[ \u00A0]{2,}/g, " ");

    const blocks = normalized.split(/\n{2,}/);
    const result: string[] = [];
    let pending = "";

    const hasSentenceEnding = (value: string) => /[.!?\u2026\u00BB"]$/.test(value.trim());
    const pushCompleteSentences = (value: string) => {
      const source = pending ? `${pending} ${value}` : value;
      pending = "";

      const parts = source
        .replace(/ {2,}/g, " ")
        .split(/(?<=[.!?\u2026\u00BB"])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1);

      for (const part of parts) {
        if (hasSentenceEnding(part) || part.length > 240) {
          result.push(part);
        } else {
          pending = pending ? `${pending} ${part}` : part;
        }
      }
    };

    for (const block of blocks) {
      const paragraph = block
        .trim()
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ");

      if (paragraph) pushCompleteSentences(paragraph);
    }

    if (pending.trim().length > 1) result.push(pending.trim());
    return result.filter((s) => s.length > 1);
  }

}
