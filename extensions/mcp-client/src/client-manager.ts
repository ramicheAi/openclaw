// Lazy, pooled MCP client connections built on the official SDK.
//
// Connections are established on first use (tool call or sync) and reused.
// stdio servers run as a child process for the gateway's lifetime; http/sse
// servers hold a streaming connection. On any call failure the client is
// evicted so the next call reconnects cleanly.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { McpServerConfig } from "./config.js";
import type { McpToolManifestEntry } from "./manifest.js";

const CLIENT_INFO = { name: "openclaw-mcp-client", version: "2026.1.29" };

export type McpCallResult = {
  /** Flattened text rendering of the tool result (agent-facing). */
  text: string;
  isError: boolean;
  /** The raw MCP CallToolResult, preserved for downstream consumers. */
  raw: unknown;
};

export type ToolCaller = {
  callTool(
    server: McpServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    opts: { connectTimeoutMs: number; toolTimeoutMs: number },
  ): Promise<McpCallResult>;
};

/** Construct the SDK transport for a server config (no connection performed). */
export function buildTransport(server: McpServerConfig): Transport {
  if (server.transport === "stdio") {
    if (!server.command) throw new Error(`mcp server '${server.name}': missing command`);
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: { ...getDefaultEnvironment(), ...server.env },
      stderr: "ignore",
    });
  }
  if (!server.url) throw new Error(`mcp server '${server.name}': missing url`);
  const url = new URL(server.url);
  const requestInit = server.headers ? { headers: server.headers } : undefined;
  if (server.transport === "sse") {
    return new SSEClientTransport(url, requestInit ? { requestInit } : undefined);
  }
  return new StreamableHTTPClientTransport(url, requestInit ? { requestInit } : undefined);
}

/** Flatten an MCP CallToolResult into agent-facing text (images/resources noted, raw kept). */
export function mapCallResult(res: unknown): McpCallResult {
  const r = (res ?? {}) as { content?: unknown; isError?: unknown };
  const isError = r.isError === true;
  const items = Array.isArray(r.content) ? r.content : [];
  const parts: string[] = [];
  for (const item of items) {
    const it = (item ?? {}) as Record<string, unknown>;
    if (it.type === "text" && typeof it.text === "string") {
      parts.push(it.text);
    } else if (it.type === "image") {
      const mime = typeof it.mimeType === "string" ? it.mimeType : "image";
      const bytes = typeof it.data === "string" ? it.data.length : 0;
      parts.push(`[image ${mime}, ${bytes} base64 chars — see tool result details]`);
    } else if (it.type === "audio") {
      const mime = typeof it.mimeType === "string" ? it.mimeType : "audio";
      parts.push(`[audio ${mime} — see tool result details]`);
    } else if (it.type === "resource" && it.resource && typeof it.resource === "object") {
      const resource = it.resource as Record<string, unknown>;
      if (typeof resource.text === "string") parts.push(resource.text);
      else parts.push(JSON.stringify(it.resource));
    } else {
      parts.push(JSON.stringify(it));
    }
  }
  const text = parts.join("\n").trim();
  return {
    text: text || (isError ? "(mcp tool error: no content returned)" : "(no content returned)"),
    isError,
    raw: res,
  };
}

export class McpClientManager implements ToolCaller {
  private pool = new Map<string, Promise<Client>>();

  private async open(server: McpServerConfig, connectTimeoutMs: number): Promise<Client> {
    const client = new Client(CLIENT_INFO, { capabilities: {} });
    const transport = buildTransport(server);
    await client.connect(transport, { timeout: connectTimeoutMs });
    return client;
  }

  async getClient(server: McpServerConfig, connectTimeoutMs: number): Promise<Client> {
    const existing = this.pool.get(server.name);
    if (existing) {
      try {
        return await existing;
      } catch {
        this.pool.delete(server.name);
      }
    }
    const pending = this.open(server, connectTimeoutMs);
    this.pool.set(server.name, pending);
    try {
      return await pending;
    } catch (err) {
      this.pool.delete(server.name);
      throw err;
    }
  }

  private async evict(name: string): Promise<void> {
    const pending = this.pool.get(name);
    this.pool.delete(name);
    if (!pending) return;
    try {
      const client = await pending;
      await client.close();
    } catch {
      /* ignore close errors on eviction */
    }
  }

  async listTools(
    server: McpServerConfig,
    connectTimeoutMs: number,
  ): Promise<McpToolManifestEntry[]> {
    try {
      const client = await this.getClient(server, connectTimeoutMs);
      const res = await client.listTools(undefined, { timeout: connectTimeoutMs });
      const tools = Array.isArray(res?.tools) ? res.tools : [];
      return tools.map((t) => ({
        name: String(t.name),
        description: typeof t.description === "string" ? t.description : undefined,
        inputSchema:
          t.inputSchema && typeof t.inputSchema === "object"
            ? (t.inputSchema as Record<string, unknown>)
            : undefined,
      }));
    } catch (err) {
      await this.evict(server.name);
      throw err;
    }
  }

  async callTool(
    server: McpServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    opts: { connectTimeoutMs: number; toolTimeoutMs: number },
  ): Promise<McpCallResult> {
    try {
      const client = await this.getClient(server, opts.connectTimeoutMs);
      const res = await client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { timeout: opts.toolTimeoutMs },
      );
      return mapCallResult(res);
    } catch (err) {
      await this.evict(server.name);
      throw err;
    }
  }

  async closeAll(): Promise<void> {
    const names = Array.from(this.pool.keys());
    await Promise.all(names.map((name) => this.evict(name)));
  }
}

let singleton: McpClientManager | null = null;

export function getManager(): McpClientManager {
  if (!singleton) singleton = new McpClientManager();
  return singleton;
}

export async function closeManager(): Promise<void> {
  if (singleton) await singleton.closeAll();
}
