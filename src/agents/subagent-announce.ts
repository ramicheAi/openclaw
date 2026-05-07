import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "../config/config.js";
import {
  loadSessionStore,
  resolveAgentIdFromSessionKey,
  resolveMainSessionKey,
  resolveStorePath,
} from "../config/sessions.js";
import { normalizeMainKey } from "../routing/session-key.js";
import { resolveQueueSettings } from "../auto-reply/reply/queue.js";
import { callGateway } from "../gateway/call.js";
import { retryAsync } from "../infra/retry.js";
import { defaultRuntime } from "../runtime.js";
import {
  type DeliveryContext,
  deliveryContextFromSession,
  mergeDeliveryContext,
  normalizeDeliveryContext,
} from "../utils/delivery-context.js";
import { isEmbeddedPiRunActive, queueEmbeddedPiMessage } from "./pi-embedded.js";
import { type AnnounceQueueItem, enqueueAnnounce } from "./subagent-announce-queue.js";
import { readLatestAssistantReply } from "./tools/agent-step.js";
import { notifySubscription } from "./tools/subscribe-tool.js";

function formatDurationShort(valueMs?: number) {
  if (!valueMs || !Number.isFinite(valueMs) || valueMs <= 0) return undefined;
  const totalSeconds = Math.round(valueMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

function formatTokenCount(value?: number) {
  if (!value || !Number.isFinite(value)) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

function formatUsd(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function resolveModelCost(params: {
  provider?: string;
  model?: string;
  config: ReturnType<typeof loadConfig>;
}):
  | {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    }
  | undefined {
  const provider = params.provider?.trim();
  const model = params.model?.trim();
  if (!provider || !model) return undefined;
  const models = params.config.models?.providers?.[provider]?.models ?? [];
  const entry = models.find((candidate) => candidate.id === model);
  return entry?.cost;
}

async function waitForSessionUsage(params: { sessionKey: string }) {
  const cfg = loadConfig();
  const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
  const storePath = resolveStorePath(cfg.session?.store, { agentId });
  let entry = loadSessionStore(storePath)[params.sessionKey];
  if (!entry) return { entry, storePath };
  const hasTokens = () =>
    entry &&
    (typeof entry.totalTokens === "number" ||
      typeof entry.inputTokens === "number" ||
      typeof entry.outputTokens === "number");
  if (hasTokens()) return { entry, storePath };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    entry = loadSessionStore(storePath)[params.sessionKey];
    if (hasTokens()) break;
  }
  return { entry, storePath };
}

type DeliveryContextSource = Parameters<typeof deliveryContextFromSession>[0];

function resolveAnnounceOrigin(
  entry?: DeliveryContextSource,
  requesterOrigin?: DeliveryContext,
): DeliveryContext | undefined {
  return mergeDeliveryContext(deliveryContextFromSession(entry), requesterOrigin);
}

async function sendAnnounce(item: AnnounceQueueItem) {
  const origin = item.origin;
  const threadId =
    origin?.threadId != null && origin.threadId !== "" ? String(origin.threadId) : undefined;
  await callGateway({
    method: "agent",
    params: {
      sessionKey: item.sessionKey,
      message: item.prompt,
      channel: origin?.channel,
      accountId: origin?.accountId,
      to: origin?.to,
      threadId,
      deliver: true,
      idempotencyKey: crypto.randomUUID(),
    },
    expectFinal: true,
    timeoutMs: 60_000,
  });
}

function resolveRequesterStoreKey(
  cfg: ReturnType<typeof loadConfig>,
  requesterSessionKey: string,
): string {
  const raw = requesterSessionKey.trim();
  if (!raw) return raw;
  if (raw === "global" || raw === "unknown") return raw;
  if (raw.startsWith("agent:")) return raw;
  const mainKey = normalizeMainKey(cfg.session?.mainKey);
  if (raw === "main" || raw === mainKey) {
    return resolveMainSessionKey(cfg);
  }
  const agentId = resolveAgentIdFromSessionKey(raw);
  return `agent:${agentId}:${raw}`;
}

function loadRequesterSessionEntry(requesterSessionKey: string) {
  const cfg = loadConfig();
  const canonicalKey = resolveRequesterStoreKey(cfg, requesterSessionKey);
  const agentId = resolveAgentIdFromSessionKey(canonicalKey);
  const storePath = resolveStorePath(cfg.session?.store, { agentId });
  const store = loadSessionStore(storePath);
  const entry = store[canonicalKey];
  return { cfg, entry, canonicalKey };
}

async function maybeQueueSubagentAnnounce(params: {
  requesterSessionKey: string;
  triggerMessage: string;
  summaryLine?: string;
  requesterOrigin?: DeliveryContext;
}): Promise<"steered" | "queued" | "none"> {
  const { cfg, entry } = loadRequesterSessionEntry(params.requesterSessionKey);
  const canonicalKey = resolveRequesterStoreKey(cfg, params.requesterSessionKey);
  const sessionId = entry?.sessionId;
  if (!sessionId) return "none";

  const queueSettings = resolveQueueSettings({
    cfg,
    channel: entry?.channel ?? entry?.lastChannel,
    sessionEntry: entry,
  });
  const isActive = isEmbeddedPiRunActive(sessionId);

  const shouldSteer = queueSettings.mode === "steer" || queueSettings.mode === "steer-backlog";
  if (shouldSteer) {
    const steered = queueEmbeddedPiMessage(sessionId, params.triggerMessage);
    if (steered) return "steered";
  }

  const shouldFollowup =
    queueSettings.mode === "followup" ||
    queueSettings.mode === "collect" ||
    queueSettings.mode === "steer-backlog" ||
    queueSettings.mode === "interrupt";
  if (isActive && (shouldFollowup || queueSettings.mode === "steer")) {
    const origin = resolveAnnounceOrigin(entry, params.requesterOrigin);
    enqueueAnnounce({
      key: canonicalKey,
      item: {
        prompt: params.triggerMessage,
        summaryLine: params.summaryLine,
        enqueuedAt: Date.now(),
        sessionKey: canonicalKey,
        origin,
      },
      settings: queueSettings,
      send: sendAnnounce,
    });
    return "queued";
  }

  return "none";
}

async function buildSubagentStatsLine(params: {
  sessionKey: string;
  startedAt?: number;
  endedAt?: number;
}) {
  const cfg = loadConfig();
  const { entry, storePath } = await waitForSessionUsage({
    sessionKey: params.sessionKey,
  });

  const sessionId = entry?.sessionId;
  const transcriptPath =
    sessionId && storePath ? path.join(path.dirname(storePath), `${sessionId}.jsonl`) : undefined;

  const input = entry?.inputTokens;
  const output = entry?.outputTokens;
  const total =
    entry?.totalTokens ??
    (typeof input === "number" && typeof output === "number" ? input + output : undefined);
  const runtimeMs =
    typeof params.startedAt === "number" && typeof params.endedAt === "number"
      ? Math.max(0, params.endedAt - params.startedAt)
      : undefined;

  const provider = entry?.modelProvider;
  const model = entry?.model;
  const costConfig = resolveModelCost({ provider, model, config: cfg });
  const cost =
    costConfig && typeof input === "number" && typeof output === "number"
      ? (input * costConfig.input + output * costConfig.output) / 1_000_000
      : undefined;

  const parts: string[] = [];
  const runtime = formatDurationShort(runtimeMs);
  parts.push(`runtime ${runtime ?? "n/a"}`);
  if (typeof total === "number") {
    const inputText = typeof input === "number" ? formatTokenCount(input) : "n/a";
    const outputText = typeof output === "number" ? formatTokenCount(output) : "n/a";
    const totalText = formatTokenCount(total);
    parts.push(`tokens ${totalText} (in ${inputText} / out ${outputText})`);
  } else {
    parts.push("tokens n/a");
  }
  const costText = formatUsd(cost);
  if (costText) parts.push(`est ${costText}`);
  parts.push(`sessionKey ${params.sessionKey}`);
  if (sessionId) parts.push(`sessionId ${sessionId}`);
  if (transcriptPath) parts.push(`transcript ${transcriptPath}`);

  return `Stats: ${parts.join(" \u2022 ")}`;
}

export function buildSubagentSystemPrompt(params: {
  requesterSessionKey?: string;
  requesterOrigin?: DeliveryContext;
  childSessionKey: string;
  label?: string;
  task?: string;
}) {
  const taskText =
    typeof params.task === "string" && params.task.trim()
      ? params.task.replace(/\s+/g, " ").trim()
      : "{{TASK_DESCRIPTION}}";
  const lines = [
    "# Subagent Context",
    "",
    "You are a **subagent** spawned by the main agent for a specific task.",
    "",
    "## Your Role",
    `- You were created to handle: ${taskText}`,
    "- Complete this task. That's your entire purpose.",
    "- You are NOT the main agent. Don't try to be.",
    "",
    "## Rules",
    "1. **Stay focused** - Do your assigned task, nothing else",
    "2. **Complete the task** - Your final message will be automatically reported to the main agent",
    "3. **Don't initiate** - No heartbeats, no proactive actions, no side quests",
    "4. **Be ephemeral** - You may be terminated after task completion. That's fine.",
    "",
    "## Output Format",
    "When complete, your final response should include:",
    "- What you accomplished or found",
    "- Any relevant details the main agent should know",
    "- Keep it concise but informative",
    "",
    "## What You DON'T Do",
    "- NO user conversations (that's main agent's job)",
    "- NO external messages (email, tweets, etc.) unless explicitly tasked",
    "- NO cron jobs or persistent state",
    "- NO pretending to be the main agent",
    "- NO using the `message` tool directly",
    "",
    "## Session Context",
    params.label ? `- Label: ${params.label}` : undefined,
    params.requesterSessionKey ? `- Requester session: ${params.requesterSessionKey}.` : undefined,
    params.requesterOrigin?.channel
      ? `- Requester channel: ${params.requesterOrigin.channel}.`
      : undefined,
    `- Your session: ${params.childSessionKey}.`,
    "",
  ].filter((line): line is string => line !== undefined);

  // Pattern #7: Auto-inject ULTRAPLAN agent prompt for planning subagents
  const isUltraplan =
    typeof params.label === "string" && params.label.toLowerCase().startsWith("ultraplan");
  if (isUltraplan) {
    const ultraplanPromptPath = path.join(
      process.env.HOME ?? "/Users/admin",
      ".openclaw/workspace/skills/ultraplan/ultraplan-agent-prompt.md",
    );
    try {
      const promptContent = fs.readFileSync(ultraplanPromptPath, "utf-8");
      lines.push("", "---", "", promptContent.trim(), "");
    } catch {
      // Skill file missing — fall back to inline planning instructions
      lines.push(
        "",
        "---",
        "",
        "## ULTRAPLAN Mode",
        "You are a dedicated planning agent. Produce a comprehensive, actionable implementation plan.",
        "Research the codebase first. Every task must be atomic (2-5 min). Include exact file paths and code snippets.",
        "Save the plan to docs/superpowers/plans/ in the project directory.",
        "",
      );
    }
  }

  return lines.join("\n");
}

export type SubagentRunOutcome = {
  status: "ok" | "error" | "timeout" | "unknown";
  error?: string;
};

/**
 * Verify deliverable gate — runs verify-deliverable.sh on any file paths
 * found in the subagent reply. If a referenced output file is missing/invalid,
 * appends a warning to the announce message so the main agent knows the
 * deliverable was NOT actually produced.
 *
 * Returns a warning string (empty if everything verified or no paths detected).
 */
function verifyDeliverableGate(reply: string | undefined, task?: string): string {
  if (!reply) return "";

  // Extract file paths from the reply (absolute paths common in subagent output)
  const pathMatches = reply.match(
    /(?:\/[\w./-]+\.(?:html|json|md|png|jpg|svg|css|ts|tsx|js|jsx|pdf))/g,
  );

  // Also extract paths from the original task description (catches cases where
  // subagent says "done" without re-stating the output path)
  const taskPathMatches = task
    ? task.match(/(?:\/[\w./-]+\.(?:html|json|md|png|jpg|svg|css|ts|tsx|js|jsx|pdf))/g)
    : null;

  const allPaths = new Set([...(pathMatches || []), ...(taskPathMatches || [])]);
  if (allPaths.size === 0) return "";

  const verifyScript = path.join(
    process.env.HOME ?? "/Users/admin",
    ".openclaw/workspace/scripts/verify-deliverable.sh",
  );

  // Only run if verify script exists
  if (!fs.existsSync(verifyScript)) return "";

  const failures: string[] = [];

  for (const filePath of allPaths) {
    // Determine format from extension
    const ext = path.extname(filePath).slice(1) || "any";
    try {
      execFileSync(verifyScript, [filePath, ext, "100"], {
        encoding: "utf-8",
        timeout: 5_000,
      });
    } catch (err: unknown) {
      // Exit code 1 = missing, 2 = invalid
      const msg =
        err instanceof Error ? (err as { stdout?: string }).stdout || err.message : String(err);
      failures.push(`${filePath}: ${msg.trim()}`);
    }
  }

  // Log verification result to audit JSONL
  const auditLog = path.join(
    process.env.HOME ?? "/Users/admin",
    ".openclaw/workspace/memory/subagent-audit.jsonl",
  );
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      gate: "announce_verify",
      paths_checked: [...allPaths],
      failures: failures.length,
      status: failures.length > 0 ? "announced_but_unverified" : "verified",
    });
    fs.appendFileSync(auditLog, entry + "\n");
  } catch {
    // Best-effort audit logging
  }

  if (failures.length === 0) return "";

  return [
    "",
    "⚠️ DELIVERABLE VERIFICATION FAILED:",
    ...failures.map((f) => `  - ${f}`),
    "",
    "The subagent claimed completion but output files are MISSING or INVALID.",
    "Do NOT report this as done to the operator. Rebuild in-session or retry.",
  ].join("\n");
}

