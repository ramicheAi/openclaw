/**
 * Runtime Governor — SDK Extension (tool_call handler)
 *
 * This is a pi-coding-agent extension that intercepts tool_call events
 * via the SDK extension system (the REAL production dispatch path).
 *
 * The plugin-hook system (PluginRegistry) never receives tool events
 * because the Claude SDK uses extensions, not streaming events, for
 * embedded sessions. This extension bridges that gap.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const PILOT_AGENTS = ["atlas", "shuri", "triage", "main"];

type RuntimeEnvironment = "openclaw" | "claude-code" | "cursor" | "peekaboo" | "web" | "unknown";

/** Tools that require OpenClaw runtime */
const OPENCLAW_ONLY_TOOLS = new Set([
  "gateway",
  "cron",
  "message",
  "sessions_send",
  "sessions_spawn",
  "nodes",
]);

/** Always allowed without restriction */
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

/** Allowed but logged */
const FLAGGED_TOOLS = new Set(["message", "sessions_send", "sessions_spawn", "browser", "gateway"]);

/** Blocked outright */
const BLOCKED_TOOLS = new Set<string>([]);

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

function classifyEnvironment(sessionKey: string): RuntimeEnvironment {
  if (sessionKey.includes("pi-embedded") || sessionKey.includes("claude-code"))
    return "claude-code";
  if (sessionKey.includes("cursor")) return "cursor";
  if (sessionKey.includes("peekaboo")) return "peekaboo";
  if (sessionKey.includes("web")) return "web";
  if (sessionKey.startsWith("agent:") || sessionKey === "") return "openclaw";
  return "unknown";
}

function isPilotSession(sessionKey: string): boolean {
  return PILOT_AGENTS.some((a) => sessionKey.includes(a));
}

export default function runtimeGovernorToolGate(api: ExtensionAPI): void {
  // Resolve session key from the session manager at handler time
  let sessionKey = "";

  api.on("session_start", (_event, ctx) => {
    // Capture session info on start
    const sm = ctx.sessionManager as any;
    sessionKey = sm?.sessionKey ?? sm?.id ?? "";
    console.warn(`[runtime-governor-ext] tool_call gate registered | session=${sessionKey}`);
  });

  api.on("tool_call", (event, _ctx) => {
    const t0 = Date.now();
    const tool = event.toolName;
    const env = classifyEnvironment(sessionKey);
    const agent = sessionKey || "unknown";

    console.warn(
      `[runtime-governor-ext] tool_call FIRED | tool=${tool} env=${env} session=${sessionKey}`,
    );

    // Only enforce for pilot agents
    if (!isPilotSession(sessionKey)) {
      return;
    }

    // Environment gate
    if (env !== "openclaw" && OPENCLAW_ONLY_TOOLS.has(tool)) {
      const reason = `tool "${tool}" requires OpenClaw runtime (current: ${env})`;
      console.warn(`[runtime-governor-ext] BLOCKED ENV_MISMATCH | tool=${tool} env=${env}`);
      logMetric(env, agent, tool, "block", "env_mismatch", Date.now() - t0, true);
      return { block: true, reason };
    }

    // Blocked tools
    if (BLOCKED_TOOLS.has(tool)) {
      console.warn(`[runtime-governor-ext] BLOCKED | tool=${tool} agent=${agent}`);
      logMetric(env, agent, tool, "block", "blocked_by_policy", Date.now() - t0, false);
      return { block: true, reason: `tool "${tool}" is blocked by runtime-governor policy` };
    }

    // Flagged tools (allowed but logged)
    if (FLAGGED_TOOLS.has(tool)) {
      console.warn(`[runtime-governor-ext] FLAGGED | tool=${tool} agent=${agent}`);
      logMetric(env, agent, tool, "flag", "flagged_tool", Date.now() - t0, false);
      return;
    }

    // Safe tools
    if (SAFE_TOOLS.has(tool)) {
      logMetric(env, agent, tool, "allow", "safe_tool", Date.now() - t0, false);
      return;
    }

    // Unknown — allow but flag
    console.warn(`[runtime-governor-ext] UNKNOWN tool=${tool} agent=${agent} — allowed`);
    logMetric(env, agent, tool, "flag", "unknown_tool", Date.now() - t0, false);
  });
}

function logMetric(
  env: RuntimeEnvironment,
  agent: string,
  tool: string,
  decision: "allow" | "flag" | "block",
  reason: string,
  latencyMs: number,
  blockedMismatch: boolean,
): void {
  const metric = {
    ts: new Date().toISOString(),
    environment: env,
    agent,
    tool,
    decision,
    reason,
    latency_ms: latencyMs,
    estimated_cost: TOOL_COST_ESTIMATES[tool] ?? DEFAULT_TOOL_COST,
    blocked_mismatch: blockedMismatch,
  };
  console.warn(`[runtime-governor-metric] ${JSON.stringify(metric)}`);
}
