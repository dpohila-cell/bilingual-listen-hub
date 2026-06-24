export interface BookMetadata {
  title?: string;
  author?: string;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanText(value: string): string {
  return collapseSpaces(decodeXmlEntities(stripTags(value)));
}

function firstLocalTag(xml: string, localName: string): string | undefined {
  const tag = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<((?:[\\w.-]+:)?${tag})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i",
  );
  return regex.exec(xml)?.[2];
}

function allLocalTags(xml: string, localName: string): string[] {
  const tag = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<((?:[\\w.-]+:)?${tag})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`,
    "gi",
  );
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[2]);
  }
  return values;
}

function withNonEmpty(metadata: BookMetadata): BookMetadata {
  const result: BookMetadata = {};
  const title = metadata.title?.trim();
  const author = metadata.author?.trim();
  if (title) result.title = title;
  if (author) result.author = author;
  return result;
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (entity, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) {
        return entity;
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    })
    .replace(/&#(\d+);/g, (entity, decimal) => {
      const codePoint = Number.parseInt(decimal, 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) {
        return entity;
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function parseOpfMetadata(opfXml: string): BookMetadata {
  const metadataXml = firstLocalTag(opfXml, "metadata") ?? opfXml;
  const title = cleanText(firstLocalTag(metadataXml, "title") ?? "");
  const authors = allLocalTags(metadataXml, "creator")
    .map(cleanText)
    .filter(Boolean);

  return withNonEmpty({
    title,
    author: authors.join(", "),
  });
}

export function parseFb2Metadata(xml: string): BookMetadata {
  const descriptionXml = firstLocalTag(xml, "description");
  if (!descriptionXml) return {};

  const titleInfoXml = firstLocalTag(descriptionXml, "title-info");
  if (!titleInfoXml) return {};

  const title = cleanText(firstLocalTag(titleInfoXml, "book-title") ?? "");
  const authors = allLocalTags(titleInfoXml, "author")
    .map((authorXml) => {
      const nameParts = ["first-name", "middle-name", "last-name"]
        .map((tag) => cleanText(firstLocalTag(authorXml, tag) ?? ""))
        .filter(Boolean);

      if (nameParts.length > 0) {
        return collapseSpaces(nameParts.join(" "));
      }

      return cleanText(firstLocalTag(authorXml, "nickname") ?? "");
    })
    .filter(Boolean);

  return withNonEmpty({
    title,
    author: authors.join(", "),
  });
}

export function parseDocxCoreMetadata(coreXml: string): BookMetadata {
  return withNonEmpty({
    title: cleanText(firstLocalTag(coreXml, "title") ?? ""),
    author: cleanText(firstLocalTag(coreXml, "creator") ?? ""),
  });
}
