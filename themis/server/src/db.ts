import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA } from "./schema.js";

export type DB = Database.Database;

let instance: DB | null = null;

export function getDb(): DB {
  if (instance) return instance;

  const path = process.env.THEMIS_DB ?? "./data/themis.db";
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);

  instance = db;
  return db;
}

// Lightweight idempotent migrations for columns added after the first release.
// SQLite ALTER TABLE ADD COLUMN throws if it already exists — swallow.
function migrate(db: DB) {
  const adds = [
    `ALTER TABLE documents ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE documents ADD COLUMN reviewed_by TEXT`,
    `ALTER TABLE documents ADD COLUMN reviewed_at TEXT`,
    `ALTER TABLE documents ADD COLUMN hot_set_by TEXT`,
    `ALTER TABLE documents ADD COLUMN hot_set_at TEXT`,
    `ALTER TABLE audit_log ADD COLUMN prev_hash TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE audit_log ADD COLUMN entry_hash TEXT NOT NULL DEFAULT ''`,
    // Per-user matter ownership for the multi-tenant deploy. Existing rows
    // get owner_email = '' which is treated as "owned by the operator" in
    // single-user mode and as "unassigned" in multi-tenant mode.
    `ALTER TABLE matters ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''`,
  ];
  for (const sql of adds) {
    try {
      db.exec(sql);
    } catch {
      // already exists
    }
  }
}

// JSON column helpers — encode/decode the `json_*` text columns.
export function jsonOut<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function jsonIn(value: unknown): string {
  return JSON.stringify(value ?? null);
}
