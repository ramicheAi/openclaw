import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { onDiagnosticEvent, type DiagnosticEventPayload } from "./diagnostic-events.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const METRICS_DIR = path.join(os.homedir(), ".openclaw", "metrics");
const INVOCATIONS_FILE = path.join(METRICS_DIR, "skill-invocations.jsonl");
const WEIGHTS_FILE = path.join(METRICS_DIR, "skill-routing-weights.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillInvocationRecord = {
  ts: number;
  sessionKey?: string;
  channel?: string;
  skillName: string;
  /** How the skill was invoked: user command, model selection, or auto-route. */
  source: "user" | "model" | "auto";
  /** Whether the invocation succeeded (skill loaded and produced output). */
  success: boolean;
  /** Duration of skill execution in milliseconds. */
  durationMs?: number;
  /** Operator feedback: +1 = positive (no correction), -1 = correction/re-route, 0 = neutral. */
  feedback: 1 | 0 | -1;
  /** If the operator re-routed, which skill they switched to. */
  correctedTo?: string;
  /** Keywords or context that triggered the selection. */
  triggerContext?: string;
};

export type SkillRoutingWeight = {
  skillName: string;
  /** Weighted score boost/penalty applied during routing. Range: [-0.5, 0.5]. */
  weight: number;
  /** Success rate from invocation history. */
  successRate: number;
  /** Number of recorded invocations for this skill. */
  sampleSize: number;
  /** Positive feedback count. */
  positiveCount: number;
  /** Negative feedback (corrections) count. */
  negativeCount: number;
  /** Last time this weight was recalculated. */
  lastUpdated: number;
};

export type LearnedRoutingWeights = Record<string, SkillRoutingWeight>;

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/** In-memory cache of routing weights, loaded from disk on init. */
let weightsCache: LearnedRoutingWeights = {};

/** Tracks the last skill invoked per session, so we can detect corrections. */
const lastSkillPerSession = new Map<string, { skillName: string; ts: number }>();

/** Whether we've subscribed to the diagnostic event bus. */
let subscribed = false;

/** Minimum sample size before a weight is applied to routing. */
const MIN_SAMPLE_SIZE = 5;

/** Maximum number of invocation records to keep (FIFO trimming). */
const MAX_INVOCATIONS = 10_000;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function ensureMetricsDir(): void {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
}

function appendInvocation(record: SkillInvocationRecord): void {
  try {
    ensureMetricsDir();
    fs.appendFileSync(INVOCATIONS_FILE, `${JSON.stringify(record)}\n`);
  } catch {
    // Best-effort — never crash on metrics I/O.
  }
}

function loadInvocations(): SkillInvocationRecord[] {
  try {
    if (!fs.existsSync(INVOCATIONS_FILE)) return [];
    const lines = fs.readFileSync(INVOCATIONS_FILE, "utf-8").split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as SkillInvocationRecord);
  } catch {
    return [];
  }
}

function saveWeights(weights: LearnedRoutingWeights): void {
  try {
    ensureMetricsDir();
    fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(weights, null, 2));
  } catch {
    // Best-effort.
  }
}

