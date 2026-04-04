/**
 * Session quality metrics — edit persistence + retry rate tracking.
 *
 * Writes JSONL to ~/.openclaw/workspace/memory/metrics/session-quality.jsonl
 * Each line = one completed agent run with tool counts, edit counts, and retry info.
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const METRICS_DIR = join(process.env.HOME ?? "/tmp", ".openclaw/workspace/memory/metrics");
const METRICS_FILE = join(METRICS_DIR, "session-quality.jsonl");

export interface SessionQualityMetrics {
  timestamp: number;
  sessionKey: string;
  durationMs: number;
  toolCalls: number;
  toolErrors: number;
  editCalls: number;
  writeCalls: number;
  readCalls: number;
  execCalls: number;
  retryCount: number;
  compactionRetries: number;
  modelFallbacks: number;
  editPersistenceRate: number; // 0-100
  toolSuccessRate: number; // 0-100
  model?: string;
  provider?: string;
}

/**
 * Extract quality metrics from a completed run's tool metadata.
 */
export function extractQualityMetrics(params: {
  sessionKey: string;
  startedAt: number;
  toolMetas: Array<{ toolName: string; meta?: string }>;
  lastToolError?: { toolName: string; meta?: string; error?: string };
  retryCount?: number;
  compactionRetries?: number;
  modelFallbacks?: number;
  model?: string;
  provider?: string;
}): SessionQualityMetrics {
  const now = Date.now();
  const toolCalls = params.toolMetas.length;
  const editCalls = params.toolMetas.filter((t) => t.toolName === "edit").length;
  const writeCalls = params.toolMetas.filter((t) => t.toolName === "write").length;
  const readCalls = params.toolMetas.filter((t) => t.toolName === "read").length;
  const execCalls = params.toolMetas.filter((t) => t.toolName === "exec").length;
  const toolErrors = params.lastToolError ? 1 : 0;

  const totalEdits = editCalls + writeCalls;
  // Edit persistence: edits that didn't produce an error / total edits
  const editPersistenceRate =
    totalEdits > 0 ? Math.round(((totalEdits - toolErrors) / totalEdits) * 100) : 100;
  const toolSuccessRate =
    toolCalls > 0 ? Math.round(((toolCalls - toolErrors) / toolCalls) * 100) : 100;

  return {
    timestamp: now,
    sessionKey: params.sessionKey,
    durationMs: now - params.startedAt,
    toolCalls,
    toolErrors,
    editCalls,
    writeCalls,
    readCalls,
    execCalls,
    retryCount: params.retryCount ?? 0,
    compactionRetries: params.compactionRetries ?? 0,
    modelFallbacks: params.modelFallbacks ?? 0,
    editPersistenceRate,
    toolSuccessRate,
    model: params.model,
    provider: params.provider,
  };
}

/**
 * Persist quality metrics to JSONL file.
 */
export function persistQualityMetrics(metrics: SessionQualityMetrics): void {
  try {
    mkdirSync(METRICS_DIR, { recursive: true });
    appendFileSync(METRICS_FILE, JSON.stringify(metrics) + "\n");
  } catch {
    // Non-critical — don't break the session if metrics fail
  }
}
