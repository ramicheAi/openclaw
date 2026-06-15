import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { McpServerConfig } from "./config.js";
import { buildTransport, mapCallResult } from "./client-manager.js";

describe("mapCallResult", () => {
  it("flattens text content blocks", () => {
    const r = mapCallResult({
      content: [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
    });
    expect(r.text).toBe("a\nb");
    expect(r.isError).toBe(false);
  });

  it("notes image content and preserves raw", () => {
    const raw = { content: [{ type: "image", data: "xxxx", mimeType: "image/png" }] };
    const r = mapCallResult(raw);
    expect(r.text).toContain("[image image/png");
    expect(r.raw).toBe(raw);
  });

  it("surfaces resource text", () => {
    const r = mapCallResult({
      content: [{ type: "resource", resource: { uri: "file://x", text: "body" } }],
    });
    expect(r.text).toBe("body");
  });

  it("marks errors", () => {
    const r = mapCallResult({ content: [{ type: "text", text: "bad" }], isError: true });
    expect(r.isError).toBe(true);
    expect(r.text).toBe("bad");
  });

  it("handles empty content", () => {
    expect(mapCallResult({}).text).toBe("(no content returned)");
  });
});

describe("buildTransport", () => {
  it("throws for stdio without a command", () => {
    const s: McpServerConfig = { name: "x", transport: "stdio", enabled: true };
    expect(() => buildTransport(s)).toThrow();
  });

  it("constructs http and sse transports without connecting", () => {
    const http: McpServerConfig = {
      name: "h",
      transport: "http",
      enabled: true,
      url: "https://example.com/mcp",
    };
    const sse: McpServerConfig = {
      name: "s",
      transport: "sse",
      enabled: true,
      url: "https://example.com/sse",
    };
    expect(buildTransport(http)).toBeTruthy();
    expect(buildTransport(sse)).toBeTruthy();
  });
});

describe("MCP round trip (in-memory)", () => {
  it("lists and calls a tool through a real client/server pair", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    server.registerTool(
      "echo",
      { description: "Echo the message", inputSchema: { message: z.string() } },
      async ({ message }) => ({ content: [{ type: "text", text: `echo: ${message}` }] }),
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const list = await client.listTools();
    expect(list.tools.map((t) => t.name)).toContain("echo");

    const result = await client.callTool({ name: "echo", arguments: { message: "hi" } });
    const mapped = mapCallResult(result);
    expect(mapped.text).toBe("echo: hi");
    expect(mapped.isError).toBe(false);

    await client.close();
    await server.close();
  });
});
