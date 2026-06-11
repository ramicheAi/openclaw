// Per-matter access lists + roles. Owner_email on the matter is the
// founder of the case; this module lets the owner invite teammates and
// gate routes on their role.

import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { isAuthRequired, normalizeEmail } from "./auth.js";

export type Role = "admin" | "partner" | "associate" | "paralegal" | "readonly";
export const ROLES: Role[] = ["admin", "partner", "associate", "paralegal", "readonly"];

export interface AccessEntry {
  matterId: string;
  email: string;
  role: Role;
  invitedBy: string;
  invitedAt: string;
  accepted: boolean;
}

function row(r: Record<string, unknown>): AccessEntry {
  return {
    matterId: r.matter_id as string,
    email: r.email as string,
    role: r.role as Role,
    invitedBy: r.invited_by as string,
    invitedAt: r.invited_at as string,
    accepted: !!r.accepted,
  };
}

export function listMatterAccess(db: DB, matterId: string): AccessEntry[] {
  return (
    db.prepare(`SELECT * FROM matter_access WHERE matter_id = ? ORDER BY role, email`).all(matterId) as Record<string, unknown>[]
  ).map(row);
}

export function listMattersForEmail(db: DB, email: string): string[] {
  const rows = db.prepare(`SELECT matter_id FROM matter_access WHERE email = ?`).all(normalizeEmail(email)) as { matter_id: string }[];
  return rows.map((r) => r.matter_id);
}

export function grantAccess(db: DB, matterId: string, email: string, role: Role, invitedBy: string): AccessEntry {
  const e = normalizeEmail(email);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO matter_access (matter_id, email, role, invited_by, invited_at, accepted)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT (matter_id, email) DO UPDATE SET role = excluded.role`,
  ).run(matterId, e, role, invitedBy, now);
  return { matterId, email: e, role, invitedBy, invitedAt: now, accepted: false };
}

export function revokeAccess(db: DB, matterId: string, email: string): boolean {
  const r = db.prepare(`DELETE FROM matter_access WHERE matter_id = ? AND email = ?`).run(matterId, normalizeEmail(email));
  return r.changes > 0;
}

export function getRoleForUser(db: DB, matterId: string, email: string): Role | null {
  const r = db.prepare(`SELECT role FROM matter_access WHERE matter_id = ? AND email = ?`).get(matterId, normalizeEmail(email)) as
    | { role: Role }
    | undefined;
  return r?.role ?? null;
}

// ── Outbound webhooks (SIEM forwarding) ────────────────────────────────

export interface WebhookEndpoint {
  id: string;
  ownerEmail: string;
  url: string;
  secret: string;
  events: string;
  active: boolean;
  createdAt: string;
  lastOk?: string;
  lastError?: string;
}

function whRow(r: Record<string, unknown>): WebhookEndpoint {
  return {
    id: r.id as string,
    ownerEmail: r.owner_email as string,
    url: r.url as string,
    secret: r.secret as string,
    events: r.events as string,
    active: !!r.active,
    createdAt: r.created_at as string,
    lastOk: (r.last_ok as string | null) ?? undefined,
    lastError: (r.last_error as string | null) ?? undefined,
  };
}

export function listWebhooks(db: DB, ownerEmail: string): WebhookEndpoint[] {
  return (
    db.prepare(`SELECT * FROM webhook_endpoints WHERE owner_email = ? ORDER BY created_at`).all(normalizeEmail(ownerEmail)) as Record<string, unknown>[]
  ).map(whRow);
}

/** SSRF guard for outbound webhooks (SECURITY-TODO #5). Customer-supplied
 * URLs get server-side POSTs, so in multi-tenant mode they must be https
 * and must not point at loopback/private/link-local/metadata targets.
 * Single-user mode allows anything http(s) — the operator probing their
 * own box crosses no tenant boundary, and a localhost SIEM collector is a
 * legitimate target. Checked at create time AND again at fire time (rows
 * may predate this guard). Residual risk: a public hostname whose DNS
 * resolves to a private IP (rebinding) is not caught — noted in
 * SECURITY-TODO.
 * Returns null when the target is acceptable, or an error code. */
export function webhookTargetError(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return "invalid_url";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "invalid_url";
  if (!isAuthRequired()) return null;
  if (u.protocol !== "https:") return "https_required";
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return "private_target";
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (
      a === 0 || a === 127 || a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) // cloud metadata services live here
    ) {
      return "private_target";
    }
  }
  if (host === "::" || host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return "private_target";
  }
  return null;
}

export function createWebhook(db: DB, ownerEmail: string, url: string, events = "audit.*"): WebhookEndpoint {
  const id = `wh-${randomUUID().slice(0, 8)}`;
  const secret = `whsec_${randomUUID().replace(/-/g, "")}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO webhook_endpoints (id, owner_email, url, secret, events, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
  ).run(id, normalizeEmail(ownerEmail), url, secret, events, now);
  return { id, ownerEmail: normalizeEmail(ownerEmail), url, secret, events, active: true, createdAt: now };
}

export function deleteWebhook(db: DB, ownerEmail: string, id: string): boolean {
  return db.prepare(`DELETE FROM webhook_endpoints WHERE id = ? AND owner_email = ?`).run(id, normalizeEmail(ownerEmail)).changes > 0;
}

export function activeWebhooksForMatter(db: DB, matterId: string): WebhookEndpoint[] {
  // Endpoints belong to the user(s) who own/access the matter. Pull the
  // matter's owner_email and any matter_access entries, then dedup.
  const owner = db.prepare(`SELECT owner_email FROM matters WHERE id = ?`).get(matterId) as { owner_email: string } | undefined;
  const access = db.prepare(`SELECT email FROM matter_access WHERE matter_id = ?`).all(matterId) as { email: string }[];
  const emails = new Set<string>();
  if (owner?.owner_email) emails.add(owner.owner_email);
  for (const a of access) emails.add(a.email);
  if (emails.size === 0) return [];
  const placeholders = Array.from(emails, () => "?").join(",");
  return (
    db
      .prepare(`SELECT * FROM webhook_endpoints WHERE active = 1 AND owner_email IN (${placeholders})`)
      .all(...emails) as Record<string, unknown>[]
  ).map(whRow);
}

export function markWebhookResult(db: DB, id: string, ok: boolean, error?: string): void {
  if (ok) {
    db.prepare(`UPDATE webhook_endpoints SET last_ok = ?, last_error = NULL WHERE id = ?`).run(new Date().toISOString(), id);
  } else {
    db.prepare(`UPDATE webhook_endpoints SET last_error = ? WHERE id = ?`).run(error ?? "unknown", id);
  }
}
