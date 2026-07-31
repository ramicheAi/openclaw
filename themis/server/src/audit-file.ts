// PERM audit-file completeness — match a matter's documents against a pack's
// required-exhibit checklist and report present / partial / missing per item.
// This is the BALCA-proof gate: no new evidence is allowed on appeal, so the
// file must be complete BEFORE filing. Themis flags what's missing; it never
// invents a document or a Bates id — every "present" cites a real doc in the
// corpus, and a present/partial verdict with no real Bates is demoted to
// "missing" (a false "present" on an audit file is dangerous).

import type { DB } from "./db.js";
import { getMatter, listDocuments } from "./repo.js";
import { llmComplete } from "./llm.js";
import { packById } from "./packs.js";
import { extractJsonObject } from "./text-utils.js";

export type CoverageStatus = "present" | "partial" | "missing";

export interface CoverageRow {
  label: string;
  severity: "high" | "medium" | "low";
  status: CoverageStatus;
  bates?: string;
  note?: string;
}

export interface AuditFileReport {
  packId: string;
  packLabel: string;
  total: number;
  present: number;
  partial: number;
  missing: number;
  highMissing: number; // high-severity items still missing — the filing blockers
  ready: boolean; // true iff no high-severity required exhibit is missing
  rows: CoverageRow[];
}

const SYSTEM = `You are Themis, an audit-file completeness checker for a legal filing (e.g. a PERM labor certification, where no new evidence is allowed on appeal — the file must be complete before filing).

You are given a REQUIRED-EXHIBIT CHECKLIST and the DOCUMENTS currently in the matter. For each checklist item, decide whether the documents satisfy it.

Hard rules:
1. For each checklist item return one status: "present" (a document clearly satisfies it), "partial" (some but not all of what the item requires is present), or "missing" (nothing in the documents satisfies it).
2. If present or partial, cite the matching document's exact Bates id. NEVER invent a Bates id — use only ids that appear in the DOCUMENTS list. If you cannot point to a real Bates id, the status is "missing".
3. Be conservative: when unsure, prefer "partial" or "missing" over "present". A false "present" on an audit file is dangerous.
4. Output ONLY one JSON object, strict, no prose, no markdown:
{ "rows": [ { "label": "<verbatim checklist label>", "status": "present|partial|missing", "bates": "<id or omit>", "note": "<short, optional>" } ] }`;

export async function checkAuditFile(
  db: DB,
  matterId: string,
  packId: string,
): Promise<{ ok: true; report: AuditFileReport } | { ok: false; error: string }> {
  const matter = getMatter(db, matterId);
  if (!matter) return { ok: false, error: "matter_not_found" };

  const pack = packById(packId);
  const checklist = pack.evidenceChecklist;
  if (checklist.length === 0) {
    return { ok: false, error: `pack "${packId}" has no audit checklist` };
  }

  const docs = listDocuments(db, matterId).map((d) => ({
    bates: d.bates,
    title: d.title,
    type: d.type,
    date: d.date,
  }));
  const validBates = new Set(docs.map((d) => d.bates));

  const buildReport = (rows: CoverageRow[]): AuditFileReport => {
    const present = rows.filter((r) => r.status === "present").length;
    const partial = rows.filter((r) => r.status === "partial").length;
    const missing = rows.filter((r) => r.status === "missing").length;
    const highMissing = rows.filter((r) => r.status === "missing" && r.severity === "high").length;
    return {
      packId: pack.id,
      packLabel: pack.label,
      total: rows.length,
      present,
      partial,
      missing,
      highMissing,
      ready: highMissing === 0,
      rows,
    };
  };

  // No documents → everything is missing. Deterministic, no LLM call needed.
  if (docs.length === 0) {
    const rows: CoverageRow[] = checklist.map((it) => ({
      label: it.label,
      severity: it.severity ?? "medium",
      status: "missing" as const,
    }));
    return { ok: true, report: buildReport(rows) };
  }

  const checklistBlock = checklist
    .map((it, i) => `${i + 1}. [${it.severity ?? "medium"}] ${it.label}`)
    .join("\n");
  const docBlock = docs.map((d) => `- ${d.bates} | ${d.type} | ${d.date} | ${d.title}`).join("\n");
  const user = `REQUIRED-EXHIBIT CHECKLIST (${pack.label}):\n${checklistBlock}\n\nDOCUMENTS IN MATTER:\n${docBlock}\n\nMap every checklist item to present/partial/missing per the rules. Output strict JSON only.`;

  const raw = await llmComplete(SYSTEM, user, 4096);
  if (raw === null) {
    return { ok: false, error: "LLM engine not configured. Set THEMIS_LLM_PROVIDER=claude-code or ANTHROPIC_API_KEY." };
  }

  const ex = extractJsonObject<{ rows?: Array<{ label?: string; status?: string; bates?: string; note?: string }> }>(raw);
  if (!ex.ok) return { ok: false, error: ex.error };
  const parsed = ex.value;

  // Build the report off the AUTHORITATIVE checklist (not the model's echo) so
  // every required item is accounted for even if the model drops one. Match the
  // model's verdicts back by normalized label; unmatched items default to missing.
  const byLabel = new Map<string, { status?: string; bates?: string; note?: string }>();
  for (const r of parsed.rows ?? []) {
    if (r.label) byLabel.set(norm(r.label), r);
  }
  const rows: CoverageRow[] = checklist.map((it) => {
    const v = byLabel.get(norm(it.label));
    let status: CoverageStatus =
      v?.status === "present" || v?.status === "partial" ? v.status : "missing";
    // Enforce rule 2: a present/partial verdict must cite a REAL Bates id;
    // otherwise demote to missing so we never claim an exhibit we can't point to.
    const bates = v?.bates && validBates.has(v.bates) ? v.bates : undefined;
    if ((status === "present" || status === "partial") && !bates) status = "missing";
    return { label: it.label, severity: it.severity ?? "medium", status, bates, note: v?.note };
  });

  return { ok: true, report: buildReport(rows) };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
