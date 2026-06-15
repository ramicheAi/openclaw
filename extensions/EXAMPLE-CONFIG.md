# Enabling the mcp-client, knowledge, and agent-eval extensions

These three extensions live under `extensions/` and are auto-discovered by the gateway.
To turn them on, merge the block below into your `openclaw.json` (under `plugins.entries`),
set the secrets, run the one-time sync/ingest steps, then restart the gateway.

```json5
{
  plugins: {
    entries: {
      // 1) Native MCP client — surfaces MCP servers' tools to agents as mcp__<server>__<tool>
      "mcp-client": {
        enabled: true,
        config: {
          servers: {
            // local stdio server (child process)
            filesystem: {
              transport: "stdio",
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
            },
            // remote HTTP server with auth
            linear: {
              transport: "http",
              url: "https://mcp.linear.app/mcp",
              headers: { Authorization: "Bearer <TOKEN>" },
            },
          },
          toolTimeoutMs: 60000,
          connectTimeoutMs: 20000,
        },
      },

      // 2) Document knowledge base — ingest docs, retrieve with the knowledge_search tool
      "knowledge": {
        enabled: true,
        config: {
          defaultCollection: "default",
          embeddingModel: "text-embedding-3-small",
          chunkTokens: 400,
          chunkOverlap: 80,
          topK: 6,
          apiKeyEnv: "OPENAI_API_KEY",
        },
      },

      // 3) Agent eval harness — CLI-driven; no config required to start
      "agent-eval": {
        enabled: true,
        config: {
          judgeModel: "gpt-4o-mini",
          passThreshold: 0.6,
        },
      },
    },
  },
}
```

## One-time activation steps

```bash
# MCP: discover + cache each server's tools (re-run after changing servers)
openclaw mcp sync
openclaw mcp list

# Knowledge: ingest documents into a collection (needs OPENAI_API_KEY)
export OPENAI_API_KEY=sk-...
openclaw knowledge ingest ./docs --collection default
openclaw knowledge list

# Eval: run a suite against an agent/model (JSON suite file)
openclaw eval run ./my-suite.json --responder command --command "openclaw agent --message"
```

Then restart the gateway (via the macOS app or `scripts/restart-mac.sh`).
New MCP tools and ingested knowledge become available in the next agent session.

> Secrets (API keys, `Authorization` headers) live in config/env only. They are never
> written to the on-disk tool manifests, knowledge store, or eval reports.
