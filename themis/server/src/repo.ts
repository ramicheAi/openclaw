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
    reviewed: !!d.reviewed,
    reviewedBy: (d.reviewed_by as string | null) ?? undefined,
    reviewedAt: (d.reviewed_at as string | null) ?? undefined,
  };
}

export function setDocReview(
  db: DB,
  matterId: string,
  docId: string,
  patch: { hot?: boolean; reviewed?: boolean },
  actor: string,
): DocItem | null {
  const exists = !!db.prepare(`SELECT 1 FROM documents WHERE matter_id = ? AND id = ?`).get(matterId, docId);
  if (!exists) return null;
  const now = new Date().toISOString();
  if (typeof patch.hot === "boolean") {
    db.prepare(
      `UPDATE documents SET hot = ?, hot_set_by = ?, hot_set_at = ? WHERE matter_id = ? AND id = ?`,
    ).run(patch.hot ? 1 : 0, patch.hot ? actor : null, patch.hot ? now : null, matterId, docId);
  }
  if (typeof patch.reviewed === "boolean") {
    db.prepare(
      `UPDATE documents SET reviewed = ?, reviewed_by = ?, reviewed_at = ? WHERE matter_id = ? AND id = ?`,
    ).run(patch.reviewed ? 1 : 0, patch.reviewed ? actor : null, patch.reviewed ? now : null, matterId, docId);
  }
  return getDocument(db, matterId, docId);
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

import { createHash } from "node:crypto";

// Tamper-evident, hash-chained audit. Each entry's entry_hash = SHA-256 of
// (matter_id | ts | actor | action | detail | prev_hash) so any rewrite
// breaks the chain at the point of tampering.
export function audit(db: DB, matterId: string, actor: string, action: string, detail = ""): void {
  const ts = new Date().toISOString();
  const prevRow = db
    .prepare(`SELECT entry_hash FROM audit_log WHERE matter_id = ? ORDER BY id DESC LIMIT 1`)
    .get(matterId) as { entry_hash: string } | undefined;
  const prevHash = prevRow?.entry_hash ?? "";
  const entryHash = hashAuditEntry({ matterId, ts, actor, action, detail, prevHash });
  db.prepare(
    `INSERT INTO audit_log (matter_id, ts, actor, action, detail, prev_hash, entry_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(matterId, ts, actor, action, detail, prevHash, entryHash);
}

export function hashAuditEntry(e: {
  matterId: string;
  ts: string;
  actor: string;
  action: string;
  detail: string;
  prevHash: string;
}): string {
  const h = createHash("sha256");
  h.update(`${e.matterId}${e.ts}${e.actor}${e.action}${e.detail}${e.prevHash}`);
  return h.digest("hex");
}

export interface AuditChainStatus {
  entries: number;
  broken: boolean;
  brokenAt?: number;
  reason?: string;
}

export function verifyAuditChain(db: DB, matterId: string): AuditChainStatus {
  const rows = db
    .prepare(`SELECT * FROM audit_log WHERE matter_id = ? ORDER BY id ASC`)
    .all(matterId) as Row[];
  let expectedPrev = "";
  for (const r of rows) {
    const ts = r.ts as string;
    const actor = r.actor as string;
    const action = r.action as string;
    const detail = (r.detail as string) ?? "";
    const prevHash = (r.prev_hash as string) ?? "";
    const entryHash = (r.entry_hash as string) ?? "";
    if (prevHash !== expectedPrev) {
      return { entries: rows.length, broken: true, brokenAt: r.id as number, reason: "prev_hash mismatch" };
    }
    const expectedHash = hashAuditEntry({ matterId, ts, actor, action, detail, prevHash });
    if (entryHash !== expectedHash) {
      return { entries: rows.length, broken: true, brokenAt: r.id as number, reason: "entry_hash mismatch" };
    }
    expectedPrev = entryHash;
  }
  return { entries: rows.length, broken: false };
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

// --- Binders ---
import type { Binder, BinderItem } from "./types.js";
import { randomUUID } from "node:crypto";

function rowToBinderItem(r: Row): BinderItem {
  return {
    id: r.id as string,
    docId: r.doc_id as string,
    label: r.label as string,
    bates: r.bates as string,
    type: r.type as string,
    date: r.doc_date as string,
  };
}

function fetchBinderItems(db: DB, binderId: string): BinderItem[] {
  const rows = db
    .prepare(
      `SELECT bi.id, bi.doc_id, bi.label, d.bates, d.type, d.doc_date
       FROM binder_items bi
       JOIN documents d ON d.id = bi.doc_id
       WHERE bi.binder_id = ?
       ORDER BY bi.ord, bi.id`,
    )
    .all(binderId) as Row[];
  return rows.map(rowToBinderItem);
}

export function listBinders(db: DB, matterId: string): Binder[] {
  const rows = db
    .prepare(`SELECT * FROM binders WHERE matter_id = ? ORDER BY created_at`)
    .all(matterId) as Row[];
  return rows.map((b) => ({
    id: b.id as string,
    matterId: b.matter_id as string,
    name: b.name as string,
    createdBy: b.created_by as string,
    createdAt: b.created_at as string,
    items: fetchBinderItems(db, b.id as string),
  }));
}

export function getBinder(db: DB, matterId: string, binderId: string): Binder | null {
  const row = db
    .prepare(`SELECT * FROM binders WHERE matter_id = ? AND id = ?`)
    .get(matterId, binderId) as Row | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    matterId: row.matter_id as string,
    name: row.name as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    items: fetchBinderItems(db, row.id as string),
  };
}

export function createBinder(db: DB, matterId: string, name: string, actor: string): Binder {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO binders (id, matter_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, matterId, name, actor, new Date().toISOString());
  return getBinder(db, matterId, id)!;
}

export function renameBinder(db: DB, matterId: string, binderId: string, name: string): Binder | null {
  const res = db.prepare(`UPDATE binders SET name = ? WHERE matter_id = ? AND id = ?`).run(name, matterId, binderId);
  if (res.changes === 0) return null;
  return getBinder(db, matterId, binderId);
}

export function deleteBinder(db: DB, matterId: string, binderId: string): boolean {
  return db.prepare(`DELETE FROM binders WHERE matter_id = ? AND id = ?`).run(matterId, binderId).changes > 0;
}

export function addBinderItem(
  db: DB,
  matterId: string,
  binderId: string,
  docId: string,
  label?: string,
): Binder | null {
  const binder = db.prepare(`SELECT 1 FROM binders WHERE matter_id = ? AND id = ?`).get(matterId, binderId);
  if (!binder) return null;
  const doc = db.prepare(`SELECT title, bates FROM documents WHERE matter_id = ? AND id = ?`).get(matterId, docId) as
    | { title: string; bates: string }
    | undefined;
  if (!doc) return null;
  const ord =
    (db.prepare(`SELECT COALESCE(MAX(ord) + 1, 0) AS n FROM binder_items WHERE binder_id = ?`).get(binderId) as { n: number }).n;
  db.prepare(
    `INSERT INTO binder_items (id, binder_id, doc_id, label, ord) VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), binderId, docId, label ?? doc.title, ord);
  return getBinder(db, matterId, binderId);
}

