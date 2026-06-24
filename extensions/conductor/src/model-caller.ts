// model-caller.ts — the live binding from the executor's injected `callModel` to the
// OpenClaw embedded agent runner (the same path llm-task uses). Kept dependency-injected
// (the runner is passed in) so the adapter's logic is unit-testable offline; the real
// runner is loaded via `loadEmbeddedRunner()` at registration time.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ModelCaller } from "./executor.js";

export type EmbeddedRunner = (params: Record<string, unknown>) => Promise<{ payloads?: Array<{ text?: string; isError?: boolean }> }>;

// "provider/model" → { provider, model }. The provider is everything before the first
// slash; the model is the remainder (model ids may themselves contain slashes, e.g.
// "lmstudio/google/gemma-4-e4b").
export function parseModelKey(modelKey: string): { provider: string; model: string } {
  const i = (modelKey || "").indexOf("/");
  if (i < 0) return { provider: "", model: modelKey || "" };
  return { provider: modelKey.slice(0, i), model: modelKey.slice(i + 1) };
}

export function collectText(payloads: Array<{ text?: string; isError?: boolean }> | undefined): string {
  return (payloads ?? [])
    .filter((p) => !p.isError && typeof p.text === "string")
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();
}

export interface ModelCallerOptions {
  runner: EmbeddedRunner;
  config: unknown;
  workspaceDir: string;
  timeoutMs?: number;
  maxTokens?: number;
}

// Build a ModelCaller that dispatches one (modelKey, prompt) to the embedded runner.
// Tools are disabled — each seat is a single text completion, not an agent loop.
export function createModelCaller(opts: ModelCallerOptions): ModelCaller {
  return async ({ modelKey, prompt }) => {
    const { provider, model } = parseModelKey(modelKey);
    if (!provider || !model) throw new Error(`conductor: bad model key '${modelKey}' (expected provider/model)`);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "conductor-"));
    try {
      const sessionId = `conductor-${Date.now()}`;
      const result = await opts.runner({
        sessionId,
        sessionFile: path.join(tmpDir, "session.json"),
        workspaceDir: opts.workspaceDir,
        config: opts.config,
        prompt,
        timeoutMs: opts.timeoutMs ?? 60_000,
        runId: sessionId,
        provider,
        model,
        authProfileId: undefined,
        authProfileIdSource: "auto",
        streamParams: { maxTokens: opts.maxTokens },
        disableTools: true,
      });
      return collectText(result?.payloads);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

// Resolve the real embedded runner. Internals live under src/ in a source checkout
// (dev/tests) and under the package root in a built install — the specifiers are kept
// non-literal so the type-checker doesn't try to resolve the layout that isn't present.
export async function loadEmbeddedRunner(): Promise<EmbeddedRunner> {
  const layouts = ["../../../src/agents/pi-embedded-runner.js", "../../../agents/pi-embedded-runner.js"];
  for (const specifier of layouts) {
    try {
      const mod = (await import(specifier)) as { runEmbeddedPiAgent?: unknown };
      if (typeof mod.runEmbeddedPiAgent === "function") return mod.runEmbeddedPiAgent as EmbeddedRunner;
    } catch {
      // try the next layout
    }
  }
  throw new Error("conductor: runEmbeddedPiAgent not available");
}
