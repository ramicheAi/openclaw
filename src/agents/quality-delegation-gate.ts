/**
 * Quality & Delegation Gate (QDP) — pure classification + policy primitive.
 *
 * Background: the orchestrator ("Atlas") historically shipped client-facing
 * deliverables alone, fast, and off-brand because delegation was discretionary
 * and the only quality check (verifyDeliverableGate) merely confirmed a file
 * existed. This module encodes the RAMICHE Quality & Delegation Protocol as a
 * deterministic, testable function: classify a deliverable, infer its stakes,
 * look up who MUST be involved, run a definition-of-done check, and return a
 * verdict. It is intentionally dependency-free (no fs/config/network) so it can
 * be unit-tested and reused on both the OpenClaw runtime path and the web path.
 *
 * It does not itself block execution — callers decide how to act on the verdict
 * (the subagent announce flow surfaces it to the orchestrator with a directive).
 */

export type DeliverableClass =
  | "client-facing-creative"
  | "code"
  | "internal-analysis"
  | "external-comms"
  | "ops-automation"
  | "unknown";

/** S0 scratch · S1 internal decision · S2 client/revenue-facing · S3 legal/financial/safety */
export type StakesTier = "S0" | "S1" | "S2" | "S3";

export type Verdict = "pass" | "review" | "block";

export interface RaciRule {
  /** Agent that should produce the work. */
  responsible: string;
  /** Agents that must contribute (domain/brand/data). */
  contributors: string[];
  /** Independent reviewer/critic before ship. */
  reviewer: string;
}

export interface GateResult {
  deliverableClass: DeliverableClass;
  stakes: StakesTier;
  raci: RaciRule | null;
  /** Definition-of-done signals that failed (empty = DoD checks passed). */
  dodFailures: string[];
  verdict: Verdict;
  reasons: string[];
}

const CREATIVE_HINTS =
  /\b(pitch|deck|slide|brochure|flyer|one[- ]?pager|landing page|hero|poster|cover art|logo|brand|mockup|mood ?board|graphic|banner|ad creative|presentation)\b/i;
const CODE_HINTS =
  /\b(refactor|implement|bug ?fix|feature|endpoint|api|component|migration|patch|build|deploy|unit test|compile|typescript|react|function)\b/i;
const COMMS_HINTS =
  /\b(email|outreach|cold (?:email|dm)|tweet|post|newsletter|press release|sequence|reply to|message to (?:client|customer|lead))\b/i;
const OPS_HINTS = /\b(cron|schedule|automation|pipeline|sync|backup|index|monitor|heartbeat)\b/i;
const ANALYSIS_HINTS =
  /\b(analysis|forecast|model|report|research|audit|valuation|pricing|scenario|benchmark|metrics)\b/i;

/** Classify a deliverable from the task description (and optionally its output). */
export function classifyDeliverable(task: string, reply?: string): DeliverableClass {
  const text = `${task ?? ""}\n${reply ?? ""}`;
  // Order matters: creative + comms are the high-risk, frequently-misrouted ones.
  if (CREATIVE_HINTS.test(text)) return "client-facing-creative";
  if (COMMS_HINTS.test(text)) return "external-comms";
  if (CODE_HINTS.test(text)) return "code";
  if (OPS_HINTS.test(text)) return "ops-automation";
  if (ANALYSIS_HINTS.test(text)) return "internal-analysis";
  return "unknown";
}

const STAKES_HINTS_S3 =
  /\b(legal|contract|compliance|lawsuit|tax|invoice|payment|refund|medical|safety|liability|patent|trademark)\b/i;
const STAKES_HINTS_S2 =
  /\b(client|customer|prospect|lead|pitch|deck|landing page|launch|public|production|brand|revenue|sale|deal|website|press)\b/i;
const STAKES_HINTS_S1 = /\b(decide|decision|plan|strategy|roadmap|recommend)\b/i;

/** Infer stakes tier from the task text. Conservative: creative/comms default to S2. */
export function inferStakes(task: string, deliverableClass?: DeliverableClass): StakesTier {
  const text = task ?? "";
  if (STAKES_HINTS_S3.test(text)) return "S3";
  if (STAKES_HINTS_S2.test(text)) return "S2";
  // Anything that reaches a human outside the team is at least S2 by default.
  if (deliverableClass === "client-facing-creative" || deliverableClass === "external-comms") {
    return "S2";
  }
  if (STAKES_HINTS_S1.test(text)) return "S1";
  return "S0";
}

