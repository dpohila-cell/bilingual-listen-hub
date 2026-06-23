export function buildFileDataUrl(fileBase64: string, mimeType = "application/pdf"): string {
  if (fileBase64.startsWith("data:")) return fileBase64;
  return `data:${mimeType};base64,${fileBase64}`;
}
