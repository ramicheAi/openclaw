// Configuration parsing for the knowledge plugin.
//
// Parsing is intentionally defensive: every field falls back to a sane default
// and numeric fields are clamped, so junk config never breaks boot. Modeled on
// mcp-client/src/config.ts.

export type KnowledgeConfig = {
  /** Collection used when a tool/CLI call omits one. */
  defaultCollection: string;
  /** OpenAI embedding model id. */
  embeddingModel: string;
  /** Target chunk size in tokens (~4 chars/token heuristic). */
  chunkTokens: number;
  /** Tokens of overlap carried between adjacent chunks. */
  chunkOverlap: number;
  /** Default number of results returned by search. */
  topK: number;
  /** Environment variable holding the OpenAI API key. */
  apiKeyEnv: string;
};

export type ParsedKnowledgeConfig = { config: KnowledgeConfig; errors: string[] };

export const DEFAULT_COLLECTION = "default";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_CHUNK_TOKENS = 400;
export const DEFAULT_CHUNK_OVERLAP = 80;
export const DEFAULT_TOP_K = 6;
export const DEFAULT_API_KEY_ENV = "OPENAI_API_KEY";

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function clampNumber(v: unknown, dflt: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Sanitize a collection name into a safe SQLite filename segment. Lowercased,
 * non-alphanumerics collapsed to `-`, trimmed of leading/trailing separators.
 * Empty/garbage input falls back to the default collection name.
 */
export function sanitizeCollectionName(input: unknown): string {
  const raw = typeof input === "string" ? input : "";
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return cleaned || DEFAULT_COLLECTION;
}

export function parseKnowledgeConfig(raw: unknown): ParsedKnowledgeConfig {
  const errors: string[] = [];
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // defaultCollection: sanitize and warn if the cleaned value diverges meaningfully.
  const rawDefault = asString(root.defaultCollection);
  const defaultCollection = sanitizeCollectionName(rawDefault ?? DEFAULT_COLLECTION);
  if (rawDefault && sanitizeCollectionName(rawDefault) !== rawDefault.toLowerCase()) {
    errors.push(`defaultCollection sanitized to '${defaultCollection}'`);
  }

  const embeddingModel = asString(root.embeddingModel) ?? DEFAULT_EMBEDDING_MODEL;
  const apiKeyEnv = asString(root.apiKeyEnv) ?? DEFAULT_API_KEY_ENV;

  const chunkTokens = clampNumber(root.chunkTokens, DEFAULT_CHUNK_TOKENS, 50, 4000);
  // Overlap must stay strictly below chunk size or chunking can't advance.
  const overlapMax = Math.max(0, chunkTokens - 10);
  const chunkOverlap = clampNumber(root.chunkOverlap, DEFAULT_CHUNK_OVERLAP, 0, overlapMax);
  const topK = clampNumber(root.topK, DEFAULT_TOP_K, 1, 50);

  return {
    config: {
      defaultCollection,
      embeddingModel,
      chunkTokens,
      chunkOverlap,
      topK,
      apiKeyEnv,
    },
    errors,
  };
}
