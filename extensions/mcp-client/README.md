# @openclaw/mcp-client

Connect [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers to OpenClaw and
surface their tools to agents as **first-class tools**, named `mcp__<server>__<tool>`.

Transports:
- **stdio** — local servers launched as a child process (`command` + `args`)
- **http** — Streamable HTTP servers (`url`)
- **sse** — legacy SSE servers (`url`)

## How it works

The plugin loader registers tools synchronously, so tools are **discovered out-of-band and cached**:

1. You declare servers in config.
2. `openclaw mcp sync` connects to each server, lists its tools, and writes a manifest to
   `~/.openclaw/mcp-client/<server>.json`.
3. Each new agent session loads those cached tools. Connections are opened **lazily** on the first
   tool call and pooled — a slow or down server never blocks agent boot.

## Install

```bash
openclaw plugins install @openclaw/mcp-client
```

Restart the gateway afterwards.

## Config

Put under `plugins.entries.mcp-client.config`:

```json5
{
  servers: {
    // stdio (local) server
    filesystem: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      env: { SOME_TOKEN: "..." }
    },
    // remote HTTP server
    linear: {
      transport: "http",
      url: "https://mcp.linear.app/mcp",
      headers: { Authorization: "Bearer <token>" }
    }
  },
  toolTimeoutMs: 60000,
  connectTimeoutMs: 20000
}
```

Per-server `includeTools` / `excludeTools` arrays filter which discovered tools are exposed.
Set `enabled: false` to keep a server configured but inactive. `transport` is inferred when omitted
(`command` ⇒ stdio, `url` ⇒ http).

## Commands

```bash
openclaw mcp list              # configured servers + cached tool counts
openclaw mcp sync [server]     # discover + cache tools (run after config changes)
openclaw mcp tools <server>    # show cached tools for a server
openclaw mcp call <server> <tool> --args '{"key":"value"}'   # test a tool
```

After `openclaw mcp sync`, new tools become available in the next agent session.
