import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import type { OpenClawPluginApi, OpenClawPluginService } from "../../src/plugins/types.js";
import register from "./index.js";

type Captured = {
  toolFactories: ((ctx: Record<string, unknown>) => unknown)[];
  tools: unknown[];
  cliCommands: string[][];
  services: OpenClawPluginService[];
  warnings: string[];
};

function setup(pluginConfig: unknown): Captured {
  const cap: Captured = { toolFactories: [], tools: [], cliCommands: [], services: [], warnings: [] };
  const api = {
    id: "mcp-client",
    name: "MCP Client",
    source: "test",
    config: {},
    pluginConfig,
    runtime: {} as never,
    logger: {
      info: vi.fn(),
      warn: (m: string) => cap.warnings.push(m),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerTool: (tool: unknown) => {
      if (typeof tool === "function") cap.toolFactories.push(tool as never);
      else cap.tools.push(tool);
    },
    registerCli: (registrar: (ctx: { program: Command }) => void, opts?: { commands?: string[] }) => {
      if (opts?.commands) cap.cliCommands.push(opts.commands);
      // Exercise the registrar against a real Command to ensure wiring doesn't throw.
      registrar({ program: new Command() });
    },
    registerService: (svc: OpenClawPluginService) => cap.services.push(svc),
    registerHook: vi.fn(),
    registerHttpHandler: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerChannel: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerProvider: vi.fn(),
    registerCommand: vi.fn(),
    resolvePath: (p: string) => p,
    on: vi.fn(),
  } as unknown as OpenClawPluginApi;
  register(api);
  return cap;
}

describe("mcp-client plugin registration", () => {
  it("registers a tool factory, the mcp CLI, and a lifecycle service", () => {
    const cap = setup({ servers: { demo: { command: "echo" } } });
    expect(cap.toolFactories.length).toBe(1);
    expect(cap.cliCommands).toContainEqual(["mcp"]);
    expect(cap.services.map((s) => s.id)).toContain("mcp-client");
  });

  it("tool factory returns null when sandboxed and an array otherwise", () => {
    const factory = setup({ servers: { demo: { command: "echo" } } }).toolFactories[0];
    expect(factory({ sandboxed: true })).toBeNull();
    expect(Array.isArray(factory({ sandboxed: false }))).toBe(true);
  });

  it("warns on an invalid server entry without throwing", () => {
    const cap = setup({ servers: { bad: { transport: "http" } } }); // http requires url
    expect(cap.warnings.some((w) => w.includes("bad"))).toBe(true);
  });
});
