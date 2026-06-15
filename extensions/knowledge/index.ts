// OpenClaw knowledge-base plugin.
//
// Ingests documents (PDF, DOCX, HTML, Markdown, text) into per-collection SQLite
// stores and exposes a read-only `knowledge_search` agent tool that retrieves
// passages with citations. Tool registration is synchronous (the plugin loader
// does not await `register()`); the actual search/ingest work runs async inside
// the tool's `execute` and the CLI actions. Modeled on extensions/mcp-client.

import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { parseKnowledgeConfig } from "./src/config.js";
import { registerKnowledgeCli } from "./src/cli.js";
import { createKnowledgeSearchTool } from "./src/tool.js";

export default function register(api: OpenClawPluginApi): void {
  const { config, errors } = parseKnowledgeConfig(api.pluginConfig);
  for (const message of errors) api.logger.warn(`[knowledge] ${message}`);

  api.logger.info(
    `[knowledge] default collection '${config.defaultCollection}', model ${config.embeddingModel}`,
  );

  // The search tool is read-only, so it is allowed even in sandboxed sessions.
  // Registration is synchronous: the tool factory just constructs the tool
  // object; embeddings + DB access happen later inside execute().
  api.registerTool(() => createKnowledgeSearchTool(config), { optional: true });

  // Management CLI: openclaw knowledge ingest|search|list|stats|clear
  api.registerCli(
    ({ program }) => registerKnowledgeCli({ program, config, logger: api.logger }),
    { commands: ["knowledge"] },
  );

  // No background work to start; stores are opened per-operation and closed in
  // their own finally blocks, so there is nothing to tear down here.
  api.registerService({
    id: "knowledge",
    start: () => {},
    stop: () => {},
  });
}
