// Retrieval: embed the query, score every chunk in the collection by cosine
// similarity, return the top-k. A small keyword bonus nudges chunks that contain
// the literal query terms above ties — semantic similarity remains the core
// signal. Brute force is fine here: collections are document-scale (thousands of
// chunks), and a single in-memory pass keeps the plugin dependency-free.

import { cosineSimilarity, type Embedder } from "./embedder.js";
import type { KnowledgeStore } from "./store.js";

export type SearchParams = {
  store: KnowledgeStore;
  embedder: Embedder;
  collection: string;
  query: string;
  topK: number;
};

export type SearchHit = {
  source: string;
  chunkIndex: number;
  score: number;
  text: string;
};

/** Tiny additive bonus per distinct query term found (capped) so cosine dominates. */
const KEYWORD_BONUS = 0.02;
const MAX_KEYWORD_BONUS = 0.1;

/** DoS backstop: cap the in-memory cosine scan per search (high enough to never bite normal corpora). */
const MAX_SCAN_CHUNKS = 200_000;

export async function searchKnowledge(params: SearchParams): Promise<SearchHit[]> {
  const { store, embedder, collection, query, topK } = params;
  const all = store.allChunks(collection);
  if (all.length === 0) return [];
  const rows = all.length > MAX_SCAN_CHUNKS ? all.slice(0, MAX_SCAN_CHUNKS) : all;

  const [queryVec] = await embedder.embed([query]);
  if (!queryVec || queryVec.length === 0) return [];

  const terms = keywordTerms(query);

  const scored = rows.map((row) => {
    const cosine = cosineSimilarity(queryVec, row.embedding);
    const bonus = keywordBoost(row.text, terms);
    return {
      source: row.source,
      chunkIndex: row.chunkIndex,
      score: cosine + bonus,
      text: row.text,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, topK));
}

/** Distinct lowercased query terms of length >= 3 (skips stop-word-ish noise). */
function keywordTerms(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3) seen.add(raw);
  }
  return [...seen];
}

function keywordBoost(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  let bonus = 0;
  for (const term of terms) {
    if (haystack.includes(term)) bonus += KEYWORD_BONUS;
  }
  return Math.min(MAX_KEYWORD_BONUS, bonus);
}
