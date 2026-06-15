// `openclaw mcp ...` management commands.
//
// sync   — connect to servers, discover tools, write manifests (run after config changes)
// list   — show configured servers and cached tool counts
// tools  — list cached tools for a server
// call   — invoke a tool directly (for testing connectivity / output)

import type { Command } from "commander";

import type { McpClientConfig } from "./config.js";
import { getManager } from "./client-manager.js";
import { manifestDir, readManifestSync, writeManifest, type McpServerManifest } from "./manifest.js";

type CliLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug?: (message: string) => void;
};

export function registerMcpCli(params: {
  program: Command;
  config: McpClientConfig;
  logger: CliLogger;
}): void {
  const { program, config, logger } = params;

  const mcp = program.command("mcp").description("Manage Model Context Protocol (MCP) servers");

  mcp
    .command("list")
    .description("List configured MCP servers and cached tool counts")
    .action(() => {
      if (config.servers.length === 0) {
        logger.info(
          "No MCP servers configured. Add them under plugins.entries.mcp-client.config.servers",
        );
        return;
      }
      for (const server of config.servers) {
        const manifest = readManifestSync(server.name);
        const count = manifest ? manifest.tools.length : 0;
        const status = !server.enabled
          ? "disabled"
          : manifest
            ? `${count} tool(s) cached`
            : "not synced — run: openclaw mcp sync";
        logger.info(`• ${server.name} [${server.transport}] — ${status}`);
      }
      logger.info(`Manifest dir: ${manifestDir()}`);
    });

  mcp
    .command("sync [server]")
    .description("Connect to MCP servers, discover their tools, and cache them for agents")
    .action(async (serverName?: string) => {
      const targets = config.servers.filter(
        (s) => s.enabled && (!serverName || s.name === serverName),
      );
      if (targets.length === 0) {
        logger.warn(
          serverName
            ? `No enabled MCP server named '${serverName}'.`
            : "No enabled MCP servers configured.",
        );
        return;
      }
      const manager = getManager();
      let ok = 0;
      for (const server of targets) {
        try {
          const tools = await manager.listTools(server, config.connectTimeoutMs);
          const manifest: McpServerManifest = {
            server: server.name,
            updatedAt: new Date().toISOString(),
            tools,
          };
          const file = await writeManifest(manifest);
          logger.info(`✓ ${server.name}: ${tools.length} tool(s) cached → ${file}`);
          ok += 1;
        } catch (err) {
          logger.error(
            `✗ ${server.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      await manager.closeAll();
      logger.info(
        `Synced ${ok}/${targets.length} server(s). New tools load in the next agent session.`,
      );
    });

  mcp
    .command("tools <server>")
    .description("Show cached tools for a server")
    .action((server: string) => {
      const manifest = readManifestSync(server);
      if (!manifest) {
        logger.warn(`No cached manifest for '${server}'. Run: openclaw mcp sync ${server}`);
        return;
      }
      logger.info(`${manifest.tools.length} tool(s) for ${server} (synced ${manifest.updatedAt}):`);
      for (const tool of manifest.tools) {
        logger.info(`• ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`);
      }
    });

  mcp
    .command("call <server> <tool>")
    .description("Call an MCP tool directly (for testing)")
    .option("--args <json>", "Tool arguments as a JSON object", "{}")
    .action(async (server: string, tool: string, opts: { args?: string }) => {
      const target = config.servers.find((s) => s.name === server);
      if (!target) {
        logger.error(`Unknown MCP server '${server}'.`);
        return;
      }
      let args: Record<string, unknown> = {};
      try {
        const parsed = opts.args ? JSON.parse(opts.args) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        } else {
          logger.error("--args must be a JSON object");
          return;
        }
      } catch {
        logger.error("--args must be valid JSON");
        return;
      }
      const manager = getManager();
      try {
        const result = await manager.callTool(target, tool, args, {
          connectTimeoutMs: config.connectTimeoutMs,
          toolTimeoutMs: config.toolTimeoutMs,
        });
        logger.info(result.text);
        if (result.isError) logger.warn("(tool reported isError=true)");
      } catch (err) {
        logger.error(`call failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await manager.closeAll();
      }
    });
}
