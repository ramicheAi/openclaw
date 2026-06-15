// OpenClaw MCP client plugin.
//
// Surfaces tools from configured Model Context Protocol servers as first-class
// agent tools. Because the plugin loader registers tools synchronously, tools
// are discovered out-of-band via `openclaw mcp sync` and cached to disk; the
// sync tool factory below reads that cache so a slow/down server never blocks
// agent boot. Connections are established lazily on first tool call.

import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { parseMcpClientConfig } from "./src/config.js";
import { collectMcpToolsSync } from "./src/tool-adapter.js";
import { closeManager } from "./src/client-manager.js";
import { registerMcpCli } from "./src/cli.js";

export default function register(api: OpenClawPluginApi): void {
  const { config, errors } = parseMcpClientConfig(api.pluginConfig);
  for (const message of errors) api.logger.warn(`[mcp-client] ${message}`);

  if (config.servers.length > 0) {
    api.logger.info(
      `[mcp-client] ${config.servers.filter((s) => s.enabled).length} server(s) configured`,
    );
  }

  // Tools resolve per agent session from cached manifests (synchronous, no I/O
  // beyond a local file read). Sandboxed sessions do not get MCP tools.
  api.registerTool(
    (ctx) => {
      if (ctx.sandboxed) return null;
      return collectMcpToolsSync(config);
    },
    { optional: true },
  );

  // Management CLI: openclaw mcp sync|list|tools|call
  api.registerCli(
    ({ program }) => registerMcpCli({ program, config, logger: api.logger }),
    { commands: ["mcp"] },
  );

  // Close pooled connections cleanly on gateway shutdown.
  api.registerService({
    id: "mcp-client",
    start: () => {},
    stop: async () => {
      await closeManager();
    },
  });
}
