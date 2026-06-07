// Scoped read-only share links. Generates a url-safe random token that lets
// a co-counsel, client, or expert view a matter's read-only artifacts
// without an account. Either matter-wide ("here's the whole case brain")
// or scoped to a binder ("here's just the trial exhibits").
//
// The token is the entire auth surface — anyone with the URL gets the
// scoped view. We log every view to the audit trail and let the operator
// revoke instantly. Tokens can carry an optional expiry.

import { randomBytes } from "node:crypto";
import type { DB } from "./db.js";

export type ShareScope = "matter" | "binder";

export interface ShareLink {
  token: string;
  matterId: string;
  label: string;
  scope: ShareScope;
  binderId?: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  revoked: boolean;
  viewCount: number;
  lastViewed?: string;
}

function row(r: Record<string, unknown>): ShareLink {
  return {
    token: r.token as string,
    matterId: r.matter_id as string,
    label: r.label as string,
    scope: r.scope as ShareScope,
    binderId: (r.binder_id as string | null) ?? undefined,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string | null) ?? undefined,
    revoked: !!r.revoked,
    viewCount: Number(r.view_count ?? 0),
    lastViewed: (r.last_viewed as string | null) ?? undefined,
  };
}

export function listShareLinks(db: DB, matterId: string): ShareLink[] {
  return (
    db.prepare(`SELECT * FROM share_links WHERE matter_id = ? ORDER BY created_at DESC`).all(matterId) as Record<string, unknown>[]
  ).map(row);
}

export function createShareLink(
  db: DB,
  matterId: string,
  opts: { label?: string; scope?: ShareScope; binderId?: string; expiresAt?: string; createdBy?: string },
): ShareLink {
  const token = randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO share_links (token, matter_id, label, scope, binder_id, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    token,
    matterId,
    opts.label ?? "",
    opts.scope ?? "matter",
    opts.binderId ?? null,
    opts.createdBy ?? "",
    now,
    opts.expiresAt ?? null,
  );
  return {
    token,
    matterId,
    label: opts.label ?? "",
    scope: opts.scope ?? "matter",
    binderId: opts.binderId,
    createdBy: opts.createdBy ?? "",
    createdAt: now,
    expiresAt: opts.expiresAt,
    revoked: false,
    viewCount: 0,
  };
}

export function revokeShareLink(db: DB, matterId: string, token: string): boolean {
  return db.prepare(`UPDATE share_links SET revoked = 1 WHERE token = ? AND matter_id = ?`).run(token, matterId).changes > 0;
}

/** Resolve a share token at view time. Returns null when revoked, expired,
 * unknown, or matter-deleted. Increments the view counter. */
export function resolveShareToken(db: DB, token: string): ShareLink | null {
  const r = db.prepare(`SELECT * FROM share_links WHERE token = ?`).get(token) as Record<string, unknown> | undefined;
  if (!r) return null;
  const link = row(r);
  if (link.revoked) return null;
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return null;
  db.prepare(`UPDATE share_links SET view_count = view_count + 1, last_viewed = ? WHERE token = ?`).run(
    new Date().toISOString(),
    token,
  );
  return { ...link, viewCount: link.viewCount + 1, lastViewed: new Date().toISOString() };
}
