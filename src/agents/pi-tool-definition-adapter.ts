import { appendFileSync, mkdirSync } from "node:fs";

import type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
} from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ClientToolDefinition } from "./pi-embedded-runner/run/params.js";
import { logDebug, logError } from "../logger.js";
import { normalizeToolName } from "./tool-policy.js";
import { jsonResult } from "./tools/common.js";

// biome-ignore lint/suspicious/noExplicitAny: TypeBox schema type from pi-agent-core uses a different module instance.
type AnyAgentTool = AgentTool<any, unknown>;

// =========================================================================
// Runtime Governor — inline tool policy (production dispatch path)
// =========================================================================

const PILOT_AGENTS = ["atlas", "shuri", "triage", "main"];

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

const FLAGGED_TOOLS = new Set(["message", "sessions_send", "sessions_spawn", "browser", "gateway"]);

export const BLOCKED_TOOLS = new Set<string>([
  // Add tool names here to block them from model exposure.
]);

const OPENCLAW_ONLY_TOOLS = new Set([
  "gateway",
  "cron",
  "message",
  "sessions_send",
  "sessions_spawn",
  "nodes",
]);

type PolicyDecision = "allow" | "flag" | "block";

export interface ToolPolicyContext {
  agentId?: string;
  sessionKey?: string;
}

function isPilotAgent(ctx: ToolPolicyContext): boolean {
  const agentId = ctx.agentId ?? "";
  const sessionKey = ctx.sessionKey ?? "";
  return PILOT_AGENTS.some((a) => agentId === a || sessionKey.includes(a));
}

type RuntimeEnvironment = "openclaw" | "claude-code" | "cursor" | "peekaboo" | "web" | "unknown";

function classifyEnvironment(ctx: ToolPolicyContext): RuntimeEnvironment {
  const sk = ctx.sessionKey ?? "";
  if (sk.includes("pi-embedded") || sk.includes("claude-code")) return "claude-code";
  if (sk.includes("cursor")) return "cursor";
  if (sk.includes("peekaboo")) return "peekaboo";
  if (sk.includes("web")) return "web";
  if (sk.startsWith("agent:") || sk === "") return "openclaw";
  return "unknown";
}

const POLICY_LOG_DIR = "/tmp/openclaw";
const POLICY_LOG_FILE = `${POLICY_LOG_DIR}/tool-policy-decisions.log`;

let logDirEnsured = false;

