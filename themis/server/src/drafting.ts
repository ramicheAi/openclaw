// Drafting — turn the chronology + case theory into a first draft of an
// actual filing or letter. Every factual sentence carries an inline Bates
// citation pulled from a chronology event the operator picked. Themis
// composes the prose; the operator owns the choices (which template, which
// events to ground in, what claims to lead with).
//
// Hard rules in the prompt:
//   1. Every factual sentence MUST cite one of the selected events' Bates ids.
//   2. Use only the claims/posture from the case theory the operator selected.
//   3. Conventions of the document kind (demand letters open with parties +
//      brief facts; motions to compel cite Rule 37 + the discovery request).
//   4. No fabricated authorities — Themis ASKS for any authority slots the
//      operator should fill in. (Authority verification happens in Cite Check.)
//
// Output is plain text with inline (BATES-IDS) citations the front-end renders
// as clickable chips.

import type { DB } from "./db.js";
import { getMatter, listChronology } from "./repo.js";
import { llmComplete } from "./llm.js";
import { listDamages, type DamagesCategory } from "./damages.js";
import { sanitizePromptText as sanitize } from "./text-utils.js";

export type DraftKind =
  | "demand-letter"
  | "complaint"
  | "motion-to-compel"
  | "discovery-responses"
  | "settlement-statement"
  | "case-summary"
  | "recruitment-report"
  | "perm-audit-response";

const KIND_INSTRUCTIONS: Record<DraftKind, { label: string; convention: string }> = {
  "demand-letter": {
    label: "Demand letter",
    convention: `Open with addressee + RE: line (matter caption). One paragraph identifying parties. Chronological factual recital, each fact cited to its Bates id. Liability paragraph stating the legal theory (negligence per se, breach, etc.) in plain English. Damages paragraph itemizing injuries and economic loss. Demand paragraph with a specific dollar figure (use [DEMAND AMOUNT] placeholder if not provided) and a response deadline (use [DATE] placeholder). Close with "Govern yourselves accordingly." and signature block.`,
  },
  "complaint": {
    label: "Complaint",
    convention: `Caption (court + parties). Numbered paragraphs. Jurisdiction + venue paragraphs (use [JURISDICTION] / [VENUE] placeholders). Parties paragraphs identifying plaintiff and defendant with addresses if available. Factual allegations as numbered paragraphs, each citing Bates ids. Counts (Count I — Negligence; Count II — etc.) each with elements pled. Prayer for relief.`,
  },
  "motion-to-compel": {
    label: "Motion to compel",
    convention: `Caption + title. Introduction stating what discovery is sought + why. Background (1-2 paragraphs of factual context cited to Bates ids). Discovery requests at issue (use [REQUEST TEXT] placeholders). Standard (cite FRCP 37 generically; specific authorities go through Cite Check before filing). Argument tying requests to relevance from the chronology. Conclusion + prayer. Certificate of conferral.`,
  },
  "discovery-responses": {
    label: "Discovery responses",
    convention: `Caption + title. General objections. Numbered request-by-request responses. Each substantive response cites Bates ids for any document being produced or referenced. Privilege log reference for withheld documents.`,
  },
  "settlement-statement": {
    label: "Settlement statement",
    convention: `Internal/work-product memo. Brief case summary. Strengths of plaintiff's case with Bates-cited facts. Weaknesses / defense theories. Damages model itemized (medicals, lost wages, pain & suffering with multipliers, future care). Range of acceptable settlement values. Recommended demand and bottom line.`,
  },
  "case-summary": {
    label: "Case summary",
    convention: `One-page executive memo. Parties + posture. Facts in chronological order with Bates citations. Claims/defenses. Status (where the case stands today). Open issues.`,
  },
  "recruitment-report": {
    label: "PERM recruitment report",
    convention: `Internal recruitment report documenting good-faith recruitment for a PERM labor certification (the file a DOL Certifying Officer reviews on audit). Open with the job opportunity — title, worksite, minimum requirements — and the prevailing wage. Give a chronological recital of each recruitment step ACTUALLY performed (PWD issuance, Notice of Filing posting dates, the two Sunday print ads with publication + dates, the SWA job order dates, and each of the three additional recruitment steps), every step cited to its Bates id. Then a numbered disposition of EVERY U.S. applicant: name, source, date received, and the lawful, JOB-RELATED reason for non-selection. CRITICAL — state a rejection reason ONLY if it appears in the cited source documents; if a reason is not documented, write the placeholder [ATTORNEY: state the lawful, job-related reason this applicant was rejected] and NEVER infer or invent one. Conclude that no able, willing, qualified, and available U.S. worker was found, with a total-applicants tally. This is the attorney's call to make on each disposition — Themis only organizes the record.`,
  },
  "perm-audit-response": {
    label: "PERM audit response",
    convention: `Cover letter responding to a DOL PERM audit notification, organized for the Certifying Officer and built to be filed within the 30-day window. Identify the case — [ETA CASE NO.], beneficiary, employer. Provide an itemized index of the enclosed audit-file exhibits, each cited to its Bates id and mapped to the specific item the audit letter requested. Address each requirement the audit raises using ONLY facts cited to Bates ids in the file. For any audit item the file does not support, write [ATTORNEY: address audit item — supporting document not in file] and NEVER assert a fact that is not in the cited record (a fabricated or unsupported assertion in an audit response is fatal — no new evidence is allowed on BALCA appeal). Close with a professional signature block.`,
  },
};

