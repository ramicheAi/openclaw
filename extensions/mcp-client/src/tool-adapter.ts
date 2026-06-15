// Adapts cached MCP tool manifests into OpenClaw agent tools.
//
// Each MCP tool becomes a first-class agent tool named `<prefix>__<server>__<tool>`
// (e.g. `mcp__linear__create_issue`). The tool's JSON-Schema input is sanitized to
// satisfy provider constraints, and `execute` proxies to the pooled MCP client.

import type { AnyAgentTool } from "../../../src/agents/tools/common.js";

import type { McpClientConfig, McpServerConfig } from "./config.js";
import { mcpToolName } from "./config.js";
import { getManager, type ToolCaller } from "./client-manager.js";
import { readManifestSync, type McpToolManifestEntry } from "./manifest.js";

/**
 * Normalize an MCP tool's inputSchema into a provider-safe top-level schema.
 * Requirements observed across providers: top level must be an object with a
 * `properties` map, and JSON-Schema meta keywords ($schema/$id/$defs) are
 * stripped because some validators reject them.
 */
export function sanitizeInputSchema(schema: unknown): Record<string, unknown> {
  const base: Record<string, unknown> =
    schema && typeof schema === "object" && !Array.isArray(schema)
      ? { ...(schema as Record<string, unknown>) }
      : {};
  if (base.type !== "object") base.type = "object";
  if (!base.properties || typeof base.properties !== "object" || Array.isArray(base.properties)) {
    base.properties = {};
  }
  delete base.$schema;
  delete base.$id;
  delete base.$defs;
  return base;
}

function allowTool(server: McpServerConfig, toolName: string): boolean {
  if (server.includeTools && server.includeTools.length > 0) {
    if (!server.includeTools.includes(toolName)) return false;
  }
  if (server.excludeTools && server.excludeTools.includes(toolName)) return false;
  return true;
}

/** Build a single agent tool that proxies to an MCP server tool. */
export function buildMcpTool(
  config: McpClientConfig,
  server: McpServerConfig,
  entry: McpToolManifestEntry,
  caller: ToolCaller = getManager(),
): AnyAgentTool {
  const name = mcpToolName(config.toolPrefix, server.name, entry.name);
  const description = `[MCP:${server.name}] ${entry.description ?? entry.name}`.slice(0, 1024);
  const parameters = sanitizeInputSchema(entry.inputSchema);

  const tool = {
    name,
    description,
    // Raw JSON Schema object; AnyAgentTool's parameter type is permissive (TSchema).
    parameters: parameters as never,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const result = await caller.callTool(server, entry.name, params ?? {}, {
        connectTimeoutMs: config.connectTimeoutMs,
        toolTimeoutMs: config.toolTimeoutMs,
      });
      if (result.isError) {
        throw new Error(result.text || `MCP tool ${entry.name} returned an error`);
      }
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: result.raw,
      };
    },
  };

  return tool as unknown as AnyAgentTool;
}

/**
 * Synchronously assemble all agent tools from cached server manifests.
 * Safe to call from a plugin tool factory (no I/O beyond a local file read).
 */
export function collectMcpToolsSync(config: McpClientConfig): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [];
  for (const server of config.servers) {
    if (!server.enabled) continue;
    const manifest = readManifestSync(server.name);
    if (!manifest) continue;
    for (const entry of manifest.tools) {
      if (!allowTool(server, entry.name)) continue;
      tools.push(buildMcpTool(config, server, entry));
    }
  }
  return tools;
}
