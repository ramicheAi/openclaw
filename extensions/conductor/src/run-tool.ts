import os from "node:os";
import path from "node:path";

import { Type } from "@sinclair/typebox";

import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

import { type ConductorDeps, runConductorAuto } from "./executor.js";
import { createBlindScorer } from "./floor.js";
import { fileStore } from "./learning.js";
import { createModelCaller, loadEmbeddedRunner } from "./model-caller.js";
import { DEFAULT_ROSTER, DIVERSE_ROSTER, dispatchSummary, type Roster } from "./router.js";
import { DEFAULT_POLICY, type TrustPolicy } from "./model-trust.js";

type PluginCfg = {
  policy?: TrustPolicy;
  roster?: "default" | "diverse";
  maxTokens?: number;
  timeoutMs?: number;
};

function resolvePolicy(cfg: PluginCfg): TrustPolicy {
  if (cfg.policy?.allow) return { allow: { ...DEFAULT_POLICY.allow, ...cfg.policy.allow } };
  return DEFAULT_POLICY;
}

function resolveRoster(cfg: PluginCfg): Roster {
  return cfg.roster === "diverse" ? DIVERSE_ROSTER : DEFAULT_ROSTER;
}

// The end-to-end orchestration tool: classify a task, run the right mode across the
// roster, and return the final answer plus a short orchestration trace. Every model
// hop is egress-guarded and every cross-model input fortified (Phases 1-2) inside.
export function createRunTool(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as PluginCfg;
  const policy = resolvePolicy(cfg);
  const roster = resolveRoster(cfg);
  let caller: ConductorDeps["callModel"] | null = null;

  return {
    name: "conductor_run",
    label: "Conductor Run",
    description:
      "Run a task through the multi-model orchestration brain: a planner picks solo/relay/panel/trinity, " +
      "the right models draft/critique/synthesize/judge, and the answer is returned with a trace. Sensitive " +
      "data is egress-guarded and cross-model content is injection-fortified on every hop. Use for hard, " +
      "high-stakes, or multi-perspective work where a single model is not enough.",
    parameters: Type.Object({
      task: Type.String({ description: "The task to orchestrate." }),
      evidence: Type.Optional(Type.String({ description: "Optional retrieved evidence for the fact-check step (grounded tasks)." })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      if (!caller) {
        const runner = await loadEmbeddedRunner();
        caller = createModelCaller({
          runner,
          config: api.config,
          workspaceDir: api.config?.agents?.defaults?.workspace ?? process.cwd(),
          timeoutMs: cfg.timeoutMs,
          maxTokens: cfg.maxTokens,
        });
      }
      const deps: ConductorDeps = {
        callModel: caller,
        policy,
        roster,
        evidence: params.evidence ? String(params.evidence) : undefined,
        scorer: createBlindScorer(roster.JUDGE, caller), // Phase-4 quality floor
        learn: { store: fileStore(path.join(os.homedir(), ".openclaw", "conductor", "learning.json")) }, // Phase-6
        log: (m) => api.logger?.info?.(`conductor: ${m}`),
      };
      const result = await runConductorAuto(String(params.task ?? ""), deps);
      return {
        content: [{ type: "text" as const, text: result.final }],
        details: {
          mode: result.mode,
          trace: dispatchSummary(result.plan),
          egressBlocks: result.egressBlocks,
        },
      };
    },
  };
}
