import { describe, expect, it } from "vitest";
import "./test-helpers/fast-coding-tools.js";
import type { OpenClawConfig } from "../config/config.js";
import { validateAgentCapabilities } from "./capability-check.js";

describe("validateAgentCapabilities", () => {
  it("passes when no manifest is declared", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "main", workspace: "~/openclaw" }] },
    };
    const result = validateAgentCapabilities({ config: cfg, agentId: "main" });
    expect(result).toEqual({ ok: true });
  });

  it("passes when required.length === 0", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/openclaw", capabilities: { required: [] } }],
      },
    };
    const result = validateAgentCapabilities({ config: cfg, agentId: "main" });
    expect(result).toEqual({ ok: true });
  });

  it("passes when all required tools are reachable under default policy", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            capabilities: { required: ["read", "write", "exec"] },
          },
        ],
      },
    };
    const result = validateAgentCapabilities({ config: cfg, agentId: "main" });
    expect(result).toEqual({ ok: true });
  });

  it("fails when a required tool is denied at the global level", () => {
    const cfg: OpenClawConfig = {
      tools: { deny: ["write"] },
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            capabilities: { required: ["read", "write"] },
          },
        ],
      },
    };
    const result = validateAgentCapabilities({ config: cfg, agentId: "main" });
    expect(result).toEqual({ ok: false, agentId: "main", missing: ["write"] });
  });

  it("fails when a required tool is filtered out by agent allowlist", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            tools: { allow: ["read"] },
            capabilities: { required: ["read", "write"] },
          },
        ],
      },
    };
    const result = validateAgentCapabilities({ config: cfg, agentId: "main" });
    expect(result).toEqual({ ok: false, agentId: "main", missing: ["write"] });
  });

  it("expands group aliases (all members must be reachable)", () => {
    // group:fs -> ["read","write","edit","apply_patch"].
    // apply_patch is gated separately and not produced by default; should be missing.
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            capabilities: { required: ["group:fs"] },
          },
        ],
      },
    };
    const result = validateAgentCapabilities({ config: cfg, agentId: "main" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toContain("apply_patch");
    expect(result.missing).not.toContain("read");
  });

  it("returns missing for tools the agent explicitly denies", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            tools: { deny: ["exec"] },
            capabilities: { required: ["read", "exec"] },
          },
        ],
      },
    };
    const result = validateAgentCapabilities({ config: cfg, agentId: "main" });
    expect(result).toEqual({ ok: false, agentId: "main", missing: ["exec"] });
  });

  it("returns ok=true for an unknown agent id (no manifest to check)", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            capabilities: { required: ["read"] },
          },
        ],
      },
    };
    const result = validateAgentCapabilities({ config: cfg, agentId: "ghost" });
    expect(result).toEqual({ ok: true });
  });
});
