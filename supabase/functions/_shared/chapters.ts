export interface ExtractedChapter {
  title: string | null;
  text: string;
}

export interface Fb2Section {
  title: string | null;
  innerXml: string;
}

const HEADING_LINE_RE = /^\s*(chapter|глава|kapitel)\s+[\divxlcm]+\b.*$/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(text: string): string {
  return decodeEntities(text.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function splitTextIntoChapters(text: string): ExtractedChapter[] {
  const lines = text.split(/\r\n|\r|\n/);
  const headingIndexes: number[] = [];

  lines.forEach((line, index) => {
    if (HEADING_LINE_RE.test(line)) headingIndexes.push(index);
  });

  if (headingIndexes.length === 0) return [{ title: null, text }];

  const paragraphCount = Math.max(
    1,
    text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim().length > 0).length,
  );
  const tooManyHeadings =
    headingIndexes.length > 200 ||
    headingIndexes.length > Math.ceil(paragraphCount / 3);

  if (tooManyHeadings) return [{ title: null, text }];

  const chapters: ExtractedChapter[] = [];
  const firstHeading = headingIndexes[0];
  const leadingText = lines.slice(0, firstHeading).join("\n");
  if (leadingText.trim().length > 0) {
    chapters.push({ title: null, text: leadingText });
  }

  for (let i = 0; i < headingIndexes.length; i += 1) {
    const start = headingIndexes[i];
    const end = headingIndexes[i + 1] ?? lines.length;
    chapters.push({
      title: lines[start].trim() || null,
      text: lines.slice(start, end).join("\n"),
    });
  }

  return chapters.length > 0 ? chapters : [{ title: null, text }];
}

function findMatchingTagEnd(source: string, tagName: string, openEnd: number): number {
  const tagRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagRe.lastIndex = openEnd;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(source)) !== null) {
    const tag = match[0];
    if (/^<\//.test(tag)) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else if (!/\/\s*>$/.test(tag)) {
      depth += 1;
    }
  }

  return -1;
}

function extractSectionTitle(innerXml: string): string | null {
  const titleOpen = /<title\b[^>]*>/gi.exec(innerXml);
  if (!titleOpen) return null;

  const nestedSection = /<section\b[^>]*>/gi.exec(innerXml);
  if (nestedSection && nestedSection.index < titleOpen.index) return null;

  const titleClose = findMatchingTagEnd(innerXml, "title", titleOpen.index + titleOpen[0].length);
  if (titleClose === -1) return null;

  const nextNestedSection = /<section\b[^>]*>/gi.exec(innerXml);
  if (nextNestedSection && nextNestedSection.index < titleClose) return null;

  const rawTitle = innerXml.slice(titleOpen.index + titleOpen[0].length, titleClose);
  const title = stripTags(rawTitle);
  return title.length > 0 ? title : null;
}

export function parseFb2TopLevelSections(xml: string): Fb2Section[] {
  const bodyOpen = /<body\b[^>]*>/gi.exec(xml);
  if (!bodyOpen) return [];

  const bodyClose = findMatchingTagEnd(xml, "body", bodyOpen.index + bodyOpen[0].length);
  if (bodyClose === -1) return [];

  const bodyInner = xml.slice(bodyOpen.index + bodyOpen[0].length, bodyClose);
  const sectionTagRe = /<\/?section\b[^>]*>/gi;
  const sections: Fb2Section[] = [];
  const stack: Array<{ start: number; openEnd: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = sectionTagRe.exec(bodyInner)) !== null) {
    const tag = match[0];
    if (/^<\//.test(tag)) {
      const current = stack.pop();
      if (current && stack.length === 0) {
        const innerXml = bodyInner.slice(current.openEnd, match.index);
        sections.push({
          title: extractSectionTitle(innerXml),
          innerXml,
        });
      }
    } else if (!/\/\s*>$/.test(tag)) {
      stack.push({ start: match.index, openEnd: sectionTagRe.lastIndex });
    }
  }

  return sections;
}

export function extractEpubChapterTitle(html: string): string | null {
  const heading = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(html);
  if (!heading) return null;

  const title = stripTags(heading[2]);
  return title.length > 0 ? title : null;
}
