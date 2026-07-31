// Productions manifest — track every Bates range that's been produced to
// (or by) someone, with date, label, doc count, and whether a privilege log
// went with it. This is the discovery-audit-trail layer that solo/mid-size
// firms keep in Excel, with all the failure modes that implies (lost emails,
// arguing about what was produced, "you never gave us X").

import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { listDocuments } from "./repo.js";

export type ProductionDirection = "sent" | "received";

export interface Production {
  id: string;
  direction: ProductionDirection;
  party: string;
  prodDate: string;
  label: string;
  batesStart: string;
  batesEnd: string;
  docCount: number;
  privilegeLog: boolean;
  notes: string;
  createdAt: string;
}

export interface NewProduction {
  direction: ProductionDirection;
  party: string;
  prodDate: string;
  label?: string;
  batesStart: string;
  batesEnd: string;
  privilegeLog?: boolean;
  notes?: string;
}

function row(r: Record<string, unknown>): Production {
  return {
    id: r.id as string,
    direction: r.direction as ProductionDirection,
    party: r.party as string,
    prodDate: r.prod_date as string,
    label: r.label as string,
    batesStart: r.bates_start as string,
    batesEnd: r.bates_end as string,
    docCount: Number(r.doc_count ?? 0),
    privilegeLog: !!r.privilege_log,
    notes: r.notes as string,
    createdAt: r.created_at as string,
  };
}

export function listProductions(db: DB, matterId: string): Production[] {
  const rows = db
    .prepare(`SELECT * FROM productions WHERE matter_id = ? ORDER BY prod_date DESC, id`)
    .all(matterId) as Record<string, unknown>[];
  return rows.map(row);
}

// Count docs in this matter whose Bates ids fall within [start..end] using a
// string compare — works when all Bates ids in a range share a fixed-width
// numeric suffix (the convention auto-bates produces).
function countDocsInRange(db: DB, matterId: string, start: string, end: string): number {
  const docs = listDocuments(db, matterId);
  return docs.filter((d) => d.bates >= start && d.bates <= end).length;
}

export function createProduction(db: DB, matterId: string, p: NewProduction): Production {
  const id = `pr-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const docCount = countDocsInRange(db, matterId, p.batesStart, p.batesEnd);
  db.prepare(
    `INSERT INTO productions (id, matter_id, direction, party, prod_date, label, bates_start, bates_end, doc_count, privilege_log, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    matterId,
    p.direction,
    p.party,
    p.prodDate,
    p.label ?? "",
    p.batesStart,
    p.batesEnd,
    docCount,
    p.privilegeLog ? 1 : 0,
    p.notes ?? "",
    now,
  );
  return {
    id,
    direction: p.direction,
    party: p.party,
    prodDate: p.prodDate,
    label: p.label ?? "",
    batesStart: p.batesStart,
    batesEnd: p.batesEnd,
    docCount,
    privilegeLog: !!p.privilegeLog,
    notes: p.notes ?? "",
    createdAt: now,
  };
}

export function deleteProduction(db: DB, matterId: string, id: string): boolean {
  return db.prepare(`DELETE FROM productions WHERE id = ? AND matter_id = ?`).run(id, matterId).changes > 0;
}
