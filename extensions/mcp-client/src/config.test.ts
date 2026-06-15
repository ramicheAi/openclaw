import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_TOOL_TIMEOUT_MS,
  mcpToolName,
  parseMcpClientConfig,
  sanitizeNameSegment,
} from "./config.js";

describe("parseMcpClientConfig", () => {
  it("parses the map form and infers transports", () => {
    const { config, errors } = parseMcpClientConfig({
      servers: {
        linear: { url: "https://mcp.linear.app/mcp" },
        fs: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
      },
    });
    expect(errors).toEqual([]);
    expect(config.servers).toHaveLength(2);
    expect(config.servers.find((s) => s.name === "linear")?.transport).toBe("http");
    const fs = config.servers.find((s) => s.name === "fs");
    expect(fs?.transport).toBe("stdio");
    expect(fs?.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]);
  });

  it("parses the array form and honors enabled=false", () => {
    const { config } = parseMcpClientConfig({
      servers: [
        { name: "a", transport: "stdio", command: "echo" },
        { name: "b", transport: "http", url: "https://example.com/mcp", enabled: false },
      ],
    });
    expect(config.servers).toHaveLength(2);
    expect(config.servers.find((s) => s.name === "b")?.enabled).toBe(false);
  });

  it("skips invalid entries with errors and never throws", () => {
    const { config, errors } = parseMcpClientConfig({
      servers: {
        nocmd: { transport: "stdio" },
        nourl: { transport: "http" },
        badurl: { transport: "http", url: "not a url" },
        good: { command: "echo" },
      },
    });
    expect(config.servers.map((s) => s.name)).toEqual(["good"]);
    expect(errors).toHaveLength(3);
  });

  it("normalizes streamable-http aliases to http", () => {
    const { config } = parseMcpClientConfig({
      servers: { x: { transport: "streamable-http", url: "https://example.com/mcp" } },
    });
    expect(config.servers[0]?.transport).toBe("http");
  });

  it("applies timeout defaults and clamps out-of-range values", () => {
    expect(parseMcpClientConfig({}).config.toolTimeoutMs).toBe(DEFAULT_TOOL_TIMEOUT_MS);
    expect(parseMcpClientConfig({}).config.connectTimeoutMs).toBe(DEFAULT_CONNECT_TIMEOUT_MS);
    const { config } = parseMcpClientConfig({ toolTimeoutMs: 5, connectTimeoutMs: 999_999_999 });
    expect(config.toolTimeoutMs).toBe(1_000);
    expect(config.connectTimeoutMs).toBe(120_000);
  });

  it("tolerates non-object input", () => {
    expect(parseMcpClientConfig(undefined).config.servers).toEqual([]);
    expect(parseMcpClientConfig("nope").config.servers).toEqual([]);
  });
});

describe("mcpToolName", () => {
  it("namespaces and sanitizes segments", () => {
    expect(mcpToolName("mcp", "linear", "create_issue")).toBe("mcp__linear__create_issue");
    expect(mcpToolName("mcp", "my server", "weird.tool/name")).toBe("mcp__my_server__weird_tool_name");
  });

  it("caps the name at 128 chars while preserving the prefix", () => {
    const name = mcpToolName("mcp", "srv", "x".repeat(200));
    expect(name.length).toBeLessThanOrEqual(128);
    expect(name.startsWith("mcp__srv__")).toBe(true);
  });
});

describe("sanitizeNameSegment", () => {
  it("replaces unsafe characters and trims separators", () => {
    expect(sanitizeNameSegment("Hello, World!")).toBe("Hello_World");
    expect(sanitizeNameSegment("__a__b__")).toBe("a_b");
  });
});
