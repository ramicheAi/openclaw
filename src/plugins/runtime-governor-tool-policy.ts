/**
 * Runtime Governor — before_tool_call policy handler
 *
 * Registers a before_tool_call hook that enforces tool-level
 * allow/block policy for pilot agents (atlas, shuri, triage).
 */

import type { PluginRegistry } from "./registry.js";
import type {
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
} from "./types.js";

const PILOT_AGENTS = ["atlas", "shuri", "triage", "main"];

// =========================================================================
// Environment Gate
// =========================================================================

type RuntimeEnvironment = "openclaw" | "claude-code" | "cursor" | "peekaboo" | "web" | "unknown";

/** Tools that require OpenClaw runtime (not available in Claude Code, Cursor, etc.) */
const OPENCLAW_ONLY_TOOLS = new Set([
  "gateway",
  "cron",
  "message",
  "sessions_send",
  "sessions_spawn",
  "nodes",
]);

/** Tools that require a code editor environment */
const CODE_EDITOR_TOOLS = new Set<string>([]);

function classifyEnvironment(ctx: PluginHookToolContext): RuntimeEnvironment {
  const sk = ctx.sessionKey ?? "";
  if (sk.includes("pi-embedded") || sk.includes("claude-code")) return "claude-code";
  if (sk.includes("cursor")) return "cursor";
  if (sk.includes("peekaboo")) return "peekaboo";
  if (sk.includes("web")) return "web";
  // Default OpenClaw sessions: agent:*:*
  if (sk.startsWith("agent:") || sk === "") return "openclaw";
  return "unknown";
}

function checkEnvironmentGate(
  tool: string,
  env: RuntimeEnvironment,
  log: Logger,
  ctx: PluginHookToolContext,
): PluginHookBeforeToolCallResult | null {
  if (env !== "openclaw" && OPENCLAW_ONLY_TOOLS.has(tool)) {
    log.warn(
      `[runtime-governor] ENV_MISMATCH tool=${tool} env=${env} agent=${ctx.agentId ?? ctx.sessionKey} — requires openclaw runtime`,
    );
    return {
      block: true,
      blockReason: `tool "${tool}" requires OpenClaw runtime (current: ${env})`,
    };
  }
  if (env !== "cursor" && CODE_EDITOR_TOOLS.has(tool)) {
    log.warn(
      `[runtime-governor] ENV_MISMATCH tool=${tool} env=${env} agent=${ctx.agentId ?? ctx.sessionKey} — requires code editor`,
    );
    return {
      block: true,
      blockReason: `tool "${tool}" requires code editor environment (current: ${env})`,
    };
  }
  return null;
}

/** Tools that are always allowed without restriction. */
const SAFE_TOOLS = new Set([
  "read",
  "write",
  "edit",
  "exec",
  "web_search",
  "web_fetch",
  "memory_get",
  "memory_search",
  "image",
  "canvas",
  "tts",
  "cron",
  "session_status",
  "sessions_list",
  "sessions_history",
  "agents_list",
  "process",
  "nodes",
]);

/** Tools that are flagged (logged) but allowed. */
const FLAGGED_TOOLS = new Set(["message", "sessions_send", "sessions_spawn", "browser", "gateway"]);

/** Tools that are blocked outright for pilot agents. */
const BLOCKED_TOOLS = new Set<string>([
  // Add destructive or unauthorized tools here as needed.
]);

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  debug?: (msg: string) => void;
};

// =========================================================================
// Metrics
// =========================================================================

interface PolicyMetric {
  ts: string;
  environment: RuntimeEnvironment;
  agent: string;
  tool: string;
  decision: "allow" | "flag" | "block";
  reason: string;
  latency_ms: number;
  estimated_cost: number;
  blocked_mismatch: boolean;
}

const TOOL_COST_ESTIMATES: Record<string, number> = {
  web_search: 0.01,
  web_fetch: 0.005,
  browser: 0.02,
  sessions_spawn: 0.05,
  gateway: 0.01,
  image: 0.03,
  tts: 0.02,
};
const DEFAULT_TOOL_COST = 0.001;

function emitMetric(metric: PolicyMetric, log: Logger): void {
  log.info(`[runtime-governor-metric] ${JSON.stringify(metric)}`);
}