function loadWeights(): LearnedRoutingWeights {
  try {
    if (!fs.existsSync(WEIGHTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(WEIGHTS_FILE, "utf-8")) as LearnedRoutingWeights;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Weight calculation
// ---------------------------------------------------------------------------

function recalculateWeights(invocations: SkillInvocationRecord[]): LearnedRoutingWeights {
  const bySkill = new Map<string, SkillInvocationRecord[]>();
  for (const inv of invocations) {
    const arr = bySkill.get(inv.skillName) ?? [];
    arr.push(inv);
    bySkill.set(inv.skillName, arr);
  }

  const weights: LearnedRoutingWeights = {};
  const now = Date.now();

  for (const [skillName, records] of bySkill) {
    const sampleSize = records.length;
    const successCount = records.filter((r) => r.success).length;
    const successRate = sampleSize > 0 ? successCount / sampleSize : 0;
    const positiveCount = records.filter((r) => r.feedback === 1).length;
    const negativeCount = records.filter((r) => r.feedback === -1).length;

    // Weight formula:
    // - Base: success rate normalized to [-0.25, 0.25]
    // - Feedback: net positive/negative normalized to [-0.25, 0.25]
    // - Clamp total to [-0.5, 0.5]
    const successComponent = (successRate - 0.5) * 0.5; // maps 0..1 → -0.25..0.25
    const feedbackNet = positiveCount - negativeCount;
    const feedbackComponent =
      sampleSize > 0 ? Math.max(-0.25, Math.min(0.25, (feedbackNet / sampleSize) * 0.25)) : 0;
    const weight = Math.max(-0.5, Math.min(0.5, successComponent + feedbackComponent));

    weights[skillName] = {
      skillName,
      weight,
      successRate,
      sampleSize,
      positiveCount,
      negativeCount,
      lastUpdated: now,
    };
  }

  return weights;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a skill invocation. Call this after a skill is selected and executed.
 */
export function recordSkillInvocation(record: SkillInvocationRecord): void {
  // Lazy-init: load cached weights on first invocation
  if (!subscribed) enableSkillLearnedRules();

  appendInvocation(record);

  // Track for correction detection
  if (record.sessionKey) {
    lastSkillPerSession.set(record.sessionKey, {
      skillName: record.skillName,
      ts: record.ts,
    });
  }

  // Recalculate weights periodically (every 10 invocations)
  const invocations = loadInvocations();
  if (invocations.length % 10 === 0) {
    weightsCache = recalculateWeights(invocations);
    saveWeights(weightsCache);
  }
}

/**
 * Record that the operator corrected a skill selection (e.g., used a different
 * skill immediately after the first one was invoked).
 */
export function recordSkillCorrection(
  sessionKey: string,
  correctedFrom: string,
  correctedTo: string,
): void {
  const correction: SkillInvocationRecord = {
    ts: Date.now(),
    sessionKey,
    skillName: correctedFrom,
    source: "auto",
    success: false,
    feedback: -1,
    correctedTo,
  };
  appendInvocation(correction);
}

/**
 * Get the routing weight for a specific skill. Returns 0 if no data.
 */
export function getSkillWeight(skillName: string): number {
  const entry = weightsCache[skillName];
  if (!entry || entry.sampleSize < MIN_SAMPLE_SIZE) return 0;
  return entry.weight;
}

/**
 * Get all routing weights (for inspection/debugging).
 */
export function getAllWeights(): LearnedRoutingWeights {
  return { ...weightsCache };
}

/**
 * Detect if the current skill invocation is a correction of the previous one
 * in the same session (invoked within 30s of the last skill).
 */
export function detectCorrection(
  sessionKey: string,
  currentSkillName: string,
): { isCorrection: boolean; previousSkill?: string } {
  const last = lastSkillPerSession.get(sessionKey);
  if (!last) return { isCorrection: false };
  if (last.skillName === currentSkillName) return { isCorrection: false };
  const elapsed = Date.now() - last.ts;
  if (elapsed > 30_000) return { isCorrection: false };
  return { isCorrection: true, previousSkill: last.skillName };
}

/**
 * Trim the invocations file if it exceeds MAX_INVOCATIONS.
 */
export function trimInvocationsIfNeeded(): void {
  try {
    const invocations = loadInvocations();
    if (invocations.length <= MAX_INVOCATIONS) return;
    const trimmed = invocations.slice(-MAX_INVOCATIONS);
    ensureMetricsDir();
    fs.writeFileSync(INVOCATIONS_FILE, trimmed.map((r) => JSON.stringify(r)).join("\n") + "\n");
  } catch {
    // Best-effort.
  }
}

/**
 * Force recalculate and persist weights from the full invocation history.
 */
export function rebuildWeights(): LearnedRoutingWeights {
  const invocations = loadInvocations();
  weightsCache = recalculateWeights(invocations);
  saveWeights(weightsCache);
  return weightsCache;
}

/**
 * Initialize the learned rules system: load cached weights and subscribe to events.
 * Safe to call multiple times — only subscribes once.
 */
export function enableSkillLearnedRules(): void {
  if (subscribed) return;
  subscribed = true;

  // Load cached weights from disk
  weightsCache = loadWeights();

  // Subscribe to turn events to detect session patterns
  onDiagnosticEvent((evt: DiagnosticEventPayload) => {
    if (evt.type === "turn.completed" && evt.sessionKey) {
      // Trim invocation history on process heartbeat
      trimInvocationsIfNeeded();
    }
  });
}