export async function runSubagentAnnounceFlow(params: {
  childSessionKey: string;
  childRunId: string;
  requesterSessionKey: string;
  requesterOrigin?: DeliveryContext;
  requesterDisplayKey: string;
  task: string;
  timeoutMs: number;
  cleanup: "delete" | "keep";
  roundOneReply?: string;
  waitForCompletion?: boolean;
  startedAt?: number;
  endedAt?: number;
  label?: string;
  outcome?: SubagentRunOutcome;
}): Promise<boolean> {
  let didAnnounce = false;
  try {
    const requesterOrigin = normalizeDeliveryContext(params.requesterOrigin);
    let reply = params.roundOneReply;
    let outcome: SubagentRunOutcome | undefined = params.outcome;
    if (!reply && params.waitForCompletion !== false) {
      const waitMs = Math.min(params.timeoutMs, 60_000);
      const wait = (await callGateway({
        method: "agent.wait",
        params: {
          runId: params.childRunId,
          timeoutMs: waitMs,
        },
        timeoutMs: waitMs + 2000,
      })) as {
        status?: string;
        error?: string;
        startedAt?: number;
        endedAt?: number;
      };
      if (wait?.status === "timeout") {
        outcome = { status: "timeout" };
      } else if (wait?.status === "error") {
        outcome = { status: "error", error: wait.error };
      } else if (wait?.status === "ok") {
        outcome = { status: "ok" };
      }
      if (typeof wait?.startedAt === "number" && !params.startedAt) {
        params.startedAt = wait.startedAt;
      }
      if (typeof wait?.endedAt === "number" && !params.endedAt) {
        params.endedAt = wait.endedAt;
      }
      if (wait?.status === "timeout") {
        if (!outcome) outcome = { status: "timeout" };
      }
      reply = await readLatestAssistantReply({
        sessionKey: params.childSessionKey,
      });
    }

    if (!reply) {
      reply = await readLatestAssistantReply({
        sessionKey: params.childSessionKey,
      });
    }

    if (!outcome) outcome = { status: "unknown" };

    // Pattern #10: fire subscription notifications for this subagent
    notifySubscription(
      params.childSessionKey,
      `${outcome.status === "ok" ? "completed" : outcome.status} — ${(reply || "(no output)").slice(0, 200)}`,
    );

    // Build stats
    const statsLine = await buildSubagentStatsLine({
      sessionKey: params.childSessionKey,
      startedAt: params.startedAt,
      endedAt: params.endedAt,
    });

    // Build status label
    const statusLabel =
      outcome.status === "ok"
        ? "completed successfully"
        : outcome.status === "timeout"
          ? "timed out"
          : outcome.status === "error"
            ? `failed: ${outcome.error || "unknown error"}`
            : "finished with unknown status";

    // Build instructional message for main agent
    const taskLabel = params.label || params.task || "background task";

    // Layer 1: Gateway-level deliverable verification gate
    const deliverableWarning = verifyDeliverableGate(reply, params.task);

    const triggerMessage = [
      `A background task "${taskLabel}" just ${statusLabel}.`,
      "",
      "Findings:",
      reply || "(no output)",
      deliverableWarning,
      "",
      statsLine,
      "",
      deliverableWarning
        ? "IMPORTANT: The deliverable files referenced above FAILED verification. Do NOT tell the operator this task succeeded. Report the failure and offer to rebuild."
        : "Summarize this naturally for the user. Keep it brief (1-2 sentences). Flow it into the conversation naturally.",
      "Do not mention technical details like tokens, stats, or that this was a background task.",
      "You can respond with NO_REPLY if no announcement is needed (e.g., internal task with no user-facing result).",
    ].join("\n");

    const queued = await maybeQueueSubagentAnnounce({
      requesterSessionKey: params.requesterSessionKey,
      triggerMessage,
      summaryLine: taskLabel,
      requesterOrigin,
    });
    if (queued === "steered") {
      didAnnounce = true;
      return true;
    }
    if (queued === "queued") {
      didAnnounce = true;
      return true;
    }

    // Send to main agent - it will respond in its own voice
    let directOrigin = requesterOrigin;
    if (!directOrigin) {
      const { entry } = loadRequesterSessionEntry(params.requesterSessionKey);
      directOrigin = deliveryContextFromSession(entry);
    }
    await retryAsync(
      () =>
        callGateway({
          method: "agent",
          params: {
            sessionKey: params.requesterSessionKey,
            message: triggerMessage,
            deliver: true,
            channel: directOrigin?.channel,
            accountId: directOrigin?.accountId,
            to: directOrigin?.to,
            threadId:
              directOrigin?.threadId != null && directOrigin.threadId !== ""
                ? String(directOrigin.threadId)
                : undefined,
            idempotencyKey: crypto.randomUUID(),
          },
          expectFinal: true,
          timeoutMs: 60_000,
        }),
      {
        attempts: 3,
        minDelayMs: 1_000,
        maxDelayMs: 10_000,
        jitter: 0.3,
        label: `announce-${params.childSessionKey}`,
        shouldRetry: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          return (
            msg.includes("timeout") || msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET")
          );
        },
      },
    );

    didAnnounce = true;
  } catch (err) {
    defaultRuntime.error?.(`Subagent announce failed: ${String(err)}`);
    // Best-effort follow-ups; ignore failures to avoid breaking the caller response.
  } finally {
    // Patch label after all writes complete
    if (params.label) {
      try {
        await callGateway({
          method: "sessions.patch",
          params: { key: params.childSessionKey, label: params.label },
          timeoutMs: 10_000,
        });
      } catch {
        // Best-effort
      }
    }
    if (params.cleanup === "delete") {
      try {
        await callGateway({
          method: "sessions.delete",
          params: { key: params.childSessionKey, deleteTranscript: true },
          timeoutMs: 10_000,
        });
      } catch {
        // ignore
      }
    }
  }
  return didAnnounce;
}
