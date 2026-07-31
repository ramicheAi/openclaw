// Analyze a matter's document corpus with Claude — pulls out entities,
// chronology events, case theory, and gap findings, then persists each
// into the existing tables so the chronology / mini brain / scales /
// queue light up automatically.
//
// Single-shot: concatenates every doc's body with a Bates header, sends
// the whole bundle in one Claude call asking for a strict JSON shape.
// Skips the call when the LLM seam isn't ready; the route surfaces the
// error to the operator.

import type { DB } from "./db.js";
import { getMatter, listDocuments } from "./repo.js";
import { clearLastLLMError, isLLMReady, llmComplete, getLastLLMError, friendlyLLMError } from "./llm.js";
import { randomUUID } from "node:crypto";
import { isClaudeCodeProvider } from "./claude-code.js";
import { sanitizePromptText as sanitizeBody, extractJsonObject } from "./text-utils.js";

interface AnalyzeOutput {
  entities: Array<{
    name: string;
    role: string;
    org?: string;
    aliases?: string[];
    relationships?: { name: string; relation: string }[];
  }>;
  events: Array<{
    date: string; // YYYY-MM-DD
    description: string;
    bates: string; // ties back to a doc in the corpus
    page?: number;
    confidence?: "high" | "medium" | "low";
    issueTags?: string[];
  }>;
  theory: {
    posture: string;
    claims: string[];
    defenses: string[];
    keyDates: { label: string; date: string }[];
  };
  gaps?: Array<{ severity: "high" | "medium" | "low"; text: string }>;
  hot?: string[]; // Bates ids of probative documents
}

const SYSTEM = `You are Themis, an evidence-intelligence engine. You read a matter's document corpus and produce structured findings for a paralegal: people, events, case theory, hot documents, gaps.

Hard rules:
1. Every event MUST cite a Bates id that appears in the corpus. Do not invent Bates ids.
2. Dates MUST be ISO YYYY-MM-DD.
3. Be conservative on facts — if you're not confident a FACT is in the corpus, omit it. Be EXHAUSTIVE on entities — if a person is named in any document (caption, signature block, witness list, narrative, attorney letterhead, EMT roster, transcript speakers), include them. The case caption (matter name "X VS Y") names the plaintiff and defendant — they MUST appear as entities even if briefly mentioned. Every attorney, counsel, paralegal, or law firm named in any document MUST appear as an entity with role like "Plaintiff counsel" / "Defense counsel" / "Counsel — unknown side". Every police officer, deputy, EMT, witness, 911 caller, or treating physician named MUST appear.
4. Output ONLY a single JSON object. No prose. No markdown. Strict JSON, the schema below.

Schema:
{
  "entities": [
    { "name": "string", "role": "string", "org": "string?", "aliases": ["string"]?, "relationships": [{"name":"string","relation":"string"}]? }
  ],
  "events": [
    { "date": "YYYY-MM-DD", "description": "string", "bates": "string (must appear in corpus)", "page": 1, "confidence": "high|medium|low", "issueTags": ["string"] }
  ],
  "theory": {
    "posture": "one paragraph plain English",
    "claims": ["string"],
    "defenses": ["string"],
    "keyDates": [{ "label": "string", "date": "YYYY-MM-DD" }]
  },
  "gaps": [{ "severity": "high|medium|low", "text": "string" }],
  "hot": ["BATES-IDS"]
}`;

function buildPrompt(matterName: string, docs: { bates: string; title: string; type: string; date: string; author: string; body: string }[]): string {
  const corpus = docs
    .map(
      (d) =>
        `=== ${d.bates} | ${d.type} | ${d.date} | from: ${d.author || "—"} | ${d.title} ===\n${sanitizeBody(d.body).slice(0, 8000)}`,
    )
    .join("\n\n");
  // Parse the case caption from the matter name. "OLIVEIRA VS RAMIREZ" →
  // plaintiff Oliveira, defendant Ramirez. Surface to the model so it
  // knows to look for these parties in every doc and include them as
  // entities even if briefly mentioned.
  const cap = matterName.match(/^(.+?)\s+(?:VS?\.?|V\.?)\s+(.+?)$/i);
  const captionHint = cap
    ? `Case caption: plaintiff "${cap[1].trim()}", defendant "${cap[2].trim()}" — both MUST appear in the entities list.\n\n`
    : "";
  return `MATTER: ${matterName}\n\n${captionHint}CORPUS:\n\n${corpus}\n\n---\n\nAnalyze the corpus per the schema. Output strict JSON only.`;
}

