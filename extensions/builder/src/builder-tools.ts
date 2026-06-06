import path from "node:path";

import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

const DEFAULT_PROXY_URL = "http://127.0.0.1:3456/v1/chat/completions";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes — builds can be long.

type PluginCfg = {
  proxyUrl?: string;
  defaultModel?: string;
  designModel?: string;
  timeoutMs?: number;
  allowedRoots?: string[];
};

/**
 * Resolve effective plugin config. Some load contexts hand register() a populated
 * `api.pluginConfig`; others (per-pilot) don't thread it through but DO carry the full
 * `api.config`. We merge both so the safety gate (allowedRoots) is enforced everywhere,
 * never silently fail-open. Explicit pluginConfig values win; config-entry fills gaps.
 */
export function resolveCfg(api: OpenClawPluginApi): PluginCfg {
  const direct = (api.pluginConfig ?? {}) as PluginCfg;
  const fromEntry = ((api.config as any)?.plugins?.entries?.builder?.config ?? {}) as PluginCfg;
  const pickRoots = (a?: string[], b?: string[]) => {
    const av = Array.isArray(a) ? a.filter((s) => typeof s === "string" && s.trim()) : [];
    if (av.length > 0) return av;
    const bv = Array.isArray(b) ? b.filter((s) => typeof s === "string" && s.trim()) : [];
    return bv;
  };
  return {
    proxyUrl: direct.proxyUrl ?? fromEntry.proxyUrl,
    defaultModel: direct.defaultModel ?? fromEntry.defaultModel,
    designModel: direct.designModel ?? fromEntry.designModel,
    timeoutMs: typeof direct.timeoutMs === "number" ? direct.timeoutMs : fromEntry.timeoutMs,
    allowedRoots: pickRoots(direct.allowedRoots, fromEntry.allowedRoots),
  };
}

/**
 * Boundary-safe containment check: is `target` equal to, or nested under, `root`?
 * Avoids the `/a/bc`.startsWith(`/a/b`) false positive by requiring a separator.
 */
function isWithin(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}

function assertAllowed(cfg: PluginCfg, workingDir: string): string {
  const resolved = path.resolve(workingDir);
  const roots = Array.isArray(cfg.allowedRoots) ? cfg.allowedRoots.filter((s) => typeof s === "string" && s.trim()) : [];
  if (roots.length > 0 && !roots.some((root) => isWithin(root, resolved))) {
    throw new Error(
      `workingDir "${resolved}" is outside the builder's allowedRoots (${roots.join(", ")}). ` +
        `Refusing — the underlying Claude Code runs with skipped permissions.`,
    );
  }
  return resolved;
}

/** Extract assistant text from an OpenAI-compatible chat-completions response. */
function extractContent(json: unknown): string {
  const choices = (json as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  // Some servers return content as an array of parts.
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : typeof (p as { text?: string })?.text === "string" ? (p as { text: string }).text : ""))
      .join("")
      .trim();
  }
  return "";
}

