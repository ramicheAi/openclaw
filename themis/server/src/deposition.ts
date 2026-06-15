// Deposition outline builder — turns what Themis already knows about a witness
// (their role, the chronology events they touch, the documents they appear in,
// the hot docs) into a structured examination outline a paralegal can hand an
// attorney. Every question that rests on a document carries its Bates id so
// the attorney can pull the exhibit mid-depo.
//
// This closes the "no eDiscovery platform connects to trial prep" gap: the
// chronology and entity graph the corpus already produced become the depo
// prep, with zero re-keying.

import type { DB } from "./db.js";
import { getMatter, listChronology, listDocuments, listEntities } from "./repo.js";
import { llmComplete } from "./llm.js";
import { sanitizePromptText as sanitize, extractJsonObject } from "./text-utils.js";

export interface DepoTopic {
  topic: string;
  goal: string; // what the examiner is trying to establish
  questions: string[];
  exhibits: string[]; // Bates ids to have ready for this topic
}

export interface DepoOutline {
  witness: string;
  role: string;
  background: string; // 1-2 sentence framing of why this witness matters
  topics: DepoTopic[];
}

const SYSTEM = `You are a senior litigation paralegal preparing a deposition outline for an attorney. You produce a focused, logically ordered examination outline for ONE witness, grounded strictly in the case record provided.

Rules:
1. Build topics in a sensible examination order: background/foundation first, then the substantive areas, then any impeachment/credibility areas last.
2. Every question must be answerable from or probe the case record. Do not invent facts. You may ask open-ended foundational questions ("Describe your training") even if not in the record.
3. When a question rests on a specific document, list that document's Bates id in the topic's "exhibits" array so the attorney can pull it.
4. Be specific and practical — these are questions an attorney will actually read aloud. Avoid vague filler.
5. Output ONLY a single strict JSON object, no prose, no markdown fences.

Schema:
{
  "witness": "string",
  "role": "string",
  "background": "one to two sentences on why this witness matters to the case",
  "topics": [
    { "topic": "string", "goal": "string", "questions": ["string", ...], "exhibits": ["BATES-ID", ...] }
  ]
}`;

export async function buildDepositionOutline(
  db: DB,
  matterId: string,
  witnessName: string,
): Promise<{ ok: true; outline: DepoOutline } | { ok: false; error: string }> {
  const matter = getMatter(db, matterId);
  if (!matter) return { ok: false, error: "matter_not_found" };

  const entities = listEntities(db, matterId);
  const witness = entities.find((e) => e.name.toLowerCase() === witnessName.toLowerCase());
  const aliasSet = new Set<string>([witnessName.toLowerCase(), ...(witness?.aliases ?? []).map((a) => a.toLowerCase())]);

  // Documents that mention the witness, plus all hot docs (always relevant).
  const docs = listDocuments(db, matterId);
  const relevantDocs = docs.filter(
    (d) =>
      d.hot ||
      d.entities.some((e) => aliasSet.has(e.toLowerCase())) ||
      [...aliasSet].some((a) => d.body.toLowerCase().includes(a)),
  );

  // Chronology events that mention the witness or cite a relevant doc.
  const relevantBates = new Set(relevantDocs.map((d) => d.bates));
  const events = listChronology(db, matterId).filter(
    (ev) =>
      relevantBates.has(ev.citation.bates) ||
      [...aliasSet].some((a) => ev.description.toLowerCase().includes(a)),
  );

  if (relevantDocs.length === 0 && events.length === 0) {
    return {
      ok: false,
      error: `No documents or chronology events reference "${witnessName}". Run Analyze with Themis first, or pick a witness who appears in the corpus.`,
    };
  }

  const docBlock = relevantDocs
    .slice(0, 40)
    .map((d) => `- ${d.bates} | ${d.type} | ${d.date} | ${d.title}${d.hot ? " [HOT]" : ""}\n  ${sanitize(d.summary || d.body.slice(0, 400))}`)
    .join("\n");
  const eventBlock = events
    .slice(0, 60)
    .map((ev) => `- ${ev.date} — ${sanitize(ev.description)} (cite ${ev.citation.bates})`)
    .join("\n");

  const user = `MATTER: ${matter.name}
CASE POSTURE: ${matter.caseTheory?.posture ?? "(not yet analyzed)"}

WITNESS: ${witnessName}${witness ? ` — ${witness.role}${witness.org && witness.org !== "—" ? `, ${witness.org}` : ""}` : ""}

CHRONOLOGY EVENTS INVOLVING THIS WITNESS OR THEIR DOCUMENTS:
${eventBlock || "(none)"}

DOCUMENTS INVOLVING THIS WITNESS (and hot documents):
${docBlock || "(none)"}

Produce the deposition outline JSON for this witness.`;

  const raw = await llmComplete(SYSTEM, user, 3072);
  if (raw === null) {
    return {
      ok: false,
      error: "LLM engine not configured. Set THEMIS_LLM_PROVIDER=claude-code (Max plan) or ANTHROPIC_API_KEY, then retry.",
    };
  }

  const ex = extractJsonObject<DepoOutline>(raw);
  if (!ex.ok) return { ok: false, error: ex.error };
  const parsed: DepoOutline = ex.value;
  // Guard the shape so the client never has to defend against undefineds.
  parsed.witness ||= witnessName;
  parsed.role ||= witness?.role ?? "";
  parsed.background ||= "";
  parsed.topics = (parsed.topics ?? []).map((t) => ({
    topic: t.topic ?? "",
    goal: t.goal ?? "",
    questions: Array.isArray(t.questions) ? t.questions : [],
    exhibits: Array.isArray(t.exhibits) ? t.exhibits.filter((b) => relevantBates.has(b) || docs.some((d) => d.bates === b)) : [],
  }));

  return { ok: true, outline: parsed };
}