/** RACI routing matrix (QDP-2). Atlas is Accountable but never sole Responsible at S2+. */
const RACI_MATRIX: Record<Exclude<DeliverableClass, "unknown">, RaciRule> = {
  "client-facing-creative": {
    responsible: "aetherion",
    contributors: ["vee", "ink"],
    reviewer: "vee",
  },
  "external-comms": { responsible: "ink", contributors: ["vee"], reviewer: "mercury" },
  code: { responsible: "shuri", contributors: ["proximon"], reviewer: "triage" },
  "internal-analysis": { responsible: "simons", contributors: [], reviewer: "dr-strange" },
  "ops-automation": { responsible: "shuri", contributors: [], reviewer: "triage" },
};

export function requiredSpecialists(deliverableClass: DeliverableClass): RaciRule | null {
  if (deliverableClass === "unknown") return null;
  return RACI_MATRIX[deliverableClass];
}

const PLACEHOLDER_PATTERN =
  /\b(lorem ipsum|tbd|todo|fixme|placeholder|\[insert[^\]]*\]|\bxxx\b|coming soon|sample text)\b/i;
const BRAND_ASSET_HINT =
  /\b(logo|brand kit|palette|brand guide|style guide|wordmark|#[0-9a-f]{6}|color token|on-brand)\b/i;

/**
 * Definition-of-Done checks (QDP-3). Returns the list of failed signals.
 * Pure text heuristics — they catch the cheapest, most common defects
 * (placeholders shipped to clients, creative with no brand reference).
 */
export function checkDefinitionOfDone(
  deliverableClass: DeliverableClass,
  text: string,
): string[] {
  const failures: string[] = [];
  const body = text ?? "";
  if (PLACEHOLDER_PATTERN.test(body)) {
    failures.push("contains placeholder/lorem/TODO text");
  }
  if (deliverableClass === "client-facing-creative" && !BRAND_ASSET_HINT.test(body)) {
    failures.push("client-facing creative with no brand-asset reference (logo/palette/brand kit)");
  }
  return failures;
}

export interface EvaluateInput {
  task: string;
  reply?: string;
  /** Short-id of the agent that produced the work, if known (e.g. "atlas"). */
  producer?: string;
}

/**
 * Evaluate a finished deliverable against QDP. Verdict:
 *  - block  : S2+ with a DoD failure, OR S2+ creative produced solo by the
 *             orchestrator (delegation skipped) → must rebuild, do not ship.
 *  - review : S2+ that passed DoD but still needs the independent reviewer.
 *  - pass   : low-stakes, or nothing actionable detected.
 */
export function evaluateDeliverable(input: EvaluateInput): GateResult {
  const deliverableClass = classifyDeliverable(input.task, input.reply);
  const stakes = inferStakes(input.task, deliverableClass);
  const raci = requiredSpecialists(deliverableClass);
  const dodFailures = checkDefinitionOfDone(deliverableClass, `${input.task}\n${input.reply ?? ""}`);
  const reasons: string[] = [];
  let verdict: Verdict = "pass";

  const highStakes = stakes === "S2" || stakes === "S3";

  if (highStakes && dodFailures.length > 0) {
    verdict = "block";
    reasons.push(`Definition-of-Done failed at ${stakes}: ${dodFailures.join("; ")}`);
  }

  // Delegation enforcement: a high-stakes creative deliverable produced solo by
  // the orchestrator is the exact failure mode this protocol exists to stop.
  const producer = input.producer?.toLowerCase().trim();
  if (
    highStakes &&
    deliverableClass === "client-facing-creative" &&
    raci &&
    producer &&
    producer === "atlas" &&
    producer !== raci.responsible
  ) {
    verdict = "block";
    reasons.push(
      `Delegation skipped: ${deliverableClass} at ${stakes} must be produced by @${raci.responsible} (+${raci.contributors.map((c) => `@${c}`).join(", ")}) and reviewed by @${raci.reviewer}, not by the orchestrator alone.`,
    );
  }

  if (verdict === "pass" && highStakes && raci) {
    verdict = "review";
    reasons.push(`Requires independent review by @${raci.reviewer} before reaching the operator.`);
  }

  return { deliverableClass, stakes, raci, dodFailures, verdict, reasons };
}

/** Render a directive block for the orchestrator. Empty when verdict is pass. */
export function formatGateNotice(result: GateResult): string {
  if (result.verdict === "pass") return "";
  const header =
    result.verdict === "block"
      ? "QUALITY & DELEGATION GATE — BLOCK (do NOT report this as done):"
      : "QUALITY & DELEGATION GATE — REVIEW REQUIRED:";
  const lines = [
    "",
    header,
    `  class=${result.deliverableClass} stakes=${result.stakes}`,
    ...result.reasons.map((r) => `  - ${r}`),
  ];
  if (result.verdict === "block") {
    lines.push("  Rebuild via the correct owner/reviewer before anything reaches the operator.");
  }
  return lines.join("\n");
}
