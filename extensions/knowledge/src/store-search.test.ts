import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Embedder } from "./embedder.js";
import { ingestPath } from "./ingest.js";
import { searchKnowledge } from "./search.js";
import { KnowledgeStore } from "./store.js";

// ---------------------------------------------------------------------------
// A deterministic, network-free embedder. It maps text to a fixed-length vector
// using a bag-of-words hash: each token bumps a dimension chosen by its hash.
// Texts that share more words produce more similar vectors, which is exactly
// the property we need for a meaningful relevance assertion.
// ---------------------------------------------------------------------------
const DIMS = 64;

function hashEmbed(text: string): number[] {
  const vec = Array.from<number>({ length: DIMS }).fill(0);
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    const h = createHash("md5").update(token).digest();
    const dim = h.readUInt32BE(0) % DIMS;
    vec[dim] += 1;
  }
  return vec;
}

const fakeEmbedder: Embedder = {
  model: "fake-hash",
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(hashEmbed);
  },
};

describe("ingest + searchKnowledge (end-to-end, fake embedder)", () => {
  let tmp: string;
  let docsDir: string;
  let prevState: string | undefined;
  const collection = "test-collection";

  beforeEach(() => {
    prevState = process.env.OPENCLAW_STATE_DIR;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-e2e-"));
    process.env.OPENCLAW_STATE_DIR = tmp;
    docsDir = path.join(tmp, "docs");
    fs.mkdirSync(docsDir, { recursive: true });
  });

  afterEach(() => {
    if (prevState === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = prevState;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("ingests two snippets and ranks the relevant one first", async () => {
    fs.writeFileSync(
      path.join(docsDir, "swimming.md"),
      "Open water swimming technique and pacing strategy for distance freestyle races.",
    );
    fs.writeFileSync(
      path.join(docsDir, "cooking.md"),
      "Baking sourdough bread requires a starter, flour, water, salt, and patience.",
    );

    const store = new KnowledgeStore(collection);
    try {
      const res = await ingestPath({
        store,
        embedder: fakeEmbedder,
        collection,
        path: docsDir,
        chunking: { tokens: 400, overlap: 80 },
      });
      expect(res.files).toBe(2);
      expect(res.chunks).toBeGreaterThanOrEqual(2);

      const hits = await searchKnowledge({
        store,
        embedder: fakeEmbedder,
        collection,
        query: "freestyle swimming pacing for a distance race",
        topK: 2,
      });

      expect(hits.length).toBeGreaterThan(0);
      // The swimming snippet shares query words; it must rank first.
      expect(hits[0].source).toBe("swimming.md");
      expect(hits[0].score).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("re-ingesting a source replaces its chunks rather than duplicating", async () => {
    const file = path.join(docsDir, "note.md");
    fs.writeFileSync(file, "first version of the note about alpha topic.");

    let store = new KnowledgeStore(collection);
    try {
      await ingestPath({
        store,
        embedder: fakeEmbedder,
        collection,
        path: file,
        chunking: { tokens: 400, overlap: 80 },
      });
    } finally {
      store.close();
    }

    fs.writeFileSync(file, "second version of the note about beta topic now.");
    store = new KnowledgeStore(collection);
    try {
      await ingestPath({
        store,
        embedder: fakeEmbedder,
        collection,
        path: file,
        chunking: { tokens: 400, overlap: 80 },
      });
      const stat = store.stats(collection)[0];
      // Only one source, and a small single-chunk doc stays a single chunk.
      expect(stat.sources).toBe(1);
      expect(stat.chunks).toBe(1);
      const chunks = store.allChunks(collection);
      expect(chunks[0].text).toContain("beta");
      expect(chunks[0].text).not.toContain("alpha");
    } finally {
      store.close();
    }
  });

  it("returns [] when searching an empty collection", async () => {
    const store = new KnowledgeStore("empty-collection");
    try {
      const hits = await searchKnowledge({
        store,
        embedder: fakeEmbedder,
        collection: "empty-collection",
        query: "anything",
        topK: 5,
      });
      expect(hits).toEqual([]);
    } finally {
      store.close();
    }
  });
});
