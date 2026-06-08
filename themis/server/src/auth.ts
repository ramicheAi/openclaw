// Magic-link email auth. Two modes:
//
// Single-user mode (THEMIS_AUTH_REQUIRED unset)
//   Every request is treated as the lone operator. No login required. The
//   audit actor is the x-themis-actor header (or "you"). This is the mode
//   you've been running locally — staying backwards compatible.
//
// Multi-tenant mode (THEMIS_AUTH_REQUIRED=1)
//   Every /api route except auth + shared + health requires a session
//   cookie. Login flow: user enters email → server stores a 15-minute
//   token → email goes out via Resend (or, if RESEND_API_KEY is unset,
//   the link gets logged to the server console so dev still works) →
//   user clicks the link → server creates a 30-day session cookie.
//
// Sessions are httpOnly + SameSite=Lax so they survive normal navigation
// but aren't readable from JS. SQLite holds users + tokens + sessions; the
// existing audit log records every login + matter create with the user's
// email so the chain stays honest.

import { randomBytes } from "node:crypto";
import type { DB } from "./db.js";

export interface User {
  id: string;
  email: string;
  name: string;
  firm: string;
  createdAt: string;
  lastLogin?: string;
}

export interface Session {
  id: string;
  userId: string;
  email: string; // denormalized for convenience
  name: string;
  expiresAt: string;
}

const COOKIE_NAME = "themis_session";
const TOKEN_TTL_MS = 15 * 60_000;          // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days

export function isAuthRequired(): boolean {
  return process.env.THEMIS_AUTH_REQUIRED === "1";
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function userRow(r: Record<string, unknown>): User {
  return {
    id: r.id as string,
    email: r.email as string,
    name: r.name as string,
    firm: r.firm as string,
    createdAt: r.created_at as string,
    lastLogin: (r.last_login as string | null) ?? undefined,
  };
}

export function getUserByEmail(db: DB, email: string): User | null {
  const r = db.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizeEmail(email)) as Record<string, unknown> | undefined;
  return r ? userRow(r) : null;
}

export function getUserById(db: DB, id: string): User | null {
  const r = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return r ? userRow(r) : null;
}

export function upsertUser(db: DB, email: string, name = "", firm = ""): User {
  const e = normalizeEmail(email);
  const existing = getUserByEmail(db, e);
  if (existing) return existing;
  const id = `u-${randomBytes(8).toString("base64url")}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users (id, email, name, firm, created_at) VALUES (?, ?, ?, ?, ?)`).run(id, e, name, firm, now);
  return { id, email: e, name, firm, createdAt: now };
}

// ── Magic-link tokens ────────────────────────────────────────────────────

export interface MagicLinkResult {
  token: string;
  expiresAt: string;
}

export function createMagicLinkToken(db: DB, email: string, ip = ""): MagicLinkResult {
  const e = normalizeEmail(email);
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO auth_tokens (token, email, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)`,
  ).run(token, e, now.toISOString(), expiresAt, ip);
  return { token, expiresAt };
}

/** Consume a magic-link token. Returns the email it was created for, or null
 * if the token is unknown / expired / already used. Atomically marks the
 * token consumed so the same link can't be replayed. */
export function consumeMagicLinkToken(db: DB, token: string): string | null {
  const row = db.prepare(`SELECT * FROM auth_tokens WHERE token = ?`).get(token) as
    | { email: string; expires_at: string; consumed: number }
    | undefined;
  if (!row) return null;
  if (row.consumed) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const r = db.prepare(`UPDATE auth_tokens SET consumed = 1 WHERE token = ? AND consumed = 0`).run(token);
  if (r.changes === 0) return null;
  return row.email;
}

// Garbage collection for tokens older than 24h. Best-effort, called at boot.
export function reapExpiredAuthArtifacts(db: DB): void {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  db.prepare(`DELETE FROM auth_tokens WHERE created_at < ?`).run(cutoff);
  db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(new Date().toISOString());
}

// ── Sessions ────────────────────────────────────────────────────────────

export function createSession(db: DB, userId: string): { id: string; expiresAt: string } {
  const id = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, created_at, last_used, expires_at) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    userId,
    now.toISOString(),
    now.toISOString(),
    expiresAt,
  );
  db.prepare(`UPDATE users SET last_login = ? WHERE id = ?`).run(now.toISOString(), userId);
  return { id, expiresAt };
}

export function resolveSession(db: DB, sessionId: string): Session | null {
  const r = db
    .prepare(
      `SELECT s.id AS id, s.user_id AS user_id, s.expires_at AS expires_at, u.email AS email, u.name AS name
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ?`,
    )
    .get(sessionId) as { id: string; user_id: string; expires_at: string; email: string; name: string } | undefined;
  if (!r) return null;
  if (new Date(r.expires_at).getTime() < Date.now()) return null;
  // Best-effort: touch last_used so we can show "active 5m ago" later.
  db.prepare(`UPDATE sessions SET last_used = ? WHERE id = ?`).run(new Date().toISOString(), sessionId);
  return { id: r.id, userId: r.user_id, email: r.email, name: r.name, expiresAt: r.expires_at };
}

export function destroySession(db: DB, sessionId: string): void {
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

// ── Cookie helpers ──────────────────────────────────────────────────────

export function sessionCookieValue(sessionId: string, expiresAt: string): string {
  const exp = new Date(expiresAt).toUTCString();
  // Secure flag only when behind https. In dev (http://localhost) we drop
  // Secure or the browser refuses to set the cookie.
  const secure = process.env.THEMIS_SECURE_COOKIES === "1" ? "; Secure" : "";
  return `${COOKIE_NAME}=${sessionId}; Path=/; Expires=${exp}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearedCookie(): string {
  const secure = process.env.THEMIS_SECURE_COOKIES === "1" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const [name, ...rest] = part.split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
