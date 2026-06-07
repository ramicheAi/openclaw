// Damages model — itemized line items grouped by category, each anchored to
// a Bates id when possible (e.g. an ER bill, a wage stub, a treating
// physician's records). Pain & suffering line items carry a multiplier so
// the operator can model "3× medicals" without hardcoding the math.

import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";

export type DamagesCategory =
  | "medical"
  | "lost_wages"
  | "property"
  | "pain_suffering"
  | "future_care"
  | "other";

export const DAMAGES_CATEGORIES: DamagesCategory[] = [
  "medical",
  "lost_wages",
  "property",
  "pain_suffering",
  "future_care",
  "other",
];

export interface DamagesItem {
  id: string;
  category: DamagesCategory;
  description: string;
  amountCents: number;
  multiplier: number;
  dateIncurred?: string;
  citationBates?: string;
  notes: string;
  sortOrder: number;
  createdAt: string;
}

export interface NewDamagesItem {
  category: DamagesCategory;
  description: string;
  amountCents: number;
  multiplier?: number;
  dateIncurred?: string;
  citationBates?: string;
  notes?: string;
}

function row(r: Record<string, unknown>): DamagesItem {
  return {
    id: r.id as string,
    category: r.category as DamagesCategory,
    description: r.description as string,
    amountCents: Number(r.amount_cents ?? 0),
    multiplier: Number(r.multiplier ?? 1),
    dateIncurred: (r.date_incurred as string | null) ?? undefined,
    citationBates: (r.citation_bates as string | null) ?? undefined,
    notes: r.notes as string,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
  };
}

export function listDamages(db: DB, matterId: string): DamagesItem[] {
  return (
    db
      .prepare(`SELECT * FROM damages_items WHERE matter_id = ? ORDER BY sort_order ASC, created_at ASC`)
      .all(matterId) as Record<string, unknown>[]
  ).map(row);
}

export function createDamagesItem(db: DB, matterId: string, p: NewDamagesItem): DamagesItem {
  const id = `dm-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const sortOrder = Date.now();
  db.prepare(
    `INSERT INTO damages_items (id, matter_id, category, description, amount_cents, multiplier, date_incurred, citation_bates, notes, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    matterId,
    p.category,
    p.description,
    Math.round(p.amountCents),
    p.multiplier ?? 1,
    p.dateIncurred ?? null,
    p.citationBates ?? null,
    p.notes ?? "",
    sortOrder,
    now,
  );
  return {
    id,
    category: p.category,
    description: p.description,
    amountCents: Math.round(p.amountCents),
    multiplier: p.multiplier ?? 1,
    dateIncurred: p.dateIncurred,
    citationBates: p.citationBates,
    notes: p.notes ?? "",
    sortOrder,
    createdAt: now,
  };
}

export function updateDamagesItem(
  db: DB,
  matterId: string,
  id: string,
  patch: Partial<NewDamagesItem>,
): DamagesItem | null {
  const cur = db.prepare(`SELECT * FROM damages_items WHERE id = ? AND matter_id = ?`).get(id, matterId) as
    | Record<string, unknown>
    | undefined;
  if (!cur) return null;
  const next = {
    category: patch.category ?? (cur.category as DamagesCategory),
    description: patch.description ?? (cur.description as string),
    amountCents: patch.amountCents !== undefined ? Math.round(patch.amountCents) : Number(cur.amount_cents),
    multiplier: patch.multiplier !== undefined ? patch.multiplier : Number(cur.multiplier),
    dateIncurred: patch.dateIncurred !== undefined ? patch.dateIncurred : (cur.date_incurred as string | null) ?? undefined,
    citationBates:
      patch.citationBates !== undefined ? patch.citationBates : (cur.citation_bates as string | null) ?? undefined,
    notes: patch.notes !== undefined ? patch.notes : (cur.notes as string),
  };
  db.prepare(
    `UPDATE damages_items SET category = ?, description = ?, amount_cents = ?, multiplier = ?, date_incurred = ?, citation_bates = ?, notes = ?
       WHERE id = ? AND matter_id = ?`,
  ).run(
    next.category,
    next.description,
    next.amountCents,
    next.multiplier,
    next.dateIncurred ?? null,
    next.citationBates ?? null,
    next.notes,
    id,
    matterId,
  );
  return row(
    db.prepare(`SELECT * FROM damages_items WHERE id = ?`).get(id) as Record<string, unknown>,
  );
}

export function deleteDamagesItem(db: DB, matterId: string, id: string): boolean {
  return db.prepare(`DELETE FROM damages_items WHERE id = ? AND matter_id = ?`).run(id, matterId).changes > 0;
}
