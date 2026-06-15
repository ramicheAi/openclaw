// `openclaw knowledge ...` management commands.
//
// ingest <paths...>  — extract, chunk, embed, and store documents
// search <query>     — retrieve passages with citations
// list               — collections and their chunk counts
// stats [collection] — chunk/source counts for one or all collections
// clear [collection] — drop one collection's chunks, or all of them
//
// Ingestion/search need an API key (read from the configured env var); the
// command prints a clear error and returns when it is absent.

import type { Command } from "commander";

import type { KnowledgeConfig } from "./config.js";
import { sanitizeCollectionName } from "./config.js";
import { createOpenAIEmbedder } from "./embedder.js";
import { ingestPath } from "./ingest.js";
import { knowledgeDir } from "./paths.js";
import { searchKnowledge } from "./search.js";
import { KnowledgeStore, listCollections } from "./store.js";

type CliLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug?: (message: string) => void;
};

export function registerKnowledgeCli(params: {
  program: Command;
  config: KnowledgeConfig;
  logger: CliLogger;
}): void {
  const { program, config, logger } = params;

  const knowledge = program
    .command("knowledge")
    .description("Manage the document knowledge base (ingest + retrieve)");

  knowledge
    .command("ingest <paths...>")
    .description("Ingest files or directories (PDF, DOCX, HTML, Markdown, text) into a collection")
    .option("--collection <name>", "Target collection", config.defaultCollection)
    .action(async (paths: string[], opts: { collection?: string }) => {
      const embedder = makeEmbedder(config, logger);
      if (!embedder) return;
      const collection = sanitizeCollectionName(opts.collection ?? config.defaultCollection);
      const store = new KnowledgeStore(collection);
      try {
        let files = 0;
        let chunks = 0;
        for (const p of paths) {
          try {
            const res = await ingestPath({
              store,
              embedder,
              collection,
              path: p,
              chunking: { tokens: config.chunkTokens, overlap: config.chunkOverlap },
            });
            files += res.files;
            chunks += res.chunks;
            logger.info(`✓ ${p}: ${res.files} file(s), ${res.chunks} chunk(s)`);
          } catch (err) {
            logger.error(`✗ ${p}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        logger.info(`Ingested ${files} file(s), ${chunks} chunk(s) into '${collection}'.`);
      } finally {
        store.close();
      }
    });

  knowledge
    .command("search <query>")
    .description("Retrieve passages from a collection with citations")
    .option("--collection <name>", "Collection to search", config.defaultCollection)
    .option("--top-k <n>", "Maximum results", String(config.topK))
    .action(async (query: string, opts: { collection?: string; topK?: string }) => {
      const embedder = makeEmbedder(config, logger);
      if (!embedder) return;
      const collection = sanitizeCollectionName(opts.collection ?? config.defaultCollection);
      const topK = clampInt(opts.topK, config.topK, 1, 50);
      const store = new KnowledgeStore(collection);
      try {
        const hits = await searchKnowledge({ store, embedder, collection, query, topK });
        if (hits.length === 0) {
          logger.info(`No results in '${collection}'.`);
          return;
        }
        for (const h of hits) {
          logger.info(`[${h.source}#${h.chunkIndex}] (score ${h.score.toFixed(2)})`);
          logger.info(h.text.length > 400 ? `${h.text.slice(0, 400)}…` : h.text);
          logger.info("");
        }
      } finally {
        store.close();
      }
    });

  knowledge
    .command("list")
    .description("List collections and their chunk counts")
    .action(() => {
      const collections = listCollections();
      if (collections.length === 0) {
        logger.info("No collections yet. Ingest documents with: openclaw knowledge ingest <path>");
        return;
      }
      for (const name of collections) {
        const store = new KnowledgeStore(name);
        try {
          const stat = store.stats(name)[0];
          const chunks = stat?.chunks ?? 0;
          const sources = stat?.sources ?? 0;
          logger.info(`• ${name} — ${chunks} chunk(s) from ${sources} source(s)`);
        } finally {
          store.close();
        }
      }
      logger.info(`Knowledge dir: ${knowledgeDir()}`);
    });

  knowledge
    .command("stats [collection]")
    .description("Show chunk/source counts for one or all collections")
    .action((collection?: string) => {
      const target = collection ? sanitizeCollectionName(collection) : undefined;
      const names = target ? [target] : listCollections();
      if (names.length === 0) {
        logger.info("No collections yet.");
        return;
      }
      for (const name of names) {
        const store = new KnowledgeStore(name);
        try {
          const stat = store.stats(name)[0];
          logger.info(
            `${name}: ${stat?.chunks ?? 0} chunk(s), ${stat?.sources ?? 0} source(s)`,
          );
          for (const src of store.sources(name)) logger.info(`  - ${src}`);
        } finally {
          store.close();
        }
      }
    });

  knowledge
    .command("clear [collection]")
    .description("Delete all chunks in a collection, or every collection when omitted")
    .action((collection?: string) => {
      const names = collection ? [sanitizeCollectionName(collection)] : listCollections();
      if (names.length === 0) {
        logger.info("Nothing to clear.");
        return;
      }
      for (const name of names) {
        const store = new KnowledgeStore(name);
        try {
          store.clear(name);
          logger.info(`Cleared '${name}'.`);
        } finally {
          store.close();
        }
      }
    });
}

/** Build the OpenAI embedder, or print a clear error and return null. */
function makeEmbedder(config: KnowledgeConfig, logger: CliLogger) {
  const apiKey = (process.env[config.apiKeyEnv] || "").trim();
  if (!apiKey) {
    logger.error(`No API key in $${config.apiKeyEnv}. Set it before ingesting or searching.`);
    return null;
  }
  return createOpenAIEmbedder({ apiKey, model: config.embeddingModel });
}

function clampInt(raw: string | undefined, dflt: number, min: number, max: number): number {
  const n = raw ? Number.parseInt(raw, 10) : dflt;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
