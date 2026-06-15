import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extractText, stripHtml } from "./readers.js";

describe("stripHtml", () => {
  it("removes tags but keeps text content", () => {
    const html = "<html><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>";
    const text = stripHtml(html);
    expect(text).not.toContain("<");
    expect(text).not.toContain(">");
    expect(text).toContain("Title");
    expect(text).toContain("Hello");
    expect(text).toContain("world");
  });

  it("drops script and style block contents", () => {
    const html = "<style>.a{color:red}</style><p>keep</p><script>alert('x')</script>";
    const text = stripHtml(html);
    expect(text).toContain("keep");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("alert");
  });

  it("decodes common HTML entities", () => {
    const text = stripHtml("<p>Tom &amp; Jerry &lt;3 &quot;quotes&quot;</p>");
    expect(text).toContain("Tom & Jerry");
    expect(text).toContain("<3");
    expect(text).toContain('"quotes"');
  });
});

describe("extractText", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-readers-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads .txt as UTF-8", async () => {
    const file = path.join(dir, "note.txt");
    fs.writeFileSync(file, "plain text body");
    expect(await extractText(file)).toBe("plain text body");
  });

  it("reads .md as UTF-8", async () => {
    const file = path.join(dir, "doc.md");
    fs.writeFileSync(file, "# Heading\n\nSome **markdown**.");
    const text = await extractText(file);
    expect(text).toContain("# Heading");
    expect(text).toContain("Some **markdown**.");
  });

  it("strips tags when reading .html", async () => {
    const file = path.join(dir, "page.html");
    fs.writeFileSync(file, "<html><body><p>Visible text</p></body></html>");
    const text = await extractText(file);
    expect(text).toContain("Visible text");
    expect(text).not.toContain("<p>");
  });

  it("falls back to UTF-8 for unknown extensions", async () => {
    const file = path.join(dir, "data.unknown");
    fs.writeFileSync(file, "raw contents");
    expect(await extractText(file)).toBe("raw contents");
  });
});