export function removeBinderItem(db: DB, matterId: string, binderId: string, itemId: string): Binder | null {
  const binder = db.prepare(`SELECT 1 FROM binders WHERE matter_id = ? AND id = ?`).get(matterId, binderId);
  if (!binder) return null;
  db.prepare(`DELETE FROM binder_items WHERE binder_id = ? AND id = ?`).run(binderId, itemId);
  return getBinder(db, matterId, binderId);
}

export function reorderBinder(
  db: DB,
  matterId: string,
  binderId: string,
  order: string[],
): Binder | null {
  const binder = db.prepare(`SELECT 1 FROM binders WHERE matter_id = ? AND id = ?`).get(matterId, binderId);
  if (!binder) return null;
  const upd = db.prepare(`UPDATE binder_items SET ord = ? WHERE binder_id = ? AND id = ?`);
  const tx = db.transaction(() => {
    order.forEach((itemId, i) => upd.run(i, binderId, itemId));
  });
  tx();
  return getBinder(db, matterId, binderId);
}

export function renameBinderItem(
  db: DB,
  matterId: string,
  binderId: string,
  itemId: string,
  label: string,
): Binder | null {
  const binder = db.prepare(`SELECT 1 FROM binders WHERE matter_id = ? AND id = ?`).get(matterId, binderId);
  if (!binder) return null;
  db.prepare(`UPDATE binder_items SET label = ? WHERE binder_id = ? AND id = ?`).run(label, binderId, itemId);
  return getBinder(db, matterId, binderId);
}

// --- Causal chains ---
import type { CausalChain, CausalChainNode } from "./types.js";

function rowToChain(r: Row): CausalChain {
  return {
    id: r.id as string,
    matterId: r.matter_id as string,
    name: r.name as string,
    nodes: jsonOut(r.json_nodes, [] as CausalChainNode[]),
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
  };
}

export function listCausalChains(db: DB, matterId: string): CausalChain[] {
  const rows = db
    .prepare(`SELECT * FROM causal_chains WHERE matter_id = ? ORDER BY created_at`)
    .all(matterId) as Row[];
  return rows.map(rowToChain);
}

export function getCausalChain(db: DB, matterId: string, chainId: string): CausalChain | null {
  const row = db
    .prepare(`SELECT * FROM causal_chains WHERE matter_id = ? AND id = ?`)
    .get(matterId, chainId) as Row | undefined;
  return row ? rowToChain(row) : null;
}

export function createCausalChain(
  db: DB,
  matterId: string,
  name: string,
  nodes: CausalChainNode[],
  actor: string,
): CausalChain {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO causal_chains (id, matter_id, name, json_nodes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, matterId, name, jsonIn(nodes), actor, new Date().toISOString());
  return getCausalChain(db, matterId, id)!;
}

export function updateCausalChain(
  db: DB,
  matterId: string,
  chainId: string,
  patch: { name?: string; nodes?: CausalChainNode[] },
): CausalChain | null {
  const existing = getCausalChain(db, matterId, chainId);
  if (!existing) return null;
  db.prepare(`UPDATE causal_chains SET name = ?, json_nodes = ? WHERE matter_id = ? AND id = ?`).run(
    patch.name ?? existing.name,
    jsonIn(patch.nodes ?? existing.nodes),
    matterId,
    chainId,
  );
  return getCausalChain(db, matterId, chainId);
}

export function deleteCausalChain(db: DB, matterId: string, chainId: string): boolean {
  return db.prepare(`DELETE FROM causal_chains WHERE matter_id = ? AND id = ?`).run(matterId, chainId).changes > 0;
}
