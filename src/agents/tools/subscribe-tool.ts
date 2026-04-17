import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";

import { enqueueSystemEvent } from "../../infra/system-events.js";
import { requestHeartbeatNow } from "../../infra/heartbeat-wake.js";
import { logInfo, logWarn } from "../../logger.js";
import { getSession, listRunningSessions, listFinishedSessions } from "../bash-process-registry.js";

// ---------------------------------------------------------------------------
// Subscription registry (in-memory, ephemeral per gateway lifecycle)
// ---------------------------------------------------------------------------

export type Subscription = {
  id: string;
  sessionKey: string;
  targetType: "exec" | "subagent" | "custom";
  targetId: string;
  label?: string;
  createdAt: number;
  notified: boolean;
};

const subscriptions = new Map<string, Subscription>();
let nextId = 1;

function generateSubId(): string {
  return `sub_${nextId++}`;
}

/** Check all subscriptions and fire notifications for completed targets. */
export function tickSubscriptions(): void {
  for (const [id, sub] of subscriptions) {
    if (sub.notified) continue;

    if (sub.targetType === "exec") {
      // Check if the background exec session has exited
      const running = getSession(sub.targetId);
      if (running && running.exited) {
        const status = running.exitCode === 0 ? "completed" : "failed";
        const exitLabel = running.exitSignal
          ? `signal ${running.exitSignal}`
          : `code ${running.exitCode ?? 0}`;
        sub.notified = true;
        const label = sub.label || sub.targetId.slice(0, 8);
        enqueueSystemEvent(`[subscribe] "${label}" ${status} (${exitLabel})`, {
          sessionKey: sub.sessionKey,
        });
        requestHeartbeatNow({ reason: `subscribe:${id}:exec-exit` });
        logInfo(`Subscription ${id} fired: exec ${sub.targetId} ${status}`);
        continue;
      }
      // Also check finished sessions
      const finished = listFinishedSessions();
      const match = finished.find((s) => s.id === sub.targetId);
      if (match) {
        sub.notified = true;
        const label = sub.label || sub.targetId.slice(0, 8);
        enqueueSystemEvent(`[subscribe] "${label}" ${match.status} (code ${match.exitCode ?? 0})`, {
          sessionKey: sub.sessionKey,
        });
        requestHeartbeatNow({ reason: `subscribe:${id}:exec-finished` });
        logInfo(`Subscription ${id} fired: exec ${sub.targetId} ${match.status}`);
      }
    }
    // subagent and custom types are notified externally via notifySubscription()
  }
}

/** External callers (subagent-announce, custom hooks) can fire a subscription. */
export function notifySubscription(targetId: string, message: string): boolean {
  let fired = false;
  for (const [_id, sub] of subscriptions) {
    if (sub.notified) continue;
    if (sub.targetId === targetId) {
      sub.notified = true;
      enqueueSystemEvent(`[subscribe] "${sub.label || targetId}": ${message}`, {
        sessionKey: sub.sessionKey,
      });
      requestHeartbeatNow({ reason: `subscribe:${_id}:notify` });
      fired = true;
    }
  }
  return fired;
}

/** Clean up old/notified subscriptions (call periodically). */
export function pruneSubscriptions(maxAgeMs = 3_600_000): void {
  const now = Date.now();
  for (const [id, sub] of subscriptions) {
    if (sub.notified || now - sub.createdAt > maxAgeMs) {
      subscriptions.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const subscribeSchema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("subscribe"),
      Type.Literal("list"),
      Type.Literal("unsubscribe"),
      Type.Literal("check"),
    ],
    { description: "Action to perform" },
  ),
  target_type: Type.Optional(
    Type.Union([Type.Literal("exec"), Type.Literal("subagent"), Type.Literal("custom")], {
      description: "Type of target to subscribe to",
    }),
  ),
  target_id: Type.Optional(
    Type.String({
      description: "ID of the target (exec session id, subagent session key, or custom key)",
    }),
  ),
  label: Type.Optional(Type.String({ description: "Human-readable label for the notification" })),
  subscription_id: Type.Optional(
    Type.String({ description: "Subscription ID for unsubscribe action" }),
  ),
});

export function createSubscribeTool(opts?: {
  agentSessionKey?: string;
  // biome-ignore lint/suspicious/noExplicitAny: TypeBox schema type compatibility
}): AgentTool<any> {
  return {
    name: "subscribe",
    label: "subscribe",
    description:
      "Subscribe to long-running operations (background exec, subagent runs, builds) and receive push notifications when they complete. Use 'subscribe' to watch, 'list' to see active subscriptions, 'check' to poll, 'unsubscribe' to remove.",
    parameters: subscribeSchema,
    execute: async (_toolCallId, args) => {
      const params = args as {
        action: "subscribe" | "list" | "unsubscribe" | "check";
        target_type?: "exec" | "subagent" | "custom";
        target_id?: string;
        label?: string;
        subscription_id?: string;
      };

      const sessionKey = opts?.agentSessionKey ?? "main";

      switch (params.action) {
        case "subscribe": {
          if (!params.target_type || !params.target_id) {
            return { output: "Error: target_type and target_id are required for subscribe." };
          }
          const id = generateSubId();
          const sub: Subscription = {
            id,
            sessionKey,
            targetType: params.target_type,
            targetId: params.target_id,
            label: params.label,
            createdAt: Date.now(),
            notified: false,
          };
          subscriptions.set(id, sub);
          logInfo(`Subscription created: ${id} → ${params.target_type}:${params.target_id}`);

          // Immediately check if already completed
          tickSubscriptions();
          if (sub.notified) {
            return { output: `Subscribed (${id}) — already completed, notification sent.` };
          }
          return {
            output: `Subscribed (${id}). You'll be notified when "${params.label || params.target_id}" completes.`,
          };
        }

        case "list": {
          const active = [...subscriptions.values()].filter((s) => s.sessionKey === sessionKey);
          if (active.length === 0) {
            return { output: "No active subscriptions." };
          }
          const lines = active.map(
            (s) =>
              `${s.id}: ${s.targetType}:${s.targetId} ${s.notified ? "(notified)" : "(waiting)"} ${s.label ? `"${s.label}"` : ""}`,
          );
          return { output: lines.join("\n") };
        }

        case "unsubscribe": {
          const subId = params.subscription_id;
          if (!subId) {
            return { output: "Error: subscription_id is required for unsubscribe." };
          }
          const deleted = subscriptions.delete(subId);
          return {
            output: deleted ? `Unsubscribed ${subId}.` : `Subscription ${subId} not found.`,
          };
        }

        case "check": {
          // Force a tick and report
          tickSubscriptions();
          pruneSubscriptions();
          const active = [...subscriptions.values()].filter(
            (s) => s.sessionKey === sessionKey && !s.notified,
          );
          if (active.length === 0) {
            return { output: "All subscriptions completed or no active subscriptions." };
          }
          const lines = active.map(
            (s) =>
              `${s.id}: ${s.targetType}:${s.targetId} (still running) ${s.label ? `"${s.label}"` : ""}`,
          );
          return { output: `${active.length} active:\n${lines.join("\n")}` };
        }

        default:
          return {
            output: `Unknown action: ${params.action}. Use subscribe, list, check, or unsubscribe.`,
          };
      }
    },
  };
}
