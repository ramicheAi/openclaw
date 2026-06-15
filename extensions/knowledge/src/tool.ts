// The `knowledge_search` agent tool.
//
// Read-only retrieval over an ingested collection. The tool object shape mirrors
// mcp-client/src/tool-adapter.ts exactly: a raw JSON-Schema `parameters` cast as
// never, and an `execute` returning text-only `content` plus structured
// `details`. A missing API key returns a clear message rather than throwing, so
// a mis-configured environment never crashes the agent turn.

import type { AnyAgentTool } from "../../../src/agents/tools/common.js";

import type { KnowledgeConfig } from "./config.js";
import { sanitizeCollectionName } from "./config.js";
import { createOpenAIEmbedder, type Embedder } from "./embedder.js";
import { searchKnowledge, type SearchHit } from "./search.js";
import { KnowledgeStore } from "./store.js";

const PARAMETERS = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Natural-language question or phrase to retrieve relevant passages for.",
    },
    collection: {
      type: "string",
      description: "Knowledge collection to search. Defaults to the configured default collection.",
    },
    topK: {
      type: "number",
      description: "Maximum number of passages to return.",
    },
  },
  required: ["query"],
} as const;

/**
 * Build the `knowledge_search` tool. `embedderFactory` is injectable so tests can
 * avoid the network; production passes the OpenAI factory by default.
 */
export function createKnowledgeSearchTool(
  config: KnowledgeConfig,
  embedderFactory: (apiKey: string) => Embedder = (apiKey) =>
    createOpenAIEmbedder({ apiKey, model: config.embeddingModel }),
): AnyAgentTool {
  const tool = {
    name: "knowledge_search",
    description:
      "Search the ingested document knowledge base and return relevant passages with citations " +
      "([source#chunk]). Use to ground answers in ingested PDFs, DOCX, HTML, Markdown, or text files. " +
      "Read-only.",
    // Raw JSON Schema object; AnyAgentTool's parameter type is permissive (TSchema).
    parameters: PARAMETERS as never,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const query = typeof params.query === "string" ? params.query.trim() : "";
      if (!query) {
        return textResult("knowledge_search: 'query' is required.", { error: "missing_query" });
      }

      const apiKey = (process.env[config.apiKeyEnv] || "").trim();
      if (!apiKey) {
        return textResult(
          `knowledge_search: no API key found in $${config.apiKeyEnv}. Set it to enable retrieval.`,
          { error: "missing_api_key" },
        );
      }

      const collection = sanitizeCollectionName(
        typeof params.collection === "string" && params.collection.trim()
          ? params.collection
          : config.defaultCollection,
      );
      const topK = clampTopK(params.topK, config.topK);

      const store = new KnowledgeStore(collection);
      try {
        const embedder = embedderFactory(apiKey);
        const hits = await searchKnowledge({ store, embedder, collection, query, topK });
        return textResult(formatHits(hits, collection), {
          collection,
          query,
          count: hits.length,
          results: hits,
        });
      } catch (err) {
        return textResult(
          `knowledge_search: search failed: ${err instanceof Error ? err.message : String(err)}`,
          { error: "search_failed" },
        );
      } finally {
        store.close();
      }
    },
  };

  return tool as unknown as AnyAgentTool;
}

function clampTopK(raw: unknown, dflt: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : dflt;
  return Math.min(50, Math.max(1, n));
}

/** Render hits as a citation-prefixed text block for the agent. */
function formatHits(hits: SearchHit[], collection: string): string {
  if (hits.length === 0) {
    return `No relevant passages found in collection '${collection}'.`;
  }
  const blocks = hits.map((h) => {
    const snippet = h.text.length > 600 ? `${h.text.slice(0, 600)}…` : h.text;
    return `[${h.source}#${h.chunkIndex}] (score ${h.score.toFixed(2)})\n${snippet}`;
  });
  return `Found ${hits.length} passage(s) in '${collection}':\n\n${blocks.join("\n\n")}`;
}

function textResult(text: string, details: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], details };
}
