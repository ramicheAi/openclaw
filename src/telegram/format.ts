import {
  chunkMarkdownIR,
  markdownToIR,
  type MarkdownLinkSpan,
  type MarkdownIR,
} from "../markdown/ir.js";
import { renderMarkdownWithMarkers } from "../markdown/render.js";
import type { MarkdownTableMode } from "../config/types.base.js";

export type TelegramFormattedChunk = {
  html: string;
  text: string;
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function buildTelegramLink(link: MarkdownLinkSpan, _text: string) {
  const href = link.href.trim();
  if (!href) return null;
  if (link.start === link.end) return null;
  const safeHref = escapeHtmlAttr(href);
  return {
    start: link.start,
    end: link.end,
    open: `<a href="${safeHref}">`,
    close: "</a>",
  };
}

function renderTelegramHtml(ir: MarkdownIR): string {
  return renderMarkdownWithMarkers(ir, {
    styleMarkers: {
      bold: { open: "<b>", close: "</b>" },
      italic: { open: "<i>", close: "</i>" },
      strikethrough: { open: "<s>", close: "</s>" },
      code: { open: "<code>", close: "</code>" },
      code_block: { open: "<pre><code>", close: "</code></pre>" },
    },
    escapeText: escapeHtml,
    buildLink: buildTelegramLink,
  });
}

export function markdownToTelegramHtml(
  markdown: string,
  options: { tableMode?: MarkdownTableMode } = {},
): string {
  const ir = markdownToIR(markdown ?? "", {
    linkify: true,
    headingStyle: "none",
    blockquotePrefix: "",
    tableMode: options.tableMode,
  });
  return renderTelegramHtml(ir);
}

export function renderTelegramHtmlText(
  text: string,
  options: { textMode?: "markdown" | "html"; tableMode?: MarkdownTableMode } = {},
): string {
  const textMode = options.textMode ?? "markdown";
  if (textMode === "html") return text;
  return markdownToTelegramHtml(text, { tableMode: options.tableMode });
}

// Re-split chunks whose rendered HTML exceeds the limit. HTML tags and entity
// escapes (e.g. <a href="...">, &amp;, <pre><code>) inflate length beyond the
// plain-text count chunkMarkdownIR uses, so a chunk that fits by text length
// can still exceed Telegram's 4096-char API limit once rendered.
function chunkIRForHtmlLimit(
  ir: MarkdownIR,
  htmlLimit: number,
  textLimit: number,
  depth: number,
): TelegramFormattedChunk[] {
  const textChunks = chunkMarkdownIR(ir, textLimit);
  const result: TelegramFormattedChunk[] = [];
  for (const chunk of textChunks) {
    const html = renderTelegramHtml(chunk);
    if (html.length <= htmlLimit) {
      result.push({ html, text: chunk.text });
      continue;
    }
    if (depth >= 5 || chunk.text.length <= 1) {
      result.push({ html, text: chunk.text });
      continue;
    }
    const ratio = htmlLimit / html.length;
    const scaled = Math.floor(chunk.text.length * ratio * 0.9);
    const nextTextLimit = Math.max(1, Math.min(scaled, chunk.text.length - 1));
    result.push(...chunkIRForHtmlLimit(chunk, htmlLimit, nextTextLimit, depth + 1));
  }
  return result;
}

export function markdownToTelegramChunks(
  markdown: string,
  limit: number,
  options: { tableMode?: MarkdownTableMode } = {},
): TelegramFormattedChunk[] {
  const ir = markdownToIR(markdown ?? "", {
    linkify: true,
    headingStyle: "none",
    blockquotePrefix: "",
    tableMode: options.tableMode,
  });
  if (limit <= 0) {
    if (!ir.text) return [];
    return [{ html: renderTelegramHtml(ir), text: ir.text }];
  }
  return chunkIRForHtmlLimit(ir, limit, limit, 0);
}

export function markdownToTelegramHtmlChunks(markdown: string, limit: number): string[] {
  return markdownToTelegramChunks(markdown, limit).map((chunk) => chunk.html);
}
