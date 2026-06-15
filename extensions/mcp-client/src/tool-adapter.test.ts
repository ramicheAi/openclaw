import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { McpClientConfig, McpServerConfig } from "./config.js";
import type { McpCallResult, ToolCaller } from "./client-manager.js";
import { buildMcpTool, collectMcpToolsSync, sanitizeInputSchema } from "./tool-adapter.js";

const baseConfig = (servers: McpServerConfig[]): McpClientConfig => ({
  servers,
  toolTimeoutMs: 60_000,
  connectTimeoutMs: 20_000,
  toolPrefix: "mcp",
});

// Minimal AnyAgentTool executor accessor for tests.
const exec = (tool: unknown) =>
  (tool as { execute: (id: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> }).execute;

describe("sanitizeInputSchema", () => {
  it("defaults missing schema to an object with properties", () => {
    expect(sanitizeInputSchema(undefined)).toEqual({ type: "object", properties: {} });
    expect(sanitizeInputSchema(null)).toEqual({ type: "object", properties: {} });
  });

  it("preserves properties/required and strips meta keywords", () => {
    const out = sanitizeInputSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "x",
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    });
    expect(out.$schema).toBeUndefined();
    expect(out.$id).toBeUndefined();
    expect(out.properties).toEqual({ a: { type: "string" } });
    expect(out.required).toEqual(["a"]);
  });

  it("forces object type when the schema is not an object", () => {
    const out = sanitizeInputSchema({ type: "string" });
    expect(out.type).toBe("object");
    expect(out.properties).toEqual({});
  });
});

describe("buildMcpTool", () => {
  const server: McpServerConfig = { name: "demo", transport: "stdio", enabled: true, command: "echo" };

  it("builds a namespaced tool that proxies to the caller", async () => {
    const calls: Array<{ server: string; tool: string; args: Record<string, unknown> }> = [];
    const caller: ToolCaller = {
      async callTool(s, toolName, args): Promise<McpCallResult> {
        calls.push({ server: s.name, tool: toolName, args });
        return { text: "hello result", isError: false, raw: { ok: true } };
      },
    };
    const tool = buildMcpTool(baseConfig([server]), server, { name: "greet", description: "Greet" }, caller);
    expect(tool.name).toBe("mcp__demo__greet");
    expect(tool.description).toContain("[MCP:demo]");

    const res = await exec(tool)("call-1", { who: "world" });
    expect(res.content[0]).toEqual({ type: "text", text: "hello result" });
    expect(res.details).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ server: "demo", tool: "greet", args: { who: "world" } });
  });

  it("throws when the MCP tool returns isError", async () => {
    const caller: ToolCaller = {
      async callTool(): Promise<McpCallResult> {
        return { text: "boom", isError: true, raw: {} };
      },
    };
    const tool = buildMcpTool(baseConfig([server]), server, { name: "fail" }, caller);
    await expect(exec(tool)("id", {})).rejects.toThrow("boom");
  });
});

describe("collectMcpToolsSync", () => {
  let tmp: string;
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.OPENCLAW_STATE_DIR;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-adapter-"));
    process.env.OPENCLAW_STATE_DIR = tmp;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("reads cached manifests and applies exclude filters", () => {
    const dir = path.join(tmp, "mcp-client");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "demo.json"),
      JSON.stringify({
        server: "demo",
        updatedAt: "now",
        tools: [{ name: "keep" }, { name: "drop" }, { name: "also_keep" }],
      }),
    );
    const server: McpServerConfig = {
      name: "demo",
      transport: "stdio",
      enabled: true,
      command: "echo",
      excludeTools: ["drop"],
    };
    const tools = collectMcpToolsSync(baseConfig([server]));
    expect(tools.map((t) => t.name).sort()).toEqual(["mcp__demo__also_keep", "mcp__demo__keep"]);
  });

  it("returns nothing for an un-synced server", () => {
    const server: McpServerConfig = {
      name: "nomanifest",
      transport: "stdio",
      enabled: true,
      command: "echo",
    };
    expect(collectMcpToolsSync(baseConfig([server]))).toEqual([]);
  });

  it("skips disabled servers", () => {
    const dir = path.join(tmp, "mcp-client");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "demo.json"),
      JSON.stringify({ server: "demo", updatedAt: "now", tools: [{ name: "t" }] }),
    );
    const server: McpServerConfig = {
      name: "demo",
      transport: "stdio",
      enabled: false,
      command: "echo",
    };
    expect(collectMcpToolsSync(baseConfig([server]))).toEqual([]);
  });
});