async function dispatchToClaudeCode(args: {
  proxyUrl: string;
  model: string;
  systemFraming: string;
  task: string;
  workingDir: string;
  timeoutMs: number;
}): Promise<string> {
  const { proxyUrl, model, systemFraming, task, workingDir, timeoutMs } = args;

  // The proxy wraps a tool-enabled Claude Code CLI (file + bash tools). We steer it
  // with absolute paths under workingDir rather than relying on the proxy's fixed cwd.
  const prompt = [
    systemFraming,
    "",
    `WORKING DIRECTORY (operate only here, using absolute paths under it): ${workingDir}`,
    "",
    "Rules:",
    `- Use your file and bash tools with absolute paths rooted at ${workingDir}.`,
    "- Do not touch files outside the working directory.",
    "- Verify your work (build/lint/read-back) when feasible.",
    "- End your reply with a 1-3 sentence SUMMARY of exactly what you changed (files + nature of change).",
    "",
    "TASK:",
    task,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Builder proxy returned HTTP ${res.status}: ${body.slice(0, 400)}`);
    }

    const json = (await res.json()) as unknown;
    const text = extractContent(json);
    if (!text) throw new Error("Builder proxy returned an empty response");
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Build task timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function resolveCommon(api: OpenClawPluginApi, params: Record<string, unknown>, modelPref?: string) {
  const cfg = resolveCfg(api);

  const task = String(params.task ?? "").trim();
  if (!task) throw new Error("task required");

  const workingDirRaw = String(params.workingDir ?? "").trim();
  if (!workingDirRaw) throw new Error("workingDir required (absolute path to the target project)");
  if (!path.isAbsolute(workingDirRaw)) throw new Error(`workingDir must be an absolute path, got: ${workingDirRaw}`);
  const workingDir = assertAllowed(cfg, workingDirRaw);

  const model =
    (typeof params.model === "string" && params.model.trim()) ||
    (modelPref && modelPref.trim()) ||
    (typeof cfg.defaultModel === "string" && cfg.defaultModel.trim()) ||
    DEFAULT_MODEL;

  const timeoutMs =
    (typeof params.timeoutMs === "number" && params.timeoutMs > 0 ? params.timeoutMs : undefined) ||
    (typeof cfg.timeoutMs === "number" && cfg.timeoutMs > 0 ? cfg.timeoutMs : undefined) ||
    DEFAULT_TIMEOUT_MS;

  const proxyUrl =
    (typeof cfg.proxyUrl === "string" && cfg.proxyUrl.trim()) || DEFAULT_PROXY_URL;

  return { task, workingDir, model, timeoutMs, proxyUrl };
}

// Plain JSON Schema (no external deps) so this works as a global/installed extension
// where only Node core + the host's modules are resolvable. TypeBox would emit the same shape.
const BUILDER_PARAMS = {
  type: "object",
  properties: {
    task: { type: "string", description: "What to build/change, in plain language. Be specific about acceptance criteria." },
    workingDir: {
      type: "string",
      description: "Absolute path to the target project directory. Claude Code operates only within this directory.",
    },
    model: {
      type: "string",
      description: "Model alias override (e.g. claude-opus-4-6 for hard tasks, claude-haiku-4-5 for trivial ones).",
    },
    timeoutMs: { type: "number", description: "Per-task timeout in ms. Default 600000 (10m)." },
  },
  required: ["task", "workingDir"],
  additionalProperties: false,
} as const;

export function createDevTool(api: OpenClawPluginApi) {
  return {
    name: "dev",
    description:
      "Dispatch an autonomous CODING task to a tool-enabled Claude Code instance working inside a target project directory. " +
      "It can read/edit files and run commands, then returns a summary of what it changed. Use for implementing features, fixing bugs, refactors, scaffolding.",
    parameters: BUILDER_PARAMS,
    async execute(_id: string, params: Record<string, unknown>) {
      const { task, workingDir, model, timeoutMs, proxyUrl } = resolveCommon(api, params);
      const text = await dispatchToClaudeCode({
        proxyUrl,
        model,
        timeoutMs,
        workingDir,
        task,
        systemFraming:
          "You are Claude Code acting as an autonomous build engineer for the Parallax fleet. " +
          "Implement the task end to end with production-quality code that matches the surrounding conventions.",
      });
      return {
        content: [{ type: "text", text }],
        details: { tool: "dev", model, workingDir },
      };
    },
  };
}

export function createDesignTool(api: OpenClawPluginApi) {
  return {
    name: "design",
    description:
      "Dispatch an autonomous DESIGN task to a tool-enabled Claude Code instance working inside a target project directory. " +
      "Use for UI/visual work: HTML/CSS/SVG components, landing pages, layout and styling, design tokens, asset generation. Returns a summary of what it produced.",
    parameters: BUILDER_PARAMS,
    async execute(_id: string, params: Record<string, unknown>) {
      const { task, workingDir, model, timeoutMs, proxyUrl } = resolveCommon(api, params, resolveCfg(api).designModel);
      const text = await dispatchToClaudeCode({
        proxyUrl,
        model,
        timeoutMs,
        workingDir,
        task,
        systemFraming:
          "You are Claude Code acting as an autonomous design engineer for the Parallax fleet. " +
          "Produce polished, on-brand visual/front-end work (HTML/CSS/SVG/design tokens). Favor clean, accessible, responsive output and match any existing design system in the directory.",
      });
      return {
        content: [{ type: "text", text }],
        details: { tool: "design", model, workingDir },
      };
    },
  };
}
