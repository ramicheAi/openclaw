// Court-order deadline parser — drop in the text of a scheduling order (or any
// order with dates) and Themis extracts the deadlines into structured,
// calendar-ready rows. Missing a court deadline is a malpractice-grade event;
// this turns a wall of "within 30 days of..." prose into a dated checklist.
//
// We anchor relative deadlines ("within 14 days of the close of discovery")
// only when the order also states the anchor date; otherwise we keep the
// literal phrasing in `detail` and leave the date best-effort so a human can
// confirm. Never silently invent a date.

import type { DB } from "./db.js";
import { randomUUID } from "node:crypto";
import { llmComplete } from "./llm.js";
import { extractJsonObject } from "./text-utils.js";

export type DeadlineKind = "deadline" | "hearing" | "conference" | "trial" | "disclosure";

export interface ParsedDeadline {
  dueDate: string; // ISO YYYY-MM-DD
  title: string;
  detail: string;
  kind: DeadlineKind;
}

export interface DeadlineRow extends ParsedDeadline {
  id: string;
  source: string;
  done: boolean;
  createdAt: string;
}

const SYSTEM = `You extract deadlines and scheduled events from court orders and scheduling orders for a litigation calendar.

Rules:
1. Extract every dated obligation, hearing, conference, disclosure deadline, discovery cutoff, motion deadline, and trial date.
2. Dates MUST be ISO YYYY-MM-DD. If a deadline is stated relative to another date (e.g. "30 days before trial") AND the anchor date is present in the order, compute the absolute date. If you cannot compute it confidently, OMIT the date but keep the obligation text in "detail" with dueDate set to "" — never guess a date.
3. Classify each into kind: "deadline" (filing/motion/discovery cutoffs), "hearing", "conference", "trial", or "disclosure" (Rule 26 / expert disclosures).
4. Keep titles short ("Expert disclosures due", "Dispositive motion deadline", "Final pretrial conference"). Put the verbatim ordering language in "detail".
5. Output ONLY a single strict JSON object. No prose, no markdown.

Schema:
{ "deadlines": [ { "dueDate": "YYYY-MM-DD" | "", "title": "string", "detail": "string", "kind": "deadline|hearing|conference|trial|disclosure" } ] }`;

export async function parseDeadlines(
  text: string,
): Promise<{ ok: true; deadlines: ParsedDeadline[] } | { ok: false; error: string }> {
  const raw = await llmComplete(SYSTEM, `ORDER TEXT:\n\n${text.slice(0, 24_000)}\n\nExtract the deadlines as JSON.`, 2048);
  if (raw === null) {
    return { ok: false, error: "LLM engine not configured. Set THEMIS_LLM_PROVIDER=claude-code or ANTHROPIC_API_KEY." };
  }
  const ex = extractJsonObject<{ deadlines?: ParsedDeadline[] }>(raw);
  if (!ex.ok) return { ok: false, error: ex.error };
  const parsed = ex.value;
  const out = (parsed.deadlines ?? [])
    .filter((d) => d.title)
    .map((d) => ({
      dueDate: typeof d.dueDate === "string" ? d.dueDate : "",
      title: d.title,
      detail: d.detail ?? "",
      kind: (["deadline", "hearing", "conference", "trial", "disclosure"].includes(d.kind) ? d.kind : "deadline") as DeadlineKind,
    }));
  return { ok: true, deadlines: out };
}

// --- Persistence ---

export function listDeadlines(db: DB, matterId: string): DeadlineRow[] {
  const rows = db
    .prepare(`SELECT * FROM deadlines WHERE matter_id = ? ORDER BY (due_date = '') ASC, due_date ASC`)
    .all(matterId) as Record<string, unknown>[];
  return rows.map(rowToDeadline);
}

export function insertDeadlines(db: DB, matterId: string, deadlines: ParsedDeadline[], source: string): DeadlineRow[] {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO deadlines (id, matter_id, due_date, title, detail, kind, source, done, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  );
  const inserted: DeadlineRow[] = [];
  const tx = db.transaction(() => {
    for (const d of deadlines) {
      const id = `dl-${randomUUID().slice(0, 8)}`;
      stmt.run(id, matterId, d.dueDate, d.title, d.detail, d.kind, source, now);
      inserted.push({ id, source, done: false, createdAt: now, ...d });
    }
  });
  tx();
  return inserted;
}

export function setDeadlineDone(db: DB, matterId: string, id: string, done: boolean): DeadlineRow | null {
  const r = db.prepare(`UPDATE deadlines SET done = ? WHERE id = ? AND matter_id = ?`).run(done ? 1 : 0, id, matterId);
  if (r.changes === 0) return null;
  const row = db.prepare(`SELECT * FROM deadlines WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToDeadline(row) : null;
}

export function deleteDeadline(db: DB, matterId: string, id: string): boolean {
  return db.prepare(`DELETE FROM deadlines WHERE id = ? AND matter_id = ?`).run(id, matterId).changes > 0;
}

function rowToDeadline(r: Record<string, unknown>): DeadlineRow {
  return {
    id: r.id as string,
    dueDate: r.due_date as string,
    title: r.title as string,
    detail: r.detail as string,
    kind: r.kind as DeadlineKind,
    source: r.source as string,
    done: !!r.done,
    createdAt: r.created_at as string,
  };
}
