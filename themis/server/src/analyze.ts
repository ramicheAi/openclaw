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
import { isLLMReady } from "./llm.js";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { callClaudeCode, isClaudeCodeProvider } from "./claude-code.js";

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
3. Be conservative — if you're not confident a fact is in the corpus, omit it.
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
        `=== ${d.bates} | ${d.type} | ${d.date} | from: ${d.author || "—"} | ${d.title} ===\n${d.body.slice(0, 8000)}`,
    )
    .join("\n\n");
  return `MATTER: ${matterName}\n\nCORPUS:\n\n${corpus}\n\n---\n\nAnalyze the corpus per the schema. Output strict JSON only.`;
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
  let raw: string;
  try {
    if (useCLI) {
      const r = await callClaudeCode(SYSTEM, userPrompt);
      raw = r.text;
    } else {
      const key = process.env.ANTHROPIC_API_KEY!;
      const client = new Anthropic({ apiKey: key });
      const model = process.env.THEMIS_LLM_MODEL ?? "claude-sonnet-4-5";
      const msg = await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
      });
      raw = msg.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("")
        .trim();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Friendlier explanation for the most common failure modes — the user
    // shouldn't have to parse 400 JSON blobs to know what to do.
    if (/credit balance is too low/i.test(msg)) {
      return {
        ok: false,
        error: "Anthropic credit balance is too low. Top up at https://console.anthropic.com/settings/billing then click Analyze again. (No data was sent for this attempt; the API rejected the call.)",
      };
    }
    if (/rate.?limit/i.test(msg)) {
      return { ok: false, error: "Anthropic rate-limited this request. Wait 30 seconds and click Analyze again." };
    }
    if (/invalid x-api-key|authentication/i.test(msg)) {
      return { ok: false, error: "ANTHROPIC_API_KEY is invalid or revoked. Replace it in ~/.themis-env and restart the server." };
    }
    return { ok: false, error: msg };
  }

  // Extract JSON from the response — Claude sometimes wraps with prose
  // despite the instructions. Find the outermost { ... } and parse that.
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "model_did_not_return_json" };
  let parsed: AnalyzeOutput;
  try {
    parsed = JSON.parse(m[0]) as AnalyzeOutput;
  } catch (err) {
    return { ok: false, error: `parse_failed: ${err instanceof Error ? err.message : String(err)}` };
  }

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

    // Entities: insert new ones, leave existing alone (idempotent).
    const existingEntities = db.prepare(`SELECT name FROM entities WHERE matter_id = ?`).all(matterId) as { name: string }[];
    const haveNames = new Set(existingEntities.map((e) => e.name.toLowerCase()));
    for (const e of parsed.entities ?? []) {
      if (!e.name || haveNames.has(e.name.toLowerCase())) continue;
      const id = `e-${randomUUID().slice(0, 8)}`;
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
        // Cheap mentions estimate: count case-insensitive substring hits in corpus.
        docs.reduce((n, d) => n + countOccurrences(d.body.toLowerCase(), e.name.toLowerCase()), 0),
        docs.find((d) => d.body.toLowerCase().includes(e.name.toLowerCase()))?.bates ?? "",
        JSON.stringify(e.relationships ?? []),
      );
    }

    // Events: insert with verified citation flag based on Bates whitelist.
    const existingEvents = db.prepare(`SELECT description FROM chronology_events WHERE matter_id = ?`).all(matterId) as { description: string }[];
    const haveDescs = new Set(existingEvents.map((e) => e.description));
    for (const ev of parsed.events ?? []) {
      if (!ev.date || !ev.description || !ev.bates) continue;
      if (haveDescs.has(ev.description)) continue;
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

  return {
    ok: true,
    entities: parsed.entities?.length ?? 0,
    events: parsed.events?.length ?? 0,
    hot: parsed.hot?.length ?? 0,
    gaps: parsed.gaps?.length ?? 0,
    provider: useCLI ? "claude-code" : "api",
  };
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
