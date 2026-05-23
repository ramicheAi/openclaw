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

  instance = db;
  return db;
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