function logPolicyDecision(entry: {
  ts: string;
  agent: string;
  tool: string;
  decision: PolicyDecision;
  reason: string;
  env: string;
}): void {
  try {
    if (!logDirEnsured) {
      mkdirSync(POLICY_LOG_DIR, { recursive: true });
      logDirEnsured = true;
    }
    appendFileSync(POLICY_LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {
    // Logging must never break tool execution
  }
}

function evaluatePolicy(
  normalizedName: string,
  ctx: ToolPolicyContext,
): { decision: PolicyDecision; reason: string } | null {
  if (!isPilotAgent(ctx)) return null; // non-pilot: no enforcement

  const env = classifyEnvironment(ctx);

  // Environment gate
  if (env !== "openclaw" && OPENCLAW_ONLY_TOOLS.has(normalizedName)) {
    return {
      decision: "block",
      reason: `tool "${normalizedName}" requires openclaw runtime (current: ${env})`,
    };
  }

  // Blocked
  if (BLOCKED_TOOLS.has(normalizedName)) {
    return { decision: "block", reason: "blocked_by_policy" };
  }

  // Flagged (allowed but logged)
  if (FLAGGED_TOOLS.has(normalizedName)) {
    return { decision: "flag", reason: "flagged_tool" };
  }

  // Safe
  if (SAFE_TOOLS.has(normalizedName)) {
    return { decision: "allow", reason: "safe_tool" };
  }

  // Unknown — allow but flag
  return { decision: "flag", reason: "unknown_tool" };
}

// =========================================================================

function describeToolExecutionError(err: unknown): {
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    const message = err.message?.trim() ? err.message : String(err);
    return { message, stack: err.stack };
  }
  return { message: String(err) };
}

export function toToolDefinitions(
  tools: AnyAgentTool[],
  policyCtx?: ToolPolicyContext,
): ToolDefinition[] {
  return tools.map((tool) => {
    const name = tool.name || "tool";
    const normalizedName = normalizeToolName(name);
    return {
      name,
      label: tool.label ?? name,
      description: tool.description ?? "",
      // biome-ignore lint/suspicious/noExplicitAny: TypeBox schema from pi-agent-core uses a different module instance.
      parameters: tool.parameters as any,
      execute: async (
        toolCallId,
        params,
        onUpdate: AgentToolUpdateCallback<unknown> | undefined,
        _ctx,
        signal,
      ): Promise<AgentToolResult<unknown>> => {
        // Runtime governor policy check — before tool.execute()
        if (policyCtx) {
          const result = evaluatePolicy(normalizedName, policyCtx);
          if (result) {
            const agent = policyCtx.agentId ?? policyCtx.sessionKey ?? "unknown";
            const env = classifyEnvironment(policyCtx);
            logPolicyDecision({
              ts: new Date().toISOString(),
              agent,
              tool: normalizedName,
              decision: result.decision,
              reason: result.reason,
              env,
            });
            if (result.decision === "block") {
              logError(
                `[runtime-governor] POLICY_BLOCK tool=${normalizedName} agent=${agent} env=${env} reason=${result.reason}`,
              );
              return jsonResult({
                status: "blocked",
                tool: normalizedName,
                agent,
                env,
                reason: result.reason,
                decision: "block",
              });
            }
          }
        }

        // KNOWN: pi-coding-agent `ToolDefinition.execute` has a different signature/order
        // than pi-agent-core `AgentTool.execute`. This adapter keeps our existing tools intact.
        if (policyCtx) {
          const agent = policyCtx.agentId ?? policyCtx.sessionKey ?? "unknown";
          const env = classifyEnvironment(policyCtx);
          logPolicyDecision({
            ts: new Date().toISOString(),
            agent,
            tool: normalizedName,
            decision: "allow",
            reason: "passed",
            env,
          });
          logError(
            `[runtime-governor] POLICY_ALLOW_EXECUTE tool=${normalizedName} agent=${agent} env=${env}`,
          );
        }
        try {
          return await tool.execute(toolCallId, params, signal, onUpdate);
        } catch (err) {
          if (signal?.aborted) throw err;
          const name =
            err && typeof err === "object" && "name" in err
              ? String((err as { name?: unknown }).name)
              : "";
          if (name === "AbortError") throw err;
          const described = describeToolExecutionError(err);
          if (described.stack && described.stack !== described.message) {
            logDebug(`tools: ${normalizedName} failed stack:\n${described.stack}`);
          }
          logError(`[tools] ${normalizedName} failed: ${described.message}`);
          return jsonResult({
            status: "error",
            tool: normalizedName,
            error: described.message,
          });
        }
      },
    } satisfies ToolDefinition;
  });
}

// Convert client tools (OpenResponses hosted tools) to ToolDefinition format
// These tools are intercepted to return a "pending" result instead of executing
export function toClientToolDefinitions(
  tools: ClientToolDefinition[],
  onClientToolCall?: (toolName: string, params: Record<string, unknown>) => void,
): ToolDefinition[] {
  return tools.map((tool) => {
    const func = tool.function;
    return {
      name: func.name,
      label: func.name,
      description: func.description ?? "",
      parameters: func.parameters as any,
      execute: async (
        toolCallId,
        params,
        _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
        _ctx,
        _signal,
      ): Promise<AgentToolResult<unknown>> => {
        // Notify handler that a client tool was called
        if (onClientToolCall) {
          onClientToolCall(func.name, params as Record<string, unknown>);
        }
        // Return a pending result - the client will execute this tool
        return jsonResult({
          status: "pending",
          tool: func.name,
          message: "Tool execution delegated to client",
        });
      },
    } satisfies ToolDefinition;
  });
}