export async function analyzeMatter(db: DB, matterId: string): Promise<{
  ok: true;
  entities: number;
  events: number;
  hot: number;
  gaps: number;
  provider: "api" | "claude-code";
} | { ok: false; error: string }> {
  const useCLI = isClaudeCodeProvider();
  if (!useCLI && !isLLMReady()) {
    return { ok: false, error: "ANTHROPIC_API_KEY not set (or set THEMIS_LLM_PROVIDER=claude-code to use the CLI)" };
  }
  const matter = getMatter(db, matterId);
  if (!matter) return { ok: false, error: "matter_not_found" };
  const docs = listDocuments(db, matterId).map((d) => ({
    bates: d.bates,
    title: d.title,
    type: d.type,
    date: d.date,
    author: d.author,
    body: d.body,
  }));
  if (docs.length === 0) return { ok: false, error: "no documents" };

  const userPrompt = buildPrompt(matter.name, docs);
  // One provider-switched call (CLI vs Anthropic SDK) lives in llmComplete; on
  // failure it returns null and stashes the raw error in getLastLLMError(),
  // which friendlyLLMError() maps to an actionable message for the operator.
  const raw = await llmComplete(SYSTEM, userPrompt, 4096);
  if (raw === null) {
    const le = getLastLLMError();
    return { ok: false, error: le ? friendlyLLMError(le) : "LLM call failed (no provider ready)." };
  }

  // Extract JSON from the response — Claude sometimes wraps with prose
  // despite the instructions. Find the outermost { ... } and parse that.
  const ex = extractJsonObject<AnalyzeOutput>(raw);
  if (!ex.ok) return { ok: false, error: ex.error };
  const parsed: AnalyzeOutput = ex.value;

  // Bates whitelist — every event must cite a real Bates in this corpus.
  const validBates = new Set(docs.map((d) => d.bates));

  const tx = db.transaction(() => {
    // Persist case theory.
    if (parsed.theory) {
      db.prepare(
        `UPDATE matters SET
           posture = ?,
           json_claims = ?,
           json_defenses = ?,
           json_key_dates = ?
         WHERE id = ?`,
      ).run(
        parsed.theory.posture ?? "",
        JSON.stringify(parsed.theory.claims ?? []),
        JSON.stringify(parsed.theory.defenses ?? []),
        JSON.stringify(parsed.theory.keyDates ?? []),
        matterId,
      );
    }

    // Entities: insert new ones, leave existing alone (idempotent). Dedup
    // key normalizes case + punctuation + whitespace so "Gabriel R Oliveira"
    // / "Gabriel R. Oliveira" / "Gabriel  R  Oliveira" collapse to one row.
    // The previous exact lowercase compare was leaking obvious duplicates
    // because the model would emit the same name with and without middle-
    // initial periods across runs.
    //
    // First pass: collapse any duplicates ALREADY in the table (leftovers
    // from earlier Analyze runs with the looser dedup). Keep the row with
    // the most mentions; delete the rest.
    const allExisting = db.prepare(
      `SELECT id, name, mentions FROM entities WHERE matter_id = ?`,
    ).all(matterId) as { id: string; name: string; mentions: number }[];
    const byNorm = new Map<string, { id: string; name: string; mentions: number }>();
    for (const row of allExisting) {
      const key = normName(row.name);
      const prev = byNorm.get(key);
      if (!prev) { byNorm.set(key, row); continue; }
      // Keep whichever has more mentions; delete the loser.
      const loser = prev.mentions >= row.mentions ? row : prev;
      const keeper = loser === row ? prev : row;
      db.prepare(`DELETE FROM entities WHERE id = ?`).run(loser.id);
      byNorm.set(key, keeper);
    }
    const haveNames = new Set(byNorm.keys());

    // Recount mentions for ALL existing rows under the fuzzy counter — fixes
    // the "0 mentions" cast members from earlier Analyze runs that used the
    // strict exact-substring counter.
    const allRows = db.prepare(
      `SELECT id, name, json_aliases FROM entities WHERE matter_id = ?`,
    ).all(matterId) as { id: string; name: string; json_aliases: string }[];
    const updateMentions = db.prepare(
      `UPDATE entities SET mentions = ?, first_seen = ? WHERE id = ?`,
    );
    for (const row of allRows) {
      let aliases: string[] = [];
      try { aliases = JSON.parse(row.json_aliases || "[]"); } catch { aliases = []; }
      const m = docs.reduce((n, d) => n + countMentions(d.body, row.name, aliases), 0);
      const fs = docs.find((d) => countMentions(d.body, row.name, aliases) > 0)?.bates ?? "";
      updateMentions.run(m, fs, row.id);
    }
    for (const e of parsed.entities ?? []) {
      if (!e.name) continue;
      const key = normName(e.name);
      if (haveNames.has(key)) continue;
      haveNames.add(key);
      const id = `e-${randomUUID().slice(0, 8)}`;
      // Mentions estimate is fuzzy: full-name match, "First Last" without
      // middle parts, AND "first … last" within 60 chars. Previously we
      // counted exact substring of the full canonical name, which missed
      // "Manuel Alvarez" / "M. Alvarez" / "Alvarez" when the canonical was
      // "Manuel A. Alvarez" — so deputies who were clearly in the report
      // showed up as 0 mentions in the cast.
      const mentionsCount = docs.reduce((n, d) => n + countMentions(d.body, e.name, e.aliases ?? []), 0);
      const firstSeen = docs.find((d) => countMentions(d.body, e.name, e.aliases ?? []) > 0)?.bates ?? "";
      db.prepare(
        `INSERT INTO entities (id, matter_id, name, role, org, json_aliases, mentions, first_seen, json_relationships)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        matterId,
        e.name,
        e.role ?? "—",
        e.org ?? "—",
        JSON.stringify(e.aliases ?? []),
        mentionsCount,
        firstSeen,
        JSON.stringify(e.relationships ?? []),
      );
    }

    // Events: dedup ACROSS re-analyses. Exact string match was leaking
    // duplicates because the model paraphrases the same fact each run
    // ("Domestic disturbance at 1502 East Hampton Circle. Maria Rebollar
    // told responding deputy…" vs. "Domestic disturbance at 1502 East
    // Hampton Circle. Deputy responded to 911 call. Maria Rebollar…").
    //
    // Dedup key: (date | bates | description-signature) where the signature
    // is the first 8 alpha tokens of the description, normalized. Two
    // entries with the same date + Bates + lead 8 tokens are treated as the
    // same event regardless of phrasing variation.
    //
    // First pass: collapse duplicates ALREADY in the table from prior runs.
    // Keep the row with the most informative description (longest one), and
    // preserve the accepted flag from whichever row had a decision.
    const allEvents = db.prepare(
      `SELECT id, event_date, description, citation_bates, accepted FROM chronology_events WHERE matter_id = ?`,
    ).all(matterId) as { id: string; event_date: string; description: string; citation_bates: string; accepted: number | null }[];
    const byEvent = new Map<string, { id: string; description: string; accepted: number | null }>();
    for (const row of allEvents) {
      const key = eventKey(row.event_date, row.citation_bates, row.description);
      const prev = byEvent.get(key);
      if (!prev) { byEvent.set(key, { id: row.id, description: row.description, accepted: row.accepted }); continue; }
      // Keep whichever description is longer (more informative); preserve
      // any non-null accepted decision.
      const winnerIsExisting = prev.description.length >= row.description.length;
      const keeper = winnerIsExisting ? prev : { id: row.id, description: row.description, accepted: row.accepted };
      const loser = winnerIsExisting ? { id: row.id, description: row.description, accepted: row.accepted } : prev;
      // Promote whichever accepted decision exists.
      if (keeper.accepted === null && loser.accepted !== null) keeper.accepted = loser.accepted;
      db.prepare(`UPDATE chronology_events SET accepted = ? WHERE id = ?`).run(keeper.accepted, keeper.id);
      db.prepare(`DELETE FROM chronology_events WHERE id = ?`).run(loser.id);
      byEvent.set(key, keeper);
    }
    const haveEventKeys = new Set(byEvent.keys());

    for (const ev of parsed.events ?? []) {
      if (!ev.date || !ev.description || !ev.bates) continue;
      const key = eventKey(ev.date, ev.bates, ev.description);
      if (haveEventKeys.has(key)) continue;
      haveEventKeys.add(key);
      const verified = validBates.has(ev.bates);
      const id = `c-${randomUUID().slice(0, 8)}`;
      db.prepare(
        `INSERT INTO chronology_events
          (id, matter_id, event_date, description, citation_bates, citation_page, citation_verified, confidence, accepted, json_issue_tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        id,
        matterId,
        ev.date,
        ev.description,
        ev.bates,
        ev.page ?? 1,
        verified ? 1 : 0,
        ev.confidence ?? "medium",
        JSON.stringify(ev.issueTags ?? []),
      );
    }

    // Hot docs: mark Bates listed in `hot` as hot=1.
    for (const bates of parsed.hot ?? []) {
      if (!validBates.has(bates)) continue;
      db.prepare(`UPDATE documents SET hot = 1 WHERE matter_id = ? AND bates = ?`).run(matterId, bates);
    }

    // Gap findings: replace the matter's gaps with the freshest set.
    db.prepare(`DELETE FROM gap_findings WHERE matter_id = ?`).run(matterId);
    for (const g of parsed.gaps ?? []) {
      if (!g.text) continue;
      db.prepare(
        `INSERT INTO gap_findings (id, matter_id, severity, text) VALUES (?, ?, ?, ?)`,
      ).run(randomUUID(), matterId, g.severity ?? "low", g.text);
    }
  });
  try {
    tx();
  } catch (err) {
    // Surface SQLite errors with the full column / constraint message
    // instead of letting them bubble up as opaque 500s. The previous
    // 'created_at' missing-column bug took two screenshots to find
    // because Hono swallowed it as 'internal_error'.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[analyze] persistence failed:", msg);
    return { ok: false, error: `Persistence failed: ${msg}` };
  }

  // Successful round-trip — clear any stale "LLM ERR" left over from earlier
  // failures so the engine pill stops crying wolf on the next page load.
  clearLastLLMError();

  return {
    ok: true,
    entities: parsed.entities?.length ?? 0,
    events: parsed.events?.length ?? 0,
    hot: parsed.hot?.length ?? 0,
    gaps: parsed.gaps?.length ?? 0,
    provider: useCLI ? "claude-code" : "api",
  };
}

// Normalize a person name for dedup: lowercase, strip periods/commas,
// collapse whitespace. Keeps the original cased version in the row;
// only the lookup key is normalized.
// Key a chronology event by its semantic identity, not its literal phrasing.
// Two model runs produce slightly different prose for the same fact; we
// match on (date | bates | first 8 alpha tokens), case + punct + space
// normalized. Avoids the wall of near-duplicate events that piled up when
// the operator re-ran Analyze.
function eventKey(date: string, bates: string, description: string): string {
  const tokens = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8)
    .join(" ");
  return `${date}|${bates}|${tokens}`;
}

