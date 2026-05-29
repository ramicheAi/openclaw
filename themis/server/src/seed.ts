import { randomUUID } from "node:crypto";
import { getDb, jsonIn, type DB } from "./db.js";
import { verifyCitation } from "./services.js";
import {
  chronologyEvents,
  documents,
  entityRecords,
  matters,
  seedChat,
} from "./seed-data.js";

const TABLES = [
  "audit_log",
  "chat_messages",
  "entities",
  "chronology_events",
  "documents",
  "gap_findings",
  "ingest_stages",
  "matters",
];

function wipe(db: DB) {
  for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
}

export function isSeeded(db: DB): boolean {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM matters`).get() as { n: number };
  return row.n > 0;
}

export function seed(db: DB, { reset = false }: { reset?: boolean } = {}): void {
  if (isSeeded(db) && !reset) return;

  const run = db.transaction(() => {
    wipe(db);
    const base = Date.parse("2026-05-01T09:00:00Z");

    matters.forEach((m, idx) => {
      db.prepare(
        `INSERT INTO matters
          (id, name, client, matter_type, lead_attorney, status, pages, docs, ingest_percent,
           last_activity, posture, json_claims, json_defenses, json_key_dates, created_at)
         VALUES (@id, @name, @client, @matter_type, @lead_attorney, @status, @pages, @docs, @ingest_percent,
           @last_activity, @posture, @json_claims, @json_defenses, @json_key_dates, @created_at)`,
      ).run({
        id: m.id,
        name: m.name,
        client: m.client,
        matter_type: m.matterType,
        lead_attorney: m.leadAttorney,
        status: m.status,
        pages: m.pages,
        docs: m.docs,
        ingest_percent: m.ingestPercent,
        last_activity: m.lastActivity,
        posture: m.caseTheory.posture,
        json_claims: jsonIn(m.caseTheory.claims),
        json_defenses: jsonIn(m.caseTheory.defenses),
        json_key_dates: jsonIn(m.caseTheory.keyDates),
        created_at: new Date(base + idx * 1000).toISOString(),
      });

      m.ingestStages.forEach((s, ord) =>
        db
          .prepare(`INSERT INTO ingest_stages (matter_id, ord, label, done) VALUES (?, ?, ?, ?)`)
          .run(m.id, ord, s.label, s.done ? 1 : 0),
      );

      for (const g of m.gapFindings) {
        db.prepare(`INSERT INTO gap_findings (id, matter_id, severity, text) VALUES (?, ?, ?, ?)`).run(
          randomUUID(),
          m.id,
          g.severity,
          g.text,
        );
      }

      for (const d of documents[m.id] ?? []) {
        db.prepare(
          `INSERT INTO documents
            (id, matter_id, bates, title, type, doc_date, author, json_recipients, summary,
             json_entities, privilege, privilege_basis, hot, thread_id, thread_pos, thread_len,
             duplicates, ocr_confidence, body, pages, sort_order)
           VALUES (@id, @matter_id, @bates, @title, @type, @doc_date, @author, @json_recipients, @summary,
             @json_entities, @privilege, @privilege_basis, @hot, @thread_id, @thread_pos, @thread_len,
             @duplicates, @ocr_confidence, @body, @pages, @sort_order)`,
        ).run({
          id: d.id,
          matter_id: m.id,
          bates: d.bates,
          title: d.title,
          type: d.type,
          doc_date: d.date,
          author: d.author,
          json_recipients: jsonIn(d.recipients),
          summary: d.summary,
          json_entities: jsonIn(d.entities),
          privilege: d.privilege,
          privilege_basis: d.privilegeBasis ?? null,
          hot: d.hot ? 1 : 0,
          thread_id: d.threadId ?? null,
          thread_pos: d.threadPos ?? null,
          thread_len: d.threadLen ?? null,
          duplicates: d.duplicates ?? null,
          ocr_confidence: d.ocrConfidence,
          body: d.body,
          pages: d.pages ?? 1,
          sort_order: d.sortOrder,
        });
      }

      // Chronology — verify each citation against the documents just inserted.
      for (const c of chronologyEvents[m.id] ?? []) {
        const verified = verifyCitation(db, m.id, c.bates, c.page);
        db.prepare(
          `INSERT INTO chronology_events
            (id, matter_id, event_date, description, citation_bates, citation_page, citation_verified,
             confidence, accepted, json_issue_tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          c.id,
          m.id,
          c.date,
          c.description,
          c.bates,
          c.page,
          verified ? 1 : 0,
          c.confidence,
          c.accepted === null ? null : c.accepted ? 1 : 0,
          jsonIn(c.issueTags),
        );
      }

      for (const e of entityRecords[m.id] ?? []) {
        db.prepare(
          `INSERT INTO entities
            (id, matter_id, name, role, org, json_aliases, mentions, json_relationships, first_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(e.id, m.id, e.name, e.role, e.org, jsonIn(e.aliases), e.mentions, jsonIn(e.relationships), e.firstSeen);
      }

      (seedChat[m.id] ?? []).forEach((t, i) => {
        const citations = (t.bates ?? []).map((b) => ({
          bates: b.bates,
          page: b.page,
          verified: verifyCitation(db, m.id, b.bates, b.page),
        }));
        db.prepare(
          `INSERT INTO chat_messages (id, matter_id, role, text, json_citations, confidence, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          t.id,
          m.id,
          t.role,
          t.text,
          jsonIn(citations),
          t.confidence ?? null,
          new Date(base + 3600_000 + i * 1000).toISOString(),
        );
      });
    });

    // Default causal chain for Reyes (the 32-day retaliation arc).
    db.prepare(
      `INSERT INTO causal_chains (id, matter_id, name, json_nodes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "reyes-retaliation",
      "reyes-northwind",
      "Retaliation: 32 days from complaint to termination",
      jsonIn([
        { kind: "event", id: "c2" },
        { kind: "event", id: "c3" },
        { kind: "event", id: "c4" },
        { kind: "event", id: "c5" },
        { kind: "event", id: "c6" },
      ]),
      "themis",
      new Date(base + 7000_000).toISOString(),
    );

    // A few historical audit entries for the lead matter so the trail isn't empty.
    const reyes = "reyes-northwind";
    const seedAudit: [string, string, string][] = [
      ["D. Okafor", "chronology.accept", "NW-001120 accepted into chronology"],
      ["themis", "privilege.flag", "NW-002310 flagged: attorney-client (L. Stein)"],
      ["themis", "ingest.complete", "84,213 pages indexed; dedup + threading applied"],
    ];
    seedAudit.forEach(([actor, action, detail], i) => {
      db.prepare(
        `INSERT INTO audit_log (matter_id, ts, actor, action, detail) VALUES (?, ?, ?, ?, ?)`,
      ).run(reyes, new Date(base + 7200_000 + i * 1000).toISOString(), actor, action, detail);
    });
  });

  run();
}

// Allow running directly: `tsx src/seed.ts [--reset]`
const invokedDirectly = process.argv[1]?.endsWith("seed.ts");
if (invokedDirectly) {
  const reset = process.argv.includes("--reset");
  const db = getDb();
  seed(db, { reset });
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM matters`).get() as { n: number }).n;
  console.log(`Seeded. matters=${n}${reset ? " (reset)" : ""}`);
}
