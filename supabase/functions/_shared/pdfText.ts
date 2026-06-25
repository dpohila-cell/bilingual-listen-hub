export type PdfTextExtraction = {
  text: string;
  totalPages: number;
  pagesWithText: number;
};

export function isExtractionUsable(result: PdfTextExtraction | null): boolean {
  if (!result || result.totalPages <= 0 || result.pagesWithText <= 0) {
    return false;
  }

  const pageTextRatio = result.pagesWithText / result.totalPages;
  const letterCount = (result.text.replace(/\s+/g, " ").trim().match(/\p{L}/gu) || []).length;

  // A real text-layer PDF should have meaningful text on a large share of pages
  // and enough actual letters to form book content. This avoids trusting tiny
  // OCR artifacts, page numbers, or mostly scanned PDFs while still allowing AI
  // fallback for weak parser output.
  return pageTextRatio >= 0.4 && letterCount >= 200;
}

export function looksLikeExtractionRefusal(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (t.length >= 400) return false;

  return /\b(i[’']?m sorry|i can(?:[’']|no)?t (?:provide|assist|reproduce|share|help)|cannot provide|i[’']?m unable|not able to provide|copyrighted)\b/i.test(t);
}
