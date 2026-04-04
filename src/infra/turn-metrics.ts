import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  onDiagnosticEvent,
  type DiagnosticEventPayload,
  type DiagnosticTurnCompletedEvent,
} from "./diagnostic-events.js";
import type { CostBudgetConfig } from "../config/types.base.js";

const METRICS_DIR = path.join(os.homedir(), ".openclaw", "metrics");
const TURNS_FILE = path.join(METRICS_DIR, "turns.jsonl");

/** In-memory cache of last turn timestamps per sessionKey, used to compute secondsSinceLastTurn. */
const lastTurnTs = new Map<string, number>();

/** In-memory per-session turn counter (1-based). Resets when the process restarts. */
const turnCounter = new Map<string, number>();

/** Threshold in seconds — turns arriving faster than this are flagged as rapid retries. */
const RAPID_RETRY_THRESHOLD_S = 15;

let subscribed = false;

function isTurnEvent(evt: DiagnosticEventPayload): evt is DiagnosticTurnCompletedEvent {
  return evt.type === "turn.completed";
}

function appendTurnLine(evt: DiagnosticTurnCompletedEvent): void {
  try {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
    const line = JSON.stringify({
      ts: evt.ts,
      sessionKey: evt.sessionKey,
      sessionId: evt.sessionId,
      channel: evt.channel,
      provider: evt.provider,
      model: evt.model,
      durationMs: evt.durationMs,
      inputTokens: evt.inputTokens,
      outputTokens: evt.outputTokens,
      totalTokens: evt.totalTokens,
      costUsd: evt.costUsd,
      isNewSession: evt.isNewSession,
      isHeartbeat: evt.isHeartbeat,
      compactionCount: evt.compactionCount,
      payloadCount: evt.payloadCount,
      secondsSinceLastTurn: evt.secondsSinceLastTurn,
      inputLengthChars: evt.inputLengthChars,
      outputLengthChars: evt.outputLengthChars,
      isRapidRetry: evt.isRapidRetry,
      turnIndex: evt.turnIndex,
    });
    fs.appendFileSync(TURNS_FILE, `${line}\n`);
  } catch {
    // Best-effort — never crash on metrics I/O.
  }
}

/**
 * Records the current timestamp for the given sessionKey and returns the elapsed
 * seconds since the previous turn (or undefined if this is the first observed turn).
 */
export function recordTurnTimestamp(sessionKey: string): number | undefined {
  const now = Date.now();
  const prev = lastTurnTs.get(sessionKey);
  lastTurnTs.set(sessionKey, now);
  if (prev == null) return undefined;
  return Math.round((now - prev) / 1000);
}

/**
 * Increments and returns the 1-based turn index for the given sessionKey.
 * Resets when the process restarts (in-memory only).
 */
export function recordTurnIndex(sessionKey: string): number {
  const next = (turnCounter.get(sessionKey) ?? 0) + 1;
  turnCounter.set(sessionKey, next);
  return next;
}

/**
 * Returns true when secondsSinceLastTurn is defined and within the rapid-retry threshold.
 */
export function computeIsRapidRetry(secondsSinceLastTurn: number | undefined): boolean {
  return secondsSinceLastTurn != null && secondsSinceLastTurn <= RAPID_RETRY_THRESHOLD_S;
}

/**
 * Subscribe to the diagnostic event bus and persist turn.completed events as JSONL.
 * Safe to call multiple times — only subscribes once.
 */
export function enableTurnMetrics(): void {
  if (subscribed) return;
  subscribed = true;
  onDiagnosticEvent((evt) => {
    if (isTurnEvent(evt)) appendTurnLine(evt);
  });
}

// ---------------------------------------------------------------------------
// Session cost accumulator + budget checks
// ---------------------------------------------------------------------------

/** In-memory accumulated cost (USD) per sessionKey. Resets when the process restarts. */
const sessionCostAccum = new Map<string, number>();

/** Calendar-day key used to partition daily cost tracking (YYYY-MM-DD in local time). */
function dailyKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** In-memory accumulated cost (USD) per calendar day. Resets when the process restarts. */
const dailyCostAccum = new Map<string, number>();

/**
 * Add `costUsd` to the running session and daily totals.
 * Returns the new session total so callers can compare against budget thresholds.
 */
export function accumulateSessionCost(sessionKey: string, costUsd: number): number {
  const prev = sessionCostAccum.get(sessionKey) ?? 0;
  const next = prev + costUsd;
  sessionCostAccum.set(sessionKey, next);

  const dk = dailyKey();
  const prevDay = dailyCostAccum.get(dk) ?? 0;
  dailyCostAccum.set(dk, prevDay + costUsd);

  return next;
}

/** Return the accumulated cost for the current calendar day. */
export function getDailyCostUsd(): number {
  return dailyCostAccum.get(dailyKey()) ?? 0;
}

/** Return the accumulated session cost for a given sessionKey. */
export function getSessionCostUsd(sessionKey: string): number {
  return sessionCostAccum.get(sessionKey) ?? 0;
}

export type BudgetCheckResult = {
  /** Whether the session hard-cap has been exceeded and the agent should stop. */
  exceeded: boolean;
  /** Whether the downgrade threshold has been reached and the model should switch. */
  shouldDowngrade: boolean;
  /** The economy model to switch to (only meaningful when shouldDowngrade is true). */
  downgradeModel?: string;
  /** Reason string suitable for diagnostic logging. */
  reason?: string;
};

/**
 * Evaluate the current session + daily spend against the configured budget.
 * Returns a verdict indicating whether the agent should stop or downgrade.
 */
export function checkBudget(
  sessionKey: string,
  budget: CostBudgetConfig | undefined,
): BudgetCheckResult {
  if (!budget) return { exceeded: false, shouldDowngrade: false };

  const sessionTotal = getSessionCostUsd(sessionKey);
  const dailyTotal = getDailyCostUsd();

  // Daily hard-cap takes priority.
  if (budget.dailyMaxUsd != null && dailyTotal >= budget.dailyMaxUsd) {
    return {
      exceeded: true,
      shouldDowngrade: false,
      reason: `daily cost $${dailyTotal.toFixed(4)} >= dailyMaxUsd $${budget.dailyMaxUsd}`,
    };
  }

  // Session hard-cap.
  if (budget.sessionMaxUsd != null && sessionTotal >= budget.sessionMaxUsd) {
    return {
      exceeded: true,
      shouldDowngrade: false,
      reason: `session cost $${sessionTotal.toFixed(4)} >= sessionMaxUsd $${budget.sessionMaxUsd}`,
    };
  }

  // Downgrade threshold.
  if (
    budget.downgradeAtUsd != null &&
    budget.economyModel &&
    sessionTotal >= budget.downgradeAtUsd
  ) {
    return {
      exceeded: false,
      shouldDowngrade: true,
      downgradeModel: budget.economyModel,
      reason: `session cost $${sessionTotal.toFixed(4)} >= downgradeAtUsd $${budget.downgradeAtUsd}`,
    };
  }

  return { exceeded: false, shouldDowngrade: false };
}

/** Reset session cost accumulator for the given key (e.g. on session reset). */
export function resetSessionCost(sessionKey: string): void {
  sessionCostAccum.delete(sessionKey);
}
