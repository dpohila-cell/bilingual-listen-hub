export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSynthesisInput(text: string, voiceName: string): { text: string } | { ssml: string } {
  if (voiceName.includes("Chirp")) {
    return { text };
  }

  return { ssml: `<speak><break time="300ms"/>${escapeXml(text)}</speak>` };
}