function isPilotAgent(ctx: PluginHookToolContext): boolean {
  const agentId = ctx.agentId ?? "";
  const sessionKey = ctx.sessionKey ?? "";
  return PILOT_AGENTS.some((a) => agentId === a || sessionKey.includes(a));
}

function handleBeforeToolCall(
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext,
  log: Logger,
): PluginHookBeforeToolCallResult | void {
  const t0 = Date.now();
  const tool = event.toolName;
  const agent = ctx.agentId ?? ctx.sessionKey ?? "unknown";
  const env = classifyEnvironment(ctx);

  if (!isPilotAgent(ctx)) {
    return; // Non-pilot agents: no policy enforcement
  }

  // Environment gate — block tools that don't belong in current runtime
  const envBlock = checkEnvironmentGate(tool, env, log, ctx);
  if (envBlock) {
    emitMetric(
      {
        ts: new Date().toISOString(),
        environment: env,
        agent,
        tool,
        decision: "block",
        reason: envBlock.blockReason ?? "env_mismatch",
        latency_ms: Date.now() - t0,
        estimated_cost: TOOL_COST_ESTIMATES[tool] ?? DEFAULT_TOOL_COST,
        blocked_mismatch: true,
      },
      log,
    );
    return envBlock;
  }

  // Blocked
  if (BLOCKED_TOOLS.has(tool)) {
    log.warn(`[runtime-governor] BLOCKED tool=${tool} agent=${agent}`);
    emitMetric(
      {
        ts: new Date().toISOString(),
        environment: env,
        agent,
        tool,
        decision: "block",
        reason: "blocked_by_policy",
        latency_ms: Date.now() - t0,
        estimated_cost: TOOL_COST_ESTIMATES[tool] ?? DEFAULT_TOOL_COST,
        blocked_mismatch: false,
      },
      log,
    );
    return { block: true, blockReason: `tool "${tool}" is blocked by runtime-governor policy` };
  }

  // Flagged (allowed but logged)
  if (FLAGGED_TOOLS.has(tool)) {
    log.info(`[runtime-governor] FLAGGED tool=${tool} agent=${agent}`);
    emitMetric(
      {
        ts: new Date().toISOString(),
        environment: env,
        agent,
        tool,
        decision: "flag",
        reason: "flagged_tool",
        latency_ms: Date.now() - t0,
        estimated_cost: TOOL_COST_ESTIMATES[tool] ?? DEFAULT_TOOL_COST,
        blocked_mismatch: false,
      },
      log,
    );
    return; // Allow
  }

  // Safe
  if (SAFE_TOOLS.has(tool)) {
    log.debug?.(`[runtime-governor] ALLOWED tool=${tool} agent=${agent}`);
    emitMetric(
      {
        ts: new Date().toISOString(),
        environment: env,
        agent,
        tool,
        decision: "allow",
        reason: "safe_tool",
        latency_ms: Date.now() - t0,
        estimated_cost: TOOL_COST_ESTIMATES[tool] ?? DEFAULT_TOOL_COST,
        blocked_mismatch: false,
      },
      log,
    );
    return; // Allow
  }

  // Unknown tool — allow but flag
  log.info(`[runtime-governor] UNKNOWN tool=${tool} agent=${agent} — allowed (unclassified)`);
  emitMetric(
    {
      ts: new Date().toISOString(),
      environment: env,
      agent,
      tool,
      decision: "flag",
      reason: "unknown_tool",
      latency_ms: Date.now() - t0,
      estimated_cost: TOOL_COST_ESTIMATES[tool] ?? DEFAULT_TOOL_COST,
      blocked_mismatch: false,
    },
    log,
  );
}

export function registerRuntimeGovernorToolPolicy(registry: PluginRegistry, log: Logger): void {
  registry.typedHooks.push({
    pluginId: "runtime-governor",
    hookName: "before_tool_call",
    handler: (event: PluginHookBeforeToolCallEvent, ctx: PluginHookToolContext) =>
      handleBeforeToolCall(event, ctx, log),
    priority: 100, // High priority — runs first
    source: "bundled:runtime-governor",
  } as any);

  log.info("[runtime-governor] before_tool_call policy handler registered");
}