function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let i = 0;
  let n = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}

// Count fuzzy mentions of a person. Order of preference, scored by sum:
//   - full canonical hits (highest fidelity)
//   - "First Last" without middle initials/names
//   - last-name hits adjacent to first-name within a 60-char window
//   - declared aliases (each as a substring)
// Names shorter than 3 chars are skipped (too noisy — "Al", "J.", etc.).
function countMentions(body: string, canonical: string, aliases: string[]): number {
  if (!canonical) return 0;
  const lower = body.toLowerCase();
  // Strip honorifics and punctuation from the canonical for tokenizing.
  const clean = canonical
    .replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|officer|deputy|d\/s|inv\.?|sgt\.?|det\.?)\s+/i, "")
    .replace(/[.,]/g, "")
    .trim();
  const tokens = clean.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;

  let total = 0;
  // 1) Full canonical hits.
  const fullKey = canonical.toLowerCase().trim();
  if (fullKey.length >= 3) total += countOccurrences(lower, fullKey);

  // 2) First + Last without middles.
  if (tokens.length >= 2) {
    const first = tokens[0].toLowerCase();
    const last = tokens[tokens.length - 1].toLowerCase();
    const flKey = `${first} ${last}`;
    if (flKey !== fullKey && flKey.length >= 3) total += countOccurrences(lower, flKey);

    // 3) "first ... last" within 60 chars (handles "Manuel A. Alvarez" matching
    //    "Manuel Antonio Alvarez", "Manuel A Alvarez", "Manuel, who is also
    //    Alvarez", etc.) Only count if last name is unique-ish (>=4 chars) so
    //    common words like "King" don't false-positive.
    if (last.length >= 4) {
      const re = new RegExp(
        `\\b${escapeReg(first)}\\b[\\s\\S]{0,60}?\\b${escapeReg(last)}\\b`,
        "gi",
      );
      while (re.exec(body) !== null) total++;
    }
  }

  // 4) Declared aliases — each as a substring hit.
  for (const a of aliases) {
    const k = a.toLowerCase().trim();
    if (k.length >= 3 && k !== fullKey) total += countOccurrences(lower, k);
  }

  return total;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
