// Firm Library — firm-scoped templates the operator can save, organize,
// and reuse. Lives behind the Firm Library nav surface. Each template
// belongs to the user who saved it (firm-scoped in multi-tenant mode;
// "operator" scoped in single-user mode).
//
// Kinds:
//   draft           — a reusable Draft Studio output (motion shell, demand letter)
//   depo            — a deposition outline / standard question bank
//   evidence        — an evidence checklist (often seeded from a vertical pack)
//   demand-clause   — a short snippet (boilerplate liability paragraph, e.g.)
//   other           — anything else (cover letter, retainer language, etc.)

import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { normalizeEmail } from "./auth.js";

export type TemplateKind = "draft" | "depo" | "evidence" | "demand-clause" | "other";

export interface FirmTemplate {
  id: string;
  ownerEmail: string;
  kind: TemplateKind;
  category: string;
  title: string;
  body: string;
  tags: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

function row(r: Record<string, unknown>): FirmTemplate {
  return {
    id: r.id as string,
    ownerEmail: r.owner_email as string,
    kind: r.kind as TemplateKind,
    category: r.category as string,
    title: r.title as string,
    body: r.body as string,
    tags: r.tags as string,
    useCount: Number(r.use_count ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function listTemplates(db: DB, ownerEmail: string, kind?: TemplateKind): FirmTemplate[] {
  const e = normalizeEmail(ownerEmail) || "operator";
  const rows = kind
    ? (db.prepare(`SELECT * FROM firm_templates WHERE owner_email = ? AND kind = ? ORDER BY updated_at DESC`).all(e, kind) as Record<string, unknown>[])
    : (db.prepare(`SELECT * FROM firm_templates WHERE owner_email = ? ORDER BY updated_at DESC`).all(e) as Record<string, unknown>[]);
  return rows.map(row);
}

export function getTemplate(db: DB, ownerEmail: string, id: string): FirmTemplate | null {
  const e = normalizeEmail(ownerEmail) || "operator";
  const r = db.prepare(`SELECT * FROM firm_templates WHERE id = ? AND owner_email = ?`).get(id, e) as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}

export function createTemplate(
  db: DB,
  ownerEmail: string,
  input: { kind: TemplateKind; category?: string; title: string; body?: string; tags?: string },
): FirmTemplate {
  const id = `tpl-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const e = normalizeEmail(ownerEmail) || "operator";
  db.prepare(
    `INSERT INTO firm_templates (id, owner_email, kind, category, title, body, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, e, input.kind, input.category ?? "", input.title, input.body ?? "", input.tags ?? "", now, now);
  return {
    id,
    ownerEmail: e,
    kind: input.kind,
    category: input.category ?? "",
    title: input.title,
    body: input.body ?? "",
    tags: input.tags ?? "",
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTemplate(
  db: DB,
  ownerEmail: string,
  id: string,
  patch: Partial<{ kind: TemplateKind; category: string; title: string; body: string; tags: string }>,
): FirmTemplate | null {
  const cur = getTemplate(db, ownerEmail, id);
  if (!cur) return null;
  const next = {
    kind: patch.kind ?? cur.kind,
    category: patch.category ?? cur.category,
    title: patch.title ?? cur.title,
    body: patch.body ?? cur.body,
    tags: patch.tags ?? cur.tags,
    updated_at: new Date().toISOString(),
  };
  const e = normalizeEmail(ownerEmail) || "operator";
  db.prepare(
    `UPDATE firm_templates SET kind = ?, category = ?, title = ?, body = ?, tags = ?, updated_at = ?
       WHERE id = ? AND owner_email = ?`,
  ).run(next.kind, next.category, next.title, next.body, next.tags, next.updated_at, id, e);
  return { ...cur, ...next, updatedAt: next.updated_at };
}

export function deleteTemplate(db: DB, ownerEmail: string, id: string): boolean {
  const e = normalizeEmail(ownerEmail) || "operator";
  return db.prepare(`DELETE FROM firm_templates WHERE id = ? AND owner_email = ?`).run(id, e).changes > 0;
}

export function bumpTemplateUseCount(db: DB, ownerEmail: string, id: string): void {
  const e = normalizeEmail(ownerEmail) || "operator";
  db.prepare(`UPDATE firm_templates SET use_count = use_count + 1, updated_at = ? WHERE id = ? AND owner_email = ?`).run(
    new Date().toISOString(),
    id,
    e,
  );
}
