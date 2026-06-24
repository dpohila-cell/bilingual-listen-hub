import { describe, expect, it } from "vitest";
import {
  extractFb2Binary,
  findEpubCoverHref,
  findFb2CoverBinaryId,
} from "../../supabase/functions/_shared/cover.ts";

describe("findEpubCoverHref", () => {
  it("finds an EPUB3 cover-image manifest item by properties token", () => {
    const opf = `
      <package>
        <manifest>
          <item href="chapters/one.xhtml" id="chapter-1" media-type="application/xhtml+xml" />
          <item media-type="image/jpeg" href="images/cover.jpg" properties="nav cover-image" id="cover" />
        </manifest>
      </package>
    `;

    expect(findEpubCoverHref(opf)).toBe("images/cover.jpg");
  });

  it("finds an EPUB2 cover through meta content and manifest id", () => {
    const opf = `
      <package>
        <metadata>
          <meta content='cover-id' name='cover'/>
        </metadata>
        <manifest>
          <item href="text/title.xhtml" id="title" />
          <item href='Images/Cover.png' id='cover-id' media-type='image/png'/>
        </manifest>
      </package>
    `;

    expect(findEpubCoverHref(opf)).toBe("Images/Cover.png");
  });
});

describe("findFb2CoverBinaryId", () => {
  it("reads href and strips a leading hash", () => {
    const xml = `
      <FictionBook>
        <description><title-info><coverpage><image href="#cover.jpg"/></coverpage></title-info></description>
      </FictionBook>
    `;

    expect(findFb2CoverBinaryId(xml)).toBe("cover.jpg");
  });

  it("reads l:href", () => {
    const xml = `
      <coverpage>
        <image l:href="#cover.png" />
      </coverpage>
    `;

    expect(findFb2CoverBinaryId(xml)).toBe("cover.png");
  });

  it("reads xlink:href", () => {
    const xml = `
      <fb:coverpage>
        <fb:image xlink:href="cover.webp" />
      </fb:coverpage>
    `;

    expect(findFb2CoverBinaryId(xml)).toBe("cover.webp");
  });
});

describe("extractFb2Binary", () => {
  it("matches by id and returns content type with whitespace-stripped base64", () => {
    const xml = `
      <FictionBook>
        <binary id="other" content-type="image/png">AAAA</binary>
        <binary content-type='image/jpeg' id='cover.jpg'>
          SGVs
          bG8=
        </binary>
      </FictionBook>
    `;

    expect(extractFb2Binary(xml, "cover.jpg")).toEqual({
      contentType: "image/jpeg",
      base64: "SGVsbG8=",
    });
  });
});
