import { describe, expect, it } from "vitest";
import {
  decodeXmlEntities,
  parseDocxCoreMetadata,
  parseFb2Metadata,
  parseOpfMetadata,
} from "../../supabase/functions/_shared/metadata.ts";

describe("decodeXmlEntities", () => {
  it("decodes named and numeric XML entities", () => {
    expect(
      decodeXmlEntities("&amp; &lt; &gt; &quot; &apos; &#65; &#x42;"),
    ).toBe("& < > \" ' A B");
  });
});

describe("parseOpfMetadata", () => {
  it("reads prefixed dc:title and joins multiple dc:creator values", () => {
    const opf = `
      <package>
        <metadata>
          <dc:title>War &amp; Peace</dc:title>
          <dc:creator opf:file-as="Tolstoy, Leo">Leo Tolstoy</dc:creator>
          <dc:creator>Translator &lt;Name&gt;</dc:creator>
        </metadata>
      </package>
    `;

    expect(parseOpfMetadata(opf)).toEqual({
      title: "War & Peace",
      author: "Leo Tolstoy, Translator <Name>",
    });
  });

  it("reads namespace-less title and creator tags", () => {
    const opf = `
      <package>
        <metadata>
          <title>Plain Title</title>
          <creator>Plain Author</creator>
        </metadata>
      </package>
    `;

    expect(parseOpfMetadata(opf)).toEqual({
      title: "Plain Title",
      author: "Plain Author",
    });
  });
});

describe("parseFb2Metadata", () => {
  it("assembles first, middle, and last author names", () => {
    const fb2 = `
      <FictionBook>
        <description>
          <title-info>
            <book-title>Book &amp; One</book-title>
            <author>
              <first-name>Jane</first-name>
              <middle-name>Q.</middle-name>
              <last-name>Public</last-name>
            </author>
          </title-info>
        </description>
      </FictionBook>
    `;

    expect(parseFb2Metadata(fb2)).toEqual({
      title: "Book & One",
      author: "Jane Q. Public",
    });
  });

  it("falls back to nickname and joins multiple authors", () => {
    const fb2 = `
      <FictionBook>
        <description>
          <title-info>
            <book-title>Team Book</book-title>
            <author><nickname>WriterOne</nickname></author>
            <author><first-name>Alex</first-name><last-name>Writer</last-name></author>
          </title-info>
        </description>
      </FictionBook>
    `;

    expect(parseFb2Metadata(fb2)).toEqual({
      title: "Team Book",
      author: "WriterOne, Alex Writer",
    });
  });

  it("only reads the first description title-info and ignores body text", () => {
    const fb2 = `
      <FictionBook>
        <description>
          <src-title-info>
            <book-title>Wrong Source Title</book-title>
          </src-title-info>
          <title-info>
            <book-title>Correct Title</book-title>
            <author><first-name>Correct</first-name><last-name>Author</last-name></author>
          </title-info>
        </description>
        <body>
          <section>
            <title><p>Body Title</p></title>
            <author><nickname>Body Author</nickname></author>
          </section>
        </body>
      </FictionBook>
    `;

    expect(parseFb2Metadata(fb2)).toEqual({
      title: "Correct Title",
      author: "Correct Author",
    });
  });
});

describe("parseDocxCoreMetadata", () => {
  it("reads dc:title and dc:creator", () => {
    const core = `
      <cp:coreProperties>
        <dc:title>Docx &amp; Title</dc:title>
        <dc:creator>Docx Author</dc:creator>
      </cp:coreProperties>
    `;

    expect(parseDocxCoreMetadata(core)).toEqual({
      title: "Docx & Title",
      author: "Docx Author",
    });
  });

  it("ignores cp:lastModifiedBy", () => {
    const core = `
      <cp:coreProperties>
        <dc:title>Real Title</dc:title>
        <cp:lastModifiedBy>Wrong Author</cp:lastModifiedBy>
      </cp:coreProperties>
    `;

    expect(parseDocxCoreMetadata(core)).toEqual({
      title: "Real Title",
    });
  });
});
