import { describe, expect, it } from "vitest";

import { markdownToTelegramChunks, markdownToTelegramHtml } from "./format.js";

describe("markdownToTelegramHtml", () => {
  it("renders basic inline formatting", () => {
    const res = markdownToTelegramHtml("hi _there_ **boss** `code`");
    expect(res).toBe("hi <i>there</i> <b>boss</b> <code>code</code>");
  });

  it("renders links as Telegram-safe HTML", () => {
    const res = markdownToTelegramHtml("see [docs](https://example.com)");
    expect(res).toBe('see <a href="https://example.com">docs</a>');
  });

  it("escapes raw HTML", () => {
    const res = markdownToTelegramHtml("<b>nope</b>");
    expect(res).toBe("&lt;b&gt;nope&lt;/b&gt;");
  });

  it("escapes unsafe characters", () => {
    const res = markdownToTelegramHtml("a & b < c");
    expect(res).toBe("a &amp; b &lt; c");
  });

  it("renders paragraphs with blank lines", () => {
    const res = markdownToTelegramHtml("first\n\nsecond");
    expect(res).toBe("first\n\nsecond");
  });

  it("renders lists without block HTML", () => {
    const res = markdownToTelegramHtml("- one\n- two");
    expect(res).toBe("• one\n• two");
  });

  it("renders ordered lists with numbering", () => {
    const res = markdownToTelegramHtml("2. two\n3. three");
    expect(res).toBe("2. two\n3. three");
  });

  it("flattens headings and blockquotes", () => {
    const res = markdownToTelegramHtml("# Title\n\n> Quote");
    expect(res).toBe("Title\n\nQuote");
  });

  it("renders fenced code blocks", () => {
    const res = markdownToTelegramHtml("```js\nconst x = 1;\n```");
    expect(res).toBe("<pre><code>const x = 1;\n</code></pre>");
  });

  it("properly nests overlapping bold and autolink (#4071)", () => {
    const res = markdownToTelegramHtml("**start https://example.com** end");
    expect(res).toMatch(
      /<b>start <a href="https:\/\/example\.com">https:\/\/example\.com<\/a><\/b> end/,
    );
  });

  it("properly nests link inside bold", () => {
    const res = markdownToTelegramHtml("**bold [link](https://example.com) text**");
    expect(res).toBe('<b>bold <a href="https://example.com">link</a> text</b>');
  });

  it("properly nests bold wrapping a link with trailing text", () => {
    const res = markdownToTelegramHtml("**[link](https://example.com) rest**");
    expect(res).toBe('<b><a href="https://example.com">link</a> rest</b>');
  });

  it("properly nests bold inside a link", () => {
    const res = markdownToTelegramHtml("[**bold**](https://example.com)");
    expect(res).toBe('<a href="https://example.com"><b>bold</b></a>');
  });
});

describe("markdownToTelegramChunks", () => {
  it("keeps each rendered HTML chunk under the limit even with tag overhead", () => {
    // 200 link instances; each link adds ~33 chars of HTML overhead.
    // Plain-text length ~3000 stays below 4000 limit, but rendered HTML is ~9600.
    const link = "[a](https://example.com/somewhat-long-url)";
    const markdown = Array.from({ length: 200 }, () => link).join(" ");
    const chunks = markdownToTelegramChunks(markdown, 4000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.html.length).toBeLessThanOrEqual(4000);
    }
  });

  it("does not split when rendered HTML fits within the limit", () => {
    const chunks = markdownToTelegramChunks("hello **world**", 4000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.html).toBe("hello <b>world</b>");
  });

  it("returns empty array for empty input", () => {
    expect(markdownToTelegramChunks("", 4000)).toEqual([]);
  });
});
