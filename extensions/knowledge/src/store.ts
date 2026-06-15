// SQLite-backed chunk store using the built-in `node:sqlite` module (no extra
// storage dependency). Embeddings are persisted as JSON text in the `embedding`
// column; brute-force cosine search (src/search.ts) reads them back via
// `allChunks`. One database file per collection keeps collections fully isolated
// and trivially droppable.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { dbPath, knowledgeDir } from "./paths.js";

export type ChunkRow = {
  id: string;
  collection: string;
  source: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  dims: number;
  createdAt: number;
};

export type CollectionStats = {
  collection: string;
  chunks: number;
  sources: number;
};

/** A row as returned for search (embedding parsed back into numbers). */
export type StoredChunk = {
  id: string;
  source: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
};

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  source TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  dims INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_collection ON chunks(collection);
CREATE INDEX IF NOT EXISTS idx_chunks_collection_source ON chunks(collection, source);
`;

/**
 * Wraps a single collection's SQLite database. The handle is opened lazily and
 * must be closed via `close()` (the plugin service does this on shutdown, and
 * tools/CLI close after each operation).
 */
export class KnowledgeStore {
  private db: DatabaseSync;

  constructor(
    public readonly collection: string,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    const dir = knowledgeDir(env);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(dbPath(collection, env));
    this.db.exec(CREATE_TABLE);
  }

  /** Insert or replace chunk rows (by primary key). */
  upsertChunks(rows: ChunkRow[]): void {
    if (rows.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO chunks
        (id, collection, source, chunk_index, text, embedding, dims, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // Wrap in a transaction for a fast, atomic bulk insert.
    this.db.exec("BEGIN");
    try {
      for (const r of rows) {
        stmt.run(
          r.id,
          r.collection,
          r.source,
          r.chunkIndex,
          r.text,
          JSON.stringify(r.embedding),
          r.dims,
          r.createdAt,
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** Remove all chunks for a given source (used to replace on re-ingest). */
  deleteBySource(collection: string, source: string): void {
    this.db
      .prepare("DELETE FROM chunks WHERE collection = ? AND source = ?")
      .run(collection, source);
  }

  /** Delete all chunks for one collection, or every chunk when omitted. */
  clear(collection?: string): void {
    if (collection) {
      this.db.prepare("DELETE FROM chunks WHERE collection = ?").run(collection);
    } else {
      this.db.exec("DELETE FROM chunks");
    }
  }

  /** All chunks in a collection, with embeddings parsed back into number[]. */
  allChunks(collection: string): StoredChunk[] {
    const rows = this.db
      .prepare(
        "SELECT id, source, chunk_index, text, embedding FROM chunks WHERE collection = ?",
      )
      .all(collection) as Array<{
      id: string;
      source: string;
      chunk_index: number;
      text: string;
      embedding: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      chunkIndex: r.chunk_index,
      text: r.text,
      embedding: parseEmbedding(r.embedding),
    }));
  }

  /** Per-collection chunk/source counts. Pass a collection to scope it. */
  stats(collection?: string): CollectionStats[] {
    const sql = collection
      ? "SELECT collection, COUNT(*) AS chunks, COUNT(DISTINCT source) AS sources FROM chunks WHERE collection = ? GROUP BY collection"
      : "SELECT collection, COUNT(*) AS chunks, COUNT(DISTINCT source) AS sources FROM chunks GROUP BY collection ORDER BY collection";
    const stmt = this.db.prepare(sql);
    const rows = (collection ? stmt.all(collection) : stmt.all()) as Array<{
      collection: string;
      chunks: number;
      sources: number;
    }>;
    return rows.map((r) => ({ collection: r.collection, chunks: r.chunks, sources: r.sources }));
  }

  /** Distinct source paths in a collection. */
  sources(collection: string): string[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT source FROM chunks WHERE collection = ? ORDER BY source",
      )
      .all(collection) as Array<{ source: string }>;
    return rows.map((r) => r.source);
  }

  /** Close the underlying database handle (idempotent enough for shutdown). */
  close(): void {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }
}

function parseEmbedding(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as number[]) : [];
  } catch {
    return [];
  }
}

/** List collection names by scanning the knowledge directory for `*.sqlite`. */
export function listCollections(env: NodeJS.ProcessEnv = process.env): string[] {
  const dir = knowledgeDir(env);
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sqlite"))
      .map((f) => path.basename(f, ".sqlite"))
      .sort();
  } catch {
    return [];
  }
}
