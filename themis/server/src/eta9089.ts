// PERM ETA-9089 consistency validator — cross-checks the key fields that MUST
// agree across the ETA-9089, the Prevailing Wage Determination (PWD), and the
// recruitment ads. Inconsistencies between these (a requirement on the 9089 not
// in the ads, a worksite mismatch, a wage below the PWD) are a leading PERM
// audit-denial cause. Themis surfaces the disagreement, cite-linked; it never
// invents a value or a Bates id — every reported value points to a real doc.

import type { DB } from "./db.js";
import { getMatter, listDocuments } from "./repo.js";
import { llmComplete } from "./llm.js";

export interface FieldValue {
  source: string; // e.g. "ETA-9089", "PWD", "Sunday ad #1"
  value: string;
  bates: string;
}

export interface ConsistencyFinding {
  field: string; // job title, minimum education, experience, worksite, wage, special requirements
  severity: "high" | "medium" | "low";
  status: "inconsistent" | "missing_source";
  values: FieldValue[];
  note?: string;
}

export interface Eta9089Report {
  total: number;
  high: number;
  clean: boolean; // true iff no high-severity finding
  findings: ConsistencyFinding[];
}

const SYSTEM = `You are Themis, a PERM ETA-9089 consistency checker. In a PERM labor certification the ETA-9089, the Prevailing Wage Determination (PWD), the Notice of Filing, and every recruitment advertisement must describe the SAME job — title, minimum education, minimum experience, special requirements, worksite, and a wage at or above the prevailing wage. Disagreements between them are a top audit-denial reason.

You are given the matter's DOCUMENTS. For these fields — job title, minimum education, minimum experience, special/specific requirements, worksite location, offered vs. prevailing wage — extract the value as stated in each relevant document (ETA-9089, PWD, Notice of Filing, each ad) and compare.

Hard rules:
1. Report a finding ONLY when documents actually DISAGREE on a field ("inconsistent"), or when a field that must be corroborated has no supporting source document ("missing_source"). Do not report fields that agree.
2. Every value you cite MUST carry the exact Bates id of the document it came from. NEVER invent a Bates id or a value — use only ids and text present in the DOCUMENTS list/snippets. If you cannot cite a real Bates id, omit that value.
3. Severity: wage below prevailing, a requirement on the 9089 absent from the ads, or a worksite mismatch are "high". Title/wording variations that are plausibly the same are "low".
4. Output ONLY one JSON object, strict, no prose, no markdown:
{ "findings": [ { "field": "string", "severity": "high|medium|low", "status": "inconsistent|missing_source", "values": [ { "source": "string", "value": "string", "bates": "string" } ], "note": "string?" } ] }`;

export async function validateEta9089(
  db: DB,
  matterId: string,
): Promise<{ ok: true; report: Eta9089Report } | { ok: false; error: string }> {
  const matter = getMatter(db, matterId);
  if (!matter) return { ok: false, error: "matter_not_found" };

  const docs = listDocuments(db, matterId);
  if (docs.length === 0) {
    return { ok: false, error: "no documents — upload the ETA-9089, PWD, and recruitment ads first" };
  }
  const validBates = new Set(docs.map((d) => d.bates));

  const corpus = docs
    .map((d) => `=== ${d.bates} | ${d.type} | ${d.date} | ${d.title} ===\n${sanitize(d.body).slice(0, 4000)}`)
    .join("\n\n");
  const user = `DOCUMENTS:\n\n${corpus}\n\n---\n\nExtract and compare the key PERM fields across the ETA-9089, PWD, Notice of Filing, and ads. Report only disagreements or missing required sources, each value cited to its Bates id. Output strict JSON only.`;

  const raw = await llmComplete(SYSTEM, user, 4096);
  if (raw === null) {
    return { ok: false, error: "LLM engine not configured. Set THEMIS_LLM_PROVIDER=claude-code or ANTHROPIC_API_KEY." };
  }

  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "model_did_not_return_json" };
  let parsed: { findings?: Array<Partial<ConsistencyFinding> & { values?: Array<Partial<FieldValue>> }> };
  try {
    parsed = JSON.parse(m[0]) as typeof parsed;
  } catch (err) {
    return { ok: false, error: `parse_failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Keep only findings whose cited values point at REAL documents — drop any
  // value with a fabricated/unknown Bates, and drop a finding that ends up with
  // fewer than one real citation (we never surface an uncited disagreement).
  const findings: ConsistencyFinding[] = [];
  for (const f of parsed.findings ?? []) {
    if (!f.field) continue;
    const values: FieldValue[] = (f.values ?? [])
      .filter((v): v is FieldValue => !!v && typeof v.value === "string" && typeof v.bates === "string" && validBates.has(v.bates))
      .map((v) => ({ source: v.source ?? "—", value: v.value, bates: v.bates }));
    if (values.length === 0) continue;
    const severity = f.severity === "high" || f.severity === "medium" || f.severity === "low" ? f.severity : "medium";
    const status = f.status === "inconsistent" || f.status === "missing_source" ? f.status : "inconsistent";
    findings.push({ field: f.field, severity, status, values, note: f.note });
  }

  const high = findings.filter((f) => f.severity === "high").length;
  return {
    ok: true,
    report: { total: findings.length, high, clean: high === 0, findings },
  };
}

function sanitize(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
