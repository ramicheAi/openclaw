// Document text extraction, dispatched by file extension.
//
// PDF and DOCX parsing use dynamic `import(...)` so a missing/broken binary
// dependency is isolated to the one document type that needs it — the rest of
// the plugin (and other readers) keep working even if, say, pdfjs fails to load.
// HTML is stripped with regex (no jsdom dependency). Unknown extensions fall
// back to a UTF-8 read.

import fs from "node:fs/promises";
import path from "node:path";

/** Extensions handled by the recursive directory walk in ingest. */
export const SUPPORTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".pdf",
  ".docx",
  ".html",
  ".htm",
]);

/** Hard cap on a single document's on-disk size, to bound ingest memory use. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Throw if a file exceeds MAX_FILE_BYTES (ingest catches this per-file and skips). */
async function assertReadableSize(filePath: string): Promise<void> {
  const st = await fs.stat(filePath);
  if (st.size > MAX_FILE_BYTES) {
    throw new Error(`file too large to ingest (${st.size} bytes > ${MAX_FILE_BYTES}): ${filePath}`);
  }
}

/** Extract plain text from a document. Dispatches on the file extension. */
export async function extractText(filePath: string): Promise<string> {
  await assertReadableSize(filePath);
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".txt":
    case ".md":
    case ".markdown":
      return fs.readFile(filePath, "utf8");
    case ".pdf":
      return extractPdf(filePath);
    case ".docx":
      return extractDocx(filePath);
    case ".html":
    case ".htm":
      return stripHtml(await fs.readFile(filePath, "utf8"));
    default:
      // Best-effort: treat unknown files as UTF-8 text.
      return fs.readFile(filePath, "utf8");
  }
}

async function extractPdf(filePath: string): Promise<string> {
  // Dynamic import: pdfjs is a heavy ESM binary; load it only when a PDF is seen.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(filePath));
  // disableWorker keeps everything on the main thread (no worker file to wire up).
  const loadingTask = pdfjs.getDocument({ data, disableWorker: true } as never);
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => (typeof (item as { str?: unknown }).str === "string" ? (item as { str: string }).str : ""))
      .filter((s) => s.length > 0);
    pages.push(strings.join(" "));
  }
  await doc.cleanup();
  return pages.join("\n\n");
}

async function extractDocx(filePath: string): Promise<string> {
  // Dynamic import: isolate mammoth so a load failure only affects .docx files.
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

/**
 * Strip HTML to readable text using regex only (no DOM library):
 * drop script/style blocks, remove tags, decode a handful of common entities,
 * and collapse runs of whitespace.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
