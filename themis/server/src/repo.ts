import type { DB } from "./db.js";
import { jsonIn, jsonOut } from "./db.js";
import type {
  AuditEntry,
  CaseTheory,
  ChatTurn,
  ChronEvent,
  Confidence,
  DocItem,
  Entity,
  GapFinding,
  IngestStage,
  MatterDetail,
  MatterStatus,
  MatterSummary,
  PrivilegeStatus,
} from "./types.js";

type Row = Record<string, unknown>;

const computed = /* sql */ `
  (SELECT COUNT(*) FROM documents d WHERE d.matter_id = m.id AND d.hot = 1) AS hot_docs,
  (SELECT COUNT(*) FROM documents d WHERE d.matter_id = m.id AND d.privilege = 'flagged') AS priv_queue
`;

function rowToSummary(m: Row): MatterSummary {
  return {
    id: m.id as string,
    name: m.name as string,
    client: m.client as string,
    matterType: m.matter_type as string,
    leadAttorney: m.lead_attorney as string,
    status: m.status as MatterStatus,
    pages: m.pages as number,
    docs: m.docs as number,
    ingestPercent: m.ingest_percent as number,
    lastActivity: m.last_activity as string,
    hotDocs: Number(m.hot_docs ?? 0),
    privilegeQueue: Number(m.priv_queue ?? 0),
  };
}

export function listMatters(db: DB): MatterSummary[] {
  const rows = db.prepare(`SELECT m.*, ${computed} FROM matters m ORDER BY m.created_at`).all() as Row[];
  return rows.map(rowToSummary);
}

export function getMatter(db: DB, id: string): MatterDetail | null {
  const m = db.prepare(`SELECT m.*, ${computed} FROM matters m WHERE m.id = ?`).get(id) as Row | undefined;
  if (!m) return null;

  const caseTheory: CaseTheory = {
    posture: m.posture as string,
    claims: jsonOut(m.json_claims, [] as string[]),
    defenses: jsonOut(m.json_defenses, [] as string[]),
    keyDates: jsonOut(m.json_key_dates, [] as CaseTheory["keyDates"]),
  };
  const ingestStages = db
    .prepare(`SELECT label, done FROM ingest_stages WHERE matter_id = ? ORDER BY ord`)
    .all(id) as Row[];
  const gaps = db
    .prepare(`SELECT severity, text FROM gap_findings WHERE matter_id = ?`)
    .all(id) as Row[];

  return {
    ...rowToSummary(m),
    caseTheory,
    ingestStages: ingestStages.map((s): IngestStage => ({ label: s.label as string, done: !!s.done })),
    gapFindings: gaps.map((g): GapFinding => ({ severity: g.severity as GapFinding["severity"], text: g.text as string })),
  };
}

export function rowToDoc(d: Row): DocItem {
  return {
    id: d.id as string,
    bates: d.bates as string,
    title: d.title as string,
    type: d.type as string,
    date: d.doc_date as string,
    author: d.author as string,
    recipients: jsonOut(d.json_recipients, [] as string[]),
    summary: d.summary as string,
    entities: jsonOut(d.json_entities, [] as string[]),
    privilege: d.privilege as PrivilegeStatus,
    privilegeBasis: (d.privilege_basis as string | null) ?? undefined,
    hot: !!d.hot,
    threadId: (d.thread_id as string | null) ?? undefined,
    threadPos: (d.thread_pos as number | null) ?? undefined,
    threadLen: (d.thread_len as number | null) ?? undefined,
    duplicates: (d.duplicates as number | null) ?? undefined,
    ocrConfidence: d.ocr_confidence as Confidence,
    body: d.body as string,
    pages: d.pages as number,
  };
}

export function listDocuments(db: DB, matterId: string): DocItem[] {
  const rows = db
    .prepare(`SELECT * FROM documents WHERE matter_id = ? ORDER BY sort_order, doc_date`)
    .all(matterId) as Row[];
  return rows.map(rowToDoc);
}

export function getDocument(db: DB, matterId: string, docId: string): DocItem | null {
  const row = db.prepare(`SELECT * FROM documents WHERE matter_id = ? AND id = ?`).get(matterId, docId) as Row | undefined;
  return row ? rowToDoc(row) : null;
}

export function getDocumentByBates(db: DB, matterId: string, bates: string): DocItem | null {
  const row = db.prepare(`SELECT * FROM documents WHERE matter_id = ? AND bates = ?`).get(matterId, bates) as Row | undefined;
  return row ? rowToDoc(row) : null;
}

