import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import type { OpenClawPluginApi, OpenClawPluginService } from "../../src/plugins/types.js";
import register from "./index.js";

type Captured = {
  toolFactories: ((ctx: Record<string, unknown>) => unknown)[];
  cliCommands: string[][];
  services: OpenClawPluginService[];
};

function setup(pluginConfig: unknown): Captured {
  const cap: Captured = { toolFactories: [], cliCommands: [], services: [] };
  const api = {
    id: "knowledge",
    name: "Knowledge",
    source: "test",
    config: {},
    pluginConfig,
    runtime: {} as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    registerTool: (tool: unknown) => {
      if (typeof tool === "function") cap.toolFactories.push(tool as never);
    },
    registerCli: (registrar: (ctx: { program: Command }) => void, opts?: { commands?: string[] }) => {
      if (opts?.commands) cap.cliCommands.push(opts.commands);
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

describe("knowledge plugin registration", () => {
  it("registers the knowledge_search tool factory, CLI, and service", () => {
    const cap = setup({});
    expect(cap.toolFactories.length).toBe(1);
    expect(cap.cliCommands).toContainEqual(["knowledge"]);
    expect(cap.services.map((s) => s.id)).toContain("knowledge");
  });

  it("the tool factory builds a read-only knowledge_search tool", () => {
    const factory = setup({}).toolFactories[0];
    const tool = factory({ sandboxed: true }) as { name: string };
    // read-only tool is allowed even when sandboxed
    expect(tool?.name).toBe("knowledge_search");
  });
});
