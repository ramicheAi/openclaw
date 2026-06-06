// Best-effort metadata extraction from a document's text body + filename.
// Pure regex/heuristics — no LLM call required. Covers the patterns that
// dominate real productions: email headers (Outlook / Gmail / generic),
// police / incident reports, contracts with signature blocks, memos with
// "MEMO TO:" / "FROM:" headers, and falls back to filename when the body
// is opaque.
//
// The extractor returns *suggestions* — every field is best-effort and the
// UI lets the user override. Confidence flags travel with each field so
// the UI can highlight low-confidence picks for review.

export interface MetadataSuggestion {
  title?: string;
  type?: string;
  date?: string; // YYYY-MM-DD
  author?: string;
  recipients?: string[];
  summary?: string;
  confidence: "high" | "medium" | "low";
  signals: string[]; // which extractors fired ("email-header", "filename", ...)
}

// ── Helpers ─────────────────────────────────────────────────────────────

function stripEmail(s: string): string {
  // "John Smith <jsmith@x.com>" → "John Smith"
  return s.replace(/\s*<[^>]+>/g, "").replace(/\([^)]+\)/g, "").trim();
}

function isoDate(s: string): string | undefined {
  if (!s) return undefined;
  const t = new Date(s).getTime();
  if (Number.isFinite(t) && Math.abs(t) > 0) return new Date(t).toISOString().slice(0, 10);
  // ISO-ish fallback
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  // US-style M/D/YYYY
  const us = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (us) {
    const [, m, d, y] = us;
    const yy = y.length === 2 ? 2000 + Number(y) : Number(y);
    return `${yy}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

function firstNonEmptyLine(text: string, max = 4): string | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Skip headerish "From:" / "To:" / etc.
  const cleaned = lines.filter((l) => !/^(from|sent|to|cc|bcc|subject|date|attachments?|page \d+ of \d+):/i.test(l));
  return cleaned.slice(0, max).find((l) => l.length >= 4 && l.length <= 160);
}

// ── Email header pattern (Outlook / Gmail / generic) ────────────────────
function extractEmail(text: string): Partial<MetadataSuggestion> | null {
  const head = text.slice(0, 1800);
  const re = (label: string) => new RegExp(`^\\s*${label}\\s*:\\s*(.+?)\\s*$`, "im");
  const from = head.match(re("from"))?.[1];
  const to = head.match(re("to"))?.[1];
  const cc = head.match(re("cc"))?.[1];
  const subject = head.match(re("subject"))?.[1];
  const date = head.match(re("sent"))?.[1] ?? head.match(re("date"))?.[1];
  if (!from && !subject) return null; // not an email
  return {
    type: "Email",
    title: subject?.replace(/^(re|fwd):\s*/i, (m) => m.toUpperCase()).slice(0, 160),
    author: from ? stripEmail(from) : undefined,
    recipients: [to, cc]
      .filter((s): s is string => !!s)
      .flatMap((s) => s.split(/[,;]/).map(stripEmail).filter(Boolean)),
    date: isoDate(date ?? ""),
  };
}

// ── "MEMO TO / FROM" / report headers ───────────────────────────────────
function extractMemo(text: string): Partial<MetadataSuggestion> | null {
  const head = text.slice(0, 1200);
  const memoMarker = /\b(memo(randum)?\s+to|memorandum)\b/i.test(head);
  const to = head.match(/^\s*to\s*:\s*(.+)$/im)?.[1];
  const from = head.match(/^\s*from\s*:\s*(.+)$/im)?.[1];
  const subject = head.match(/^\s*(re|subject)\s*:\s*(.+)$/im)?.[2];
  const date = head.match(/^\s*date\s*:\s*(.+)$/im)?.[1];
  if (!memoMarker && !(to && from)) return null;
  return {
    type: "Memo",
    title: subject?.slice(0, 160),
    author: from ? stripEmail(from) : undefined,
    recipients: to ? to.split(/[,;]/).map(stripEmail).filter(Boolean) : undefined,
    date: isoDate(date ?? ""),
  };
}

// ── Incident / police report ────────────────────────────────────────────
function extractIncident(text: string): Partial<MetadataSuggestion> | null {
  const head = text.slice(0, 2500);
  if (!/\b(incident|police|sheriff|deputy|officer|case report|crash report)\b/i.test(head)) return null;
  // Date field — many reports use "Incident Date" or "Report Date".
  const date =
    head.match(/incident\s+date[^\d]{0,12}(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i)?.[1] ??
    head.match(/report(?:\s+date)?[^\d]{0,12}(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i)?.[1] ??
    head.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/)?.[1];
  const officer =
    head.match(/(?:officer|deputy|reporting officer|reporter)\s*:?\s*([A-Z][A-Za-z .'-]{2,40})/i)?.[1] ??
    head.match(/\bcaller\b[^\n]{0,40}\b([A-Z][A-Z .'-]+)\b/)?.[1];
  // Try to guess a title from "Incident Type" or first heading.
  const incidentType =
    head.match(/incident\s+type\s*:?\s*([^\n]{3,60})/i)?.[1] ??
    head.match(/initial\s+type\s+current\s+type[^\n]*\n?\s*([^\n]+)/i)?.[1];
  return {
    type: "Report",
    title: incidentType ? `Incident report — ${incidentType.trim()}` : "Incident report",
    author: officer?.trim(),
    date: isoDate(date ?? ""),
  };
}

// ── Contract / agreement ───────────────────────────────────────────────
function extractAgreement(text: string): Partial<MetadataSuggestion> | null {
  const head = text.slice(0, 1200);
  if (!/\b(agreement|contract|memorandum of understanding|mou|nda|non-disclosure)\b/i.test(head)) return null;
  // Look for "between X and Y"
  const between = head.match(/between\s+([^,]{3,80})\s+and\s+([^,.\n]{3,80})/i);
  const date = head.match(/(?:dated|effective(?: date)?|made(?: as of)?)[^\d\n]{0,20}([A-Z][a-z]+ \d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1];
  return {
    type: "Contract",
    title: firstNonEmptyLine(text) ?? "Agreement",
    author: between?.[1]?.trim(),
    recipients: between?.[2] ? [between[2].trim()] : undefined,
    date: isoDate(date ?? ""),
  };
}

// ── Filename fallback ──────────────────────────────────────────────────
function extractFromFilename(filename: string): Partial<MetadataSuggestion> {
  const base = filename.replace(/\.[^.]+$/, "");
  // 2024-03-15_RE_Contract_From_JohnSmith.eml-like
  const dateMatch = base.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/);
  const date = dateMatch ? isoDate(dateMatch[1]) : undefined;
  const type =
    /\bemail|gmail|outlook|inbox|\.eml$/i.test(filename) ? "Email" :
    /\bmemo\b/i.test(filename) ? "Memo" :
    /\b(contract|agreement|nda|mou)\b/i.test(filename) ? "Contract" :
    /\b(report|incident|police)\b/i.test(filename) ? "Report" :
    /\bletter\b/i.test(filename) ? "Letter" :
    /\bdeposition|depo|transcript\b/i.test(filename) ? "Deposition" :
    "Document";
  const title = base
    .replace(/[_-]+/g, " ")
    .replace(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return { type, title, date };
}

// ── Public entry point ─────────────────────────────────────────────────
export function proposeMetadata(text: string, filename: string): MetadataSuggestion {
  const signals: string[] = [];
  let out: Partial<MetadataSuggestion> = {};

  const extractors: [string, (t: string) => Partial<MetadataSuggestion> | null][] = [
    ["email", extractEmail],
    ["memo", extractMemo],
    ["incident", extractIncident],
    ["agreement", extractAgreement],
  ];
  for (const [name, fn] of extractors) {
    const r = fn(text);
    if (r) {
      signals.push(name);
      out = { ...r, ...out, recipients: out.recipients ?? r.recipients };
      // Keep going so a later extractor can fill gaps without clobbering wins.
    }
  }

  // Filename fallback only fills gaps.
  const fromFn = extractFromFilename(filename);
  out.title ??= fromFn.title;
  out.type ??= fromFn.type;
  out.date ??= fromFn.date;
  signals.push("filename");

  // Summary: first ~240 chars of meaningful content.
  const sumSource = text.replace(/^(?:from|to|cc|subject|date|sent)\s*:.*$/gim, "").replace(/\s+/g, " ").trim();
  out.summary = sumSource.slice(0, 240);

  // Confidence
  const hasMeta = !!(out.author || (out.recipients && out.recipients.length) || out.date);
  const titled = !!out.title;
  const confidence: MetadataSuggestion["confidence"] =
    out.type === "Email" && hasMeta && titled ? "high" :
    hasMeta && titled ? "medium" : "low";

  return {
    title: out.title,
    type: out.type ?? "Document",
    date: out.date,
    author: out.author,
    recipients: out.recipients,
    summary: out.summary,
    confidence,
    signals,
  };
}

// Auto-derive a Bates prefix from a matter name. "Smith v. Acme Corp" → "SMITH".
export function defaultBatesPrefix(matterName: string): string {
  const words = matterName.replace(/[^a-zA-Z\s]/g, "").split(/\s+/).filter(Boolean);
  // First substantive word, all caps, capped at 5 letters.
  const first = words.find((w) => w.length >= 3 && !/^(the|and|of|in|on|at|for|to|by|v|vs)$/i.test(w));
  return (first ?? "DOC").toUpperCase().slice(0, 5);
}