function rowToChron(c: Row): ChronEvent {
  return {
    id: c.id as string,
    date: c.event_date as string,
    description: c.description as string,
    citation: {
      bates: c.citation_bates as string,
      page: c.citation_page as number,
      verified: !!c.citation_verified,
    },
    confidence: c.confidence as Confidence,
    accepted: c.accepted === null || c.accepted === undefined ? null : !!c.accepted,
    issueTags: jsonOut(c.json_issue_tags, [] as string[]),
  };
}

export function listChronology(db: DB, matterId: string): ChronEvent[] {
  const rows = db
    .prepare(`SELECT * FROM chronology_events WHERE matter_id = ? ORDER BY event_date`)
    .all(matterId) as Row[];
  return rows.map(rowToChron);
}

export function setChronologyAccepted(db: DB, matterId: string, eventId: string, accepted: boolean | null): ChronEvent | null {
  const res = db
    .prepare(`UPDATE chronology_events SET accepted = ? WHERE matter_id = ? AND id = ?`)
    .run(accepted === null ? null : accepted ? 1 : 0, matterId, eventId);
  if (res.changes === 0) return null;
  const row = db.prepare(`SELECT * FROM chronology_events WHERE matter_id = ? AND id = ?`).get(matterId, eventId) as Row;
  return rowToChron(row);
}

export function listEntities(db: DB, matterId: string): Entity[] {
  const rows = db
    .prepare(`SELECT * FROM entities WHERE matter_id = ? ORDER BY mentions DESC`)
    .all(matterId) as Row[];
  return rows.map((e): Entity => ({
    id: e.id as string,
    name: e.name as string,
    role: e.role as string,
    org: e.org as string,
    aliases: jsonOut(e.json_aliases, [] as string[]),
    mentions: e.mentions as number,
    relationships: jsonOut(e.json_relationships, [] as Entity["relationships"]),
    firstSeen: e.first_seen as string,
  }));
}

export function listPrivilegeQueue(db: DB, matterId: string): DocItem[] {
  const rows = db
    .prepare(`SELECT * FROM documents WHERE matter_id = ? AND privilege IN ('flagged','cleared','withheld') ORDER BY sort_order`)
    .all(matterId) as Row[];
  return rows.map(rowToDoc);
}

export function setPrivilege(db: DB, matterId: string, docId: string, status: PrivilegeStatus): DocItem | null {
  const res = db.prepare(`UPDATE documents SET privilege = ? WHERE matter_id = ? AND id = ?`).run(status, matterId, docId);
  if (res.changes === 0) return null;
  return getDocument(db, matterId, docId);
}

function rowToChat(c: Row): ChatTurn {
  const citations = jsonOut(c.json_citations, [] as ChatTurn["citations"]);
  return {
    id: c.id as string,
    role: c.role as ChatTurn["role"],
    text: c.text as string,
    citations: citations && citations.length ? citations : undefined,
    confidence: (c.confidence as Confidence | null) ?? undefined,
    createdAt: c.created_at as string,
  };
}

export function listChat(db: DB, matterId: string): ChatTurn[] {
  const rows = db
    .prepare(`SELECT * FROM chat_messages WHERE matter_id = ? ORDER BY created_at, id`)
    .all(matterId) as Row[];
  return rows.map(rowToChat);
}

export function insertChat(db: DB, matterId: string, turn: ChatTurn): void {
  db.prepare(
    `INSERT INTO chat_messages (id, matter_id, role, text, json_citations, confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    turn.id,
    matterId,
    turn.role,
    turn.text,
    jsonIn(turn.citations ?? []),
    turn.confidence ?? null,
    turn.createdAt ?? new Date().toISOString(),
  );
}

export function audit(db: DB, matterId: string, actor: string, action: string, detail = ""): void {
  db.prepare(
    `INSERT INTO audit_log (matter_id, ts, actor, action, detail) VALUES (?, ?, ?, ?, ?)`,
  ).run(matterId, new Date().toISOString(), actor, action, detail);
}

export function listAudit(db: DB, matterId: string, limit = 50): AuditEntry[] {
  const rows = db
    .prepare(`SELECT * FROM audit_log WHERE matter_id = ? ORDER BY id DESC LIMIT ?`)
    .all(matterId, limit) as Row[];
  return rows.map((a): AuditEntry => ({
    id: a.id as number,
    ts: a.ts as string,
    actor: a.actor as string,
    action: a.action as string,
    detail: a.detail as string,
  }));
}

export function matterExists(db: DB, id: string): boolean {
  return !!db.prepare(`SELECT 1 FROM matters WHERE id = ?`).get(id);
}
