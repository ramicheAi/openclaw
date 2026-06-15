// Embeddings abstraction.
//
// `Embedder` is a tiny interface so production code uses OpenAI while tests
// inject a deterministic fake — embeddings are NEVER required to hit the network
// for the unit suite. The OpenAI path follows memory-lancedb's usage of the
// `openai` SDK (`response.data[i].embedding`).

import OpenAI from "openai";

export type Embedder = {
  /** The embedding model id (recorded alongside stored vectors). */
  model: string;
  /** Embed a batch of texts, preserving input order. */
  embed(texts: string[]): Promise<number[][]>;
};

export type OpenAIEmbedderOptions = {
  apiKey: string;
  model: string;
  /** Optional client override (used by tests); defaults to a real OpenAI client. */
  client?: Pick<OpenAI, "embeddings">;
};

/** Build an OpenAI-backed embedder. */
export function createOpenAIEmbedder(opts: OpenAIEmbedderOptions): Embedder {
  const client = opts.client ?? new OpenAI({ apiKey: opts.apiKey });
  return {
    model: opts.model,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const response = await client.embeddings.create({
        model: opts.model,
        input: texts,
      });
      // The API returns one datum per input; sort by index defensively in case
      // ordering is ever not guaranteed.
      const data = [...response.data].sort((a, b) => a.index - b.index);
      return data.map((d) => d.embedding as number[]);
    },
  };
}

/**
 * Cosine similarity of two equal-length vectors. Returns 0 when either vector
 * is zero-magnitude or lengths differ (defensive — never throws / NaN).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
