export type PdfTextExtraction = {
  text: string;
  totalPages: number;
  pagesWithText: number;
};

function countLetters(text: string): number {
  return (text.match(/\p{L}/gu) || []).length;
}

function normalizeExtractedPage(page: unknown): string {
  if (typeof page === "string") return page;
  if (page && typeof page === "object" && "text" in page) {
    const text = (page as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function getPageTexts(extracted: unknown): string[] {
  if (Array.isArray(extracted)) {
    return extracted.map(normalizeExtractedPage);
  }

  if (!extracted || typeof extracted !== "object") return [];

  const result = extracted as {
    pages?: unknown;
    text?: unknown;
  };

  if (Array.isArray(result.pages)) {
    return result.pages.map(normalizeExtractedPage);
  }

  if (Array.isArray(result.text)) {
    return result.text.map(normalizeExtractedPage);
  }

  if (typeof result.text === "string") {
    return [result.text];
  }

  return [];
}

function getTotalPages(extracted: unknown, pdf: unknown, pageTexts: string[]): number {
  const extractedPages =
    extracted && typeof extracted === "object" && "totalPages" in extracted
      ? Number((extracted as { totalPages?: unknown }).totalPages)
      : 0;
  const pdfPages =
    pdf && typeof pdf === "object" && "numPages" in pdf
      ? Number((pdf as { numPages?: unknown }).numPages)
      : 0;

  return extractedPages || pdfPages || pageTexts.length;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextExtraction | null> {
  try {
    // Supabase Edge supports npm: specifiers. Keep this dynamic and guarded so
    // import-time runtime incompatibilities degrade to the unchanged AI fallback.
    const unpdfSpecifier = "npm:unpdf";
    const { getDocumentProxy, extractText } = await import(unpdfSpecifier);
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: false });
    const pageTexts = getPageTexts(extracted);
    const totalPages = getTotalPages(extracted, pdf, pageTexts);
    const pagesWithText = pageTexts.filter((page) => countLetters(page) >= 20).length;

    return {
      text: pageTexts.map((page) => page.trim()).filter(Boolean).join("\n\n"),
      totalPages,
      pagesWithText,
    };
  } catch {
    return null;
  }
}

export function isExtractionUsable(result: PdfTextExtraction | null): boolean {
  if (!result || result.totalPages <= 0 || result.pagesWithText <= 0) {
    return false;
  }

  const pageTextRatio = result.pagesWithText / result.totalPages;
  const letterCount = countLetters(result.text.replace(/\s+/g, " ").trim());

  // A real text-layer PDF should have meaningful text on a large share of pages
  // and enough actual letters to form book content. This avoids trusting tiny
  // OCR artifacts, page numbers, or mostly scanned PDFs while still allowing AI
  // fallback for weak parser output.
  return pageTextRatio >= 0.4 && letterCount >= 200;
}
