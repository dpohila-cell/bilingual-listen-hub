function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attrs;
}

function attr(attrs: Record<string, string>, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  return attrs[lowerName];
}

function localAttr(attrs: Record<string, string>, localName: string): string | undefined {
  const lowerLocalName = localName.toLowerCase();
  for (const [name, value] of Object.entries(attrs)) {
    const local = name.includes(":") ? name.split(":").pop() : name;
    if (local === lowerLocalName) return value;
  }
  return undefined;
}

function hasToken(value: string | undefined, token: string): boolean {
  return (value ?? "").split(/\s+/).some((part) => part === token);
}

function itemTags(opfXml: string): string[] {
  return opfXml.match(/<[\w.-]*:?item\b[^>]*>/gi) ?? [];
}

export function findEpubCoverHref(opfXml: string): string | null {
  const items = itemTags(opfXml);

  for (const item of items) {
    const attrs = parseAttributes(item);
    if (hasToken(attr(attrs, "properties"), "cover-image")) {
      return attr(attrs, "href") ?? null;
    }
  }

  const metaTags = opfXml.match(/<[\w.-]*:?meta\b[^>]*>/gi) ?? [];
  let coverId: string | undefined;
  for (const meta of metaTags) {
    const attrs = parseAttributes(meta);
    if ((attr(attrs, "name") ?? "").toLowerCase() === "cover") {
      coverId = attr(attrs, "content");
      break;
    }
  }

  if (!coverId) return null;

  for (const item of items) {
    const attrs = parseAttributes(item);
    if (attr(attrs, "id") === coverId) {
      return attr(attrs, "href") ?? null;
    }
  }

  return null;
}

export function findFb2CoverBinaryId(xml: string): string | null {
  const coverMatch = /<[\w.-]*:?coverpage\b[^>]*>([\s\S]*?)<\/[\w.-]*:?coverpage>/i.exec(xml);
  if (!coverMatch) return null;

  const imageMatch = /<[\w.-]*:?image\b[^>]*>/i.exec(coverMatch[1]);
  if (!imageMatch) return null;

  const attrs = parseAttributes(imageMatch[0]);
  const href = localAttr(attrs, "href");
  if (!href) return null;

  return href.replace(/^#/, "") || null;
}

export function extractFb2Binary(
  xml: string,
  id: string,
): { contentType: string; base64: string } | null {
  const binaryRegex = /(<[\w.-]*:?binary\b[^>]*>)([\s\S]*?)<\/[\w.-]*:?binary>/gi;
  let match: RegExpExecArray | null;

  while ((match = binaryRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1]);
    if (attr(attrs, "id") !== id) continue;

    const contentType = attr(attrs, "content-type");
    if (!contentType) return null;

    return {
      contentType,
      base64: match[2].replace(/\s+/g, ""),
    };
  }

  return null;
}
