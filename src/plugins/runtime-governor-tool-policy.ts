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
  const tool = event.toolName;

  if (!isPilotAgent(ctx)) {
    return; // Non-pilot agents: no policy enforcement
  }

  // Environment gate — block tools that don't belong in current runtime
  const env = classifyEnvironment(ctx);
  const envBlock = checkEnvironmentGate(tool, env, log, ctx);
  if (envBlock) return envBlock;

  log.debug?.(`[runtime-governor] env=${env} tool=${tool} agent=${ctx.agentId ?? ctx.sessionKey}`);

  // Blocked
  if (BLOCKED_TOOLS.has(tool)) {
    log.warn(`[runtime-governor] BLOCKED tool=${tool} agent=${ctx.agentId ?? ctx.sessionKey}`);
    return { block: true, blockReason: `tool "${tool}" is blocked by runtime-governor policy` };
  }

  // Flagged (allowed but logged)
  if (FLAGGED_TOOLS.has(tool)) {
    log.info(`[runtime-governor] FLAGGED tool=${tool} agent=${ctx.agentId ?? ctx.sessionKey}`);
    return; // Allow
  }

  // Safe
  if (SAFE_TOOLS.has(tool)) {
    log.debug?.(`[runtime-governor] ALLOWED tool=${tool} agent=${ctx.agentId ?? ctx.sessionKey}`);
    return; // Allow
  }

  // Unknown tool — allow but flag
  log.info(
    `[runtime-governor] UNKNOWN tool=${tool} agent=${ctx.agentId ?? ctx.sessionKey} — allowed (unclassified)`,
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
