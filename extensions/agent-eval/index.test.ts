import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import type { OpenClawPluginApi, OpenClawPluginService } from "../../src/plugins/types.js";
import register from "./index.js";

type Captured = {
  toolCount: number;
  cliCommands: string[][];
  services: OpenClawPluginService[];
};

function setup(pluginConfig: unknown): Captured {
  const cap: Captured = { toolCount: 0, cliCommands: [], services: [] };
  const api = {
    id: "agent-eval",
    name: "Agent Eval",
    source: "test",
    config: {},
    pluginConfig,
    runtime: {} as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    registerTool: () => {
      cap.toolCount += 1;
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

describe("agent-eval plugin registration", () => {
  it("registers the eval CLI and a service, and exposes no agent tool in v1", () => {
    const cap = setup({});
    expect(cap.toolCount).toBe(0);
    expect(cap.cliCommands).toContainEqual(["eval"]);
    expect(cap.services.map((s) => s.id)).toContain("agent-eval");
  });
});
