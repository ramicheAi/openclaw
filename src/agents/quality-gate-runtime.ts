/**
 * Runtime glue for the Quality & Delegation Gate (QDP). Keeps the pure policy
 * (quality-delegation-gate.ts) free of fs/IO while giving both deliverable paths
 * — delegated subagent announces AND the main agent's own self-produced replies
 * — one shared way to (1) inspect the real artifact for evidence, (2) run the
 * gate, and (3) record the outcome for the QDP scorecard.
 */
import fs from "node:fs";
import path from "node:path";

import {
  type ArtifactEvidence,
  classifyDeliverable,
  evaluateDeliverable,
  formatGateNotice,
  type GateResult,
  inspectArtifactText,
} from "./quality-delegation-gate.js";

const ARTIFACT_PATH_PATTERN = /(?:\/[\w./-]+\.(?:html|json|md|css|ts|tsx|js|jsx|svg|txt))/g;

const AUDIT_LOG_PATH = path.join(
  process.env.HOME ?? "/Users/admin",
  ".openclaw/workspace/memory/subagent-audit.jsonl",
);

/**
 * Build ArtifactEvidence by inspecting the ACTUAL deliverable files referenced
 * in the reply/task — not the agent's chat reply. This closes the keyword-
 * stuffing hole: an agent cannot clear the brand check by writing "I used the
 * brand kit"; the produced file must carry the markers. Returns undefined when
 * no readable text artifact is found (e.g. binary pdf/png) so the gate treats
 * the brand/placeholder facts as unverified (verification owed), not passing.
 */
export function inspectDeliverableArtifacts(
  reply: string | undefined,
  task: string,
): ArtifactEvidence | undefined {
  const deliverableClass = classifyDeliverable(task, reply);
  const fromReply = reply ? reply.match(ARTIFACT_PATH_PATTERN) : null;
  const fromTask = task ? task.match(ARTIFACT_PATH_PATTERN) : null;
  const paths = [...new Set([...(fromReply ?? []), ...(fromTask ?? [])])].slice(0, 5);
  if (paths.length === 0) return undefined;

  let combined = "";
  let readAny = false;
  for (const filePath of paths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > 256 * 1024) continue;
      combined += `\n${fs.readFileSync(filePath, "utf-8")}`;
      readAny = true;
    } catch {
      // Unreadable file — leave its facts unverified.
    }
  }
  if (!readAny) return undefined;

  const signals = inspectArtifactText(deliverableClass, combined);
  return {
    placeholdersFound: signals.placeholdersFound,
    brandAssetsVerified: signals.brandAssetsVerified,
  };
}

export interface RuntimeGateOutput {
  result: GateResult;
  /** Orchestrator-facing directive; empty string when the verdict is pass. */
  notice: string;
}

/** Inspect the artifact, run the gate, and return the verdict + a directive. */
export function runQualityGate(params: {
  task: string;
  reply?: string;
  producer?: string;
}): RuntimeGateOutput {
  const evidence = inspectDeliverableArtifacts(params.reply, params.task);
  const result = evaluateDeliverable({
    task: params.task,
    reply: params.reply,
    producer: params.producer,
    evidence,
  });
  return { result, notice: formatGateNotice(result) };
}

/**
 * Append a QDP outcome to the audit log (QDP-6 scorecard input). Best-effort:
 * never throws, so it can never break delivery. Call only for non-pass verdicts
 * to keep the log signal-dense.
 */
export function recordGateOutcome(params: {
  result: GateResult;
  origin: "subagent" | "self";
  producer?: string;
}): void {
  try {
    const { result } = params;
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      gate: "qdp",
      origin: params.origin,
      producer: params.producer,
      deliverableClass: result.deliverableClass,
      stakes: result.stakes,
      verdict: result.verdict,
      evidenceMissing: result.evidenceMissing,
    });
    fs.appendFileSync(AUDIT_LOG_PATH, entry + "\n");
  } catch {
    // Best-effort audit logging.
  }
}