export interface DraftRequest {
  kind: DraftKind;
  /** Bates ids of chronology events the operator wants cited. Empty = use them all. */
  eventBates?: string[];
  /** Optional addressee for letters / caption preamble. */
  addressee?: string;
  /** Optional dollar figure for demand letters / settlement memos. */
  demandAmount?: string;
  /** Free-form extra instructions the operator wants honored. */
  instructions?: string;
}

const SYSTEM = `You are a senior litigation paralegal drafting a first-pass legal document for an attorney to revise.

Rules (apply to every draft):
1. Every factual sentence MUST cite at least one Bates id in the form (BATES-ID) immediately after the sentence. Use only the Bates ids provided in the SELECTED EVENTS section.
2. NEVER invent a case-law citation, statute, or rule number. If the document needs an authority, write the placeholder [AUTHORITY: <one-line description of what to find>] and a paralegal will fill it in via Cite Check.
3. Use plain, professional legal English. No filler. No throat-clearing.
4. Honor the document-kind conventions exactly.
5. Output plain text (no markdown headings beyond a single title line; line breaks are OK; do not wrap in code fences).`;

export async function generateDraft(
  db: DB,
  matterId: string,
  req: DraftRequest,
): Promise<{ ok: true; kind: DraftKind; draft: string } | { ok: false; error: string }> {
  const matter = getMatter(db, matterId);
  if (!matter) return { ok: false, error: "matter_not_found" };

  const conv = KIND_INSTRUCTIONS[req.kind];
  if (!conv) return { ok: false, error: `unknown_kind: ${req.kind}` };

  const allEvents = listChronology(db, matterId);
  const picked = req.eventBates && req.eventBates.length > 0
    ? allEvents.filter((e) => req.eventBates!.includes(e.citation.bates))
    : allEvents.filter((e) => e.accepted !== false);
  if (picked.length === 0) {
    return { ok: false, error: "No chronology events available to ground this draft. Accept events in the Chronology tab first, or run Analyze with Themis." };
  }

  const eventBlock = picked
    .slice(0, 100)
    .map((e) => `- ${e.date} — ${sanitize(e.description)} (${e.citation.bates}, p.${e.citation.page})`)
    .join("\n");

  // For settlement statements and demand letters, surface the damages model
  // (line items + per-category subtotals + grand total) so the draft can
  // pull real numbers instead of placeholders.
  const wantsDamages = req.kind === "settlement-statement" || req.kind === "demand-letter";
  const damagesBlock = wantsDamages ? formatDamages(db, matterId) : "";

  const theory = matter.caseTheory;
  const theoryBlock = theory
    ? [
        theory.posture ? `Posture: ${sanitize(theory.posture)}` : "",
        theory.claims?.length ? `Claims:\n${theory.claims.map((c) => `- ${c}`).join("\n")}` : "",
        theory.defenses?.length ? `Anticipated defenses:\n${theory.defenses.map((d) => `- ${d}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n")
    : "(case theory not yet built — run Analyze with Themis)";

  const user = `MATTER CAPTION: ${matter.name}
CLIENT: ${matter.client}
LEAD ATTORNEY: ${matter.leadAttorney}

DOCUMENT KIND: ${conv.label}
KIND CONVENTIONS: ${conv.convention}
${req.addressee ? `ADDRESSEE: ${req.addressee}\n` : ""}${req.demandAmount ? `DEMAND AMOUNT: ${req.demandAmount}\n` : ""}${req.instructions ? `EXTRA INSTRUCTIONS: ${req.instructions}\n` : ""}
CASE THEORY:
${theoryBlock}

SELECTED EVENTS (each line is a fact you may cite by its Bates id):
${eventBlock}
${damagesBlock ? `\nDAMAGES MODEL (use these numbers verbatim in the damages paragraph; do not invent):\n${damagesBlock}\n` : ""}
Write the first draft now. Every factual sentence must end with the relevant (BATES-ID). Use [AUTHORITY: ...] placeholders for any case law / statute / rule needed.`;

  const text = await llmComplete(SYSTEM, user, 4096);
  if (text === null) {
    return { ok: false, error: "LLM engine not configured. Set THEMIS_LLM_PROVIDER=claude-code or ANTHROPIC_API_KEY." };
  }
  return { ok: true, kind: req.kind, draft: text };
}

export function listDraftKinds(): { id: DraftKind; label: string }[] {
  return (Object.keys(KIND_INSTRUCTIONS) as DraftKind[]).map((id) => ({ id, label: KIND_INSTRUCTIONS[id].label }));
}

const CATEGORY_LABEL: Record<DamagesCategory, string> = {
  medical: "Medical",
  lost_wages: "Lost wages",
  property: "Property",
  pain_suffering: "Pain & suffering",
  future_care: "Future care",
  other: "Other",
};

function formatDamages(db: DB, matterId: string): string {
  const items = listDamages(db, matterId);
  if (items.length === 0) return "";
  const lines: string[] = [];
  const subtotals = new Map<DamagesCategory, number>();
  let total = 0;
  for (const it of items) {
    const eff = Math.round(it.amountCents * (it.multiplier || 1));
    total += eff;
    subtotals.set(it.category, (subtotals.get(it.category) ?? 0) + eff);
    const dollars = `$${(eff / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const anchor = it.citationBates ? ` (${it.citationBates})` : "";
    const mult = it.multiplier !== 1 ? ` [×${it.multiplier}]` : "";
    lines.push(`- ${CATEGORY_LABEL[it.category]}: ${it.description} — ${dollars}${mult}${anchor}`);
  }
  lines.push("");
  for (const [cat, sub] of subtotals) {
    lines.push(`${CATEGORY_LABEL[cat]} subtotal: $${(sub / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }
  lines.push(`TOTAL DAMAGES: $${(total / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  return lines.join("\n");
}
