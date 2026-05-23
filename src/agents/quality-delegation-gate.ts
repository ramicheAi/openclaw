/**
 * Quality & Delegation Gate (QDP v2) — pure, evidence-driven quality primitive.
 *
 * Reframe from v1: the goal is QUALITY WITH THE RIGHT CONTEXT, not delegation
 * for its own sake. Delegation is one *means* to quality and carries real cost
 * (latency, coordination, handoff loss) and can be net-negative when it routes
 * to a weaker model. So this gate RECOMMENDS specialists but blocks on
 * quality/context, never on who produced the work.
 *
 * The hard rule that closes the keyword-stuffing hole: at S2+, claims in the
 * reply text NEVER satisfy the definition-of-done. Only inspected ARTIFACT
 * EVIDENCE can clear a high-stakes deliverable. Absent evidence, the strongest
 * verdict is "review" (verification owed) — never "pass". This is fail-safe:
 * the cheap path (say the right words) can no longer reach the operator/client.
 *
 * Pure + dependency-free (no fs/config/network). The caller supplies
 * ArtifactEvidence from a real inspector at the integration boundary, so the
 * policy stays unit-testable and honest about its trust boundary: a verdict is
 * only as strong as the evidence handed to it.
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
  /** Specialist recommended to produce the work (advisory — see EvaluateInput). */
  responsible: string;
  /** Specialists that should contribute (domain/brand/data). */
  contributors: string[];
  /** Independent reviewer/critic before ship. */
  reviewer: string;
}

/**
 * Facts established by inspecting the ACTUAL artifact (file/render), not the
 * agent's reply text. Every field is optional and tri-state on purpose:
 *  - `true`  → inspector confirmed the good state
 *  - `false` → inspector confirmed the bad state (a hard block at S2+)
 *  - `undefined` → not inspected ⇒ verification owed (cannot pass at S2+)
 */
export interface ArtifactEvidence {
  /** A real inspector confirmed the brand kit is actually used in the artifact. */
  brandAssetsVerified?: boolean;
  /** A real inspector found placeholder/lorem/TODO inside the artifact itself. */
  placeholdersFound?: boolean;
  /** An independent reviewer recorded an approve verdict on the artifact. */
  reviewerSignedOff?: boolean;
  /** Who reviewed — used to enforce that review is independent of the producer. */
  reviewedBy?: string;
  /** S3 requires a human in the loop; set true only when a human approved. */
  reviewedByHuman?: boolean;
}

export interface GateResult {
  deliverableClass: DeliverableClass;
  stakes: StakesTier;
  /** Recommended RACI routing (advisory). */
  raci: RaciRule | null;
  verdict: Verdict;
  reasons: string[];
  /** Evidence the gate needs but did not receive (drives "review"). */
  evidenceMissing: string[];
  /** Advisory routing nudge; null when production location is fine. */
  recommendation: string | null;
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

/**
 * Infer stakes tier. Scans the task AND the reply so an agent cannot dodge the
 * gate by framing a client deliverable as "internal" — if the produced output
 * shows external/brand markers, stakes are raised. Conservative by design:
 * creative/comms reach a human outside the team, so they default to S2.
 */
export function inferStakes(
  task: string,
  deliverableClass?: DeliverableClass,
  reply?: string,
): StakesTier {
  const text = `${task ?? ""}\n${reply ?? ""}`;
  if (STAKES_HINTS_S3.test(text)) return "S3";
  if (STAKES_HINTS_S2.test(text)) return "S2";
  if (deliverableClass === "client-facing-creative" || deliverableClass === "external-comms") {
    return "S2";
  }
  if (STAKES_HINTS_S1.test(text)) return "S1";
  return "S0";
}

/**
 * Recommended RACI routing (QDP-2). Advisory, not mandatory: the orchestrator
 * may keep production in-house when it is on a stronger model than the
 * specialist — quality is the goal, not the hop count. Independent review,
 * however, is non-negotiable at S2+ (enforced in evaluateDeliverable).
 */
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

export function recommendedSpecialists(deliverableClass: DeliverableClass): RaciRule | null {
  if (deliverableClass === "unknown") return null;
  return RACI_MATRIX[deliverableClass];
}

const PLACEHOLDER_PATTERN =
  /\b(lorem ipsum|tbd|todo|fixme|placeholder|\[insert[^\]]*\]|\bxxx\b|coming soon|sample text)\b/i;
const BRAND_ASSET_HINT =
  /\b(logo|brand kit|palette|brand guide|style guide|wordmark|#[0-9a-f]{6}|color token|on-brand)\b/i;

/**
 * Extract evidence signals from the ACTUAL artifact content (file body / render
 * text), not the agent's chat reply. This is what makes the gate hard to game:
 * the producing agent cannot satisfy it by writing "I used the brand kit" — the
 * deliverable file itself must carry the markers. Heuristic, not proof: it
 * catches the cheapest, most common defects (placeholders shipped to clients,
 * creative with zero brand reference). Pure: caller supplies the artifact text.
 */
export function inspectArtifactText(
  deliverableClass: DeliverableClass,
  artifactText: string,
): Pick<ArtifactEvidence, "placeholdersFound" | "brandAssetsVerified"> {
  const body = artifactText ?? "";
  const evidence: Pick<ArtifactEvidence, "placeholdersFound" | "brandAssetsVerified"> = {
    placeholdersFound: PLACEHOLDER_PATTERN.test(body),
  };
  if (deliverableClass === "client-facing-creative") {
    evidence.brandAssetsVerified = BRAND_ASSET_HINT.test(body);
  }
  return evidence;
}

export interface EvaluateInput {
  task: string;
  reply?: string;
  /** Short-id of the agent that produced the work, if known (e.g. "atlas"). */
  producer?: string;
  /** Facts from inspecting the real artifact. Absent ⇒ verification owed at S2+. */
  evidence?: ArtifactEvidence;
}

/**
 * Evaluate a finished deliverable against QDP. Verdicts:
 *  - block  : S2+ with an inspected quality/context FAILURE (real placeholders,
 *             brand kit not actually used, or a non-independent reviewer).
 *  - review : S2+ that has no inspected failure but is missing the evidence
 *             needed to clear it (brand check, placeholder scan, or independent
 *             reviewer sign-off — human sign-off at S3). Verification is owed.
 *  - pass   : low-stakes, or S2+ where every required fact was inspected good.
 *
 * Delegation is never itself a block — it is surfaced as an advisory routing
 * recommendation, because forcing a weaker specialist can lower quality.
 */
export function evaluateDeliverable(input: EvaluateInput): GateResult {
  const deliverableClass = classifyDeliverable(input.task, input.reply);
  const stakes = inferStakes(input.task, deliverableClass, input.reply);
  const raci = recommendedSpecialists(deliverableClass);
  const evidence = input.evidence ?? {};
  const producer = input.producer?.toLowerCase().trim();
  const reviewedBy = evidence.reviewedBy?.toLowerCase().trim();

  const reasons: string[] = [];
  const evidenceMissing: string[] = [];
  const highStakes = stakes === "S2" || stakes === "S3";

  // Advisory routing nudge (applies at any stakes, never blocks on its own).
  let recommendation: string | null = null;
  if (highStakes && raci && producer && producer !== raci.responsible) {
    recommendation =
      `Consider routing ${deliverableClass} to @${raci.responsible} ` +
      `(+${raci.contributors.map((c) => `@${c}`).join(", ")}), reviewed by @${raci.reviewer} — ` +
      `unless the producer is on a stronger model than the specialist, in which case keep ` +
      `production here and still obtain independent review.`;
  }

  if (!highStakes) {
    // S0/S1 are ungated; only surface an obviously broken artifact for a glance.
    if (evidence.placeholdersFound === true) {
      return {
        deliverableClass,
        stakes,
        raci,
        verdict: "review",
        reasons: ["Artifact contains placeholder/lorem/TODO text (low stakes — fix before reuse)."],
        evidenceMissing: [],
        recommendation,
      };
    }
    return {
      deliverableClass,
      stakes,
      raci,
      verdict: "pass",
      reasons: [],
      evidenceMissing: [],
      recommendation,
    };
  }

  // --- High stakes: evidence-driven. Reply-text claims do not count. ---
  let verdict: Verdict = "pass";

  // 1) Hard blocks from inspected negative facts.
  if (evidence.placeholdersFound === true) {
    verdict = "block";
    reasons.push("Inspected artifact contains placeholder/lorem/TODO text.");
  }
  if (deliverableClass === "client-facing-creative" && evidence.brandAssetsVerified === false) {
    verdict = "block";
    reasons.push(
      "Inspected artifact does not actually use the brand kit (logo/palette) — naming it in the reply does not count.",
    );
  }
  if (evidence.reviewerSignedOff === true && producer && reviewedBy && reviewedBy === producer) {
    verdict = "block";
    reasons.push(
      `Reviewer @${evidence.reviewedBy} is the producer — review must be independent of the author.`,
    );
  }

  // 2) Missing evidence at high stakes ⇒ verification owed (cannot pass).
  if (deliverableClass === "client-facing-creative" && evidence.brandAssetsVerified === undefined) {
    evidenceMissing.push("brand-kit usage not verified against the artifact");
  }
  if (evidence.placeholdersFound === undefined) {
    evidenceMissing.push("artifact not scanned for placeholder/lorem/TODO");
  }
  if (evidence.reviewerSignedOff !== true) {
    evidenceMissing.push("no independent reviewer sign-off on record");
  }
  if (stakes === "S3" && evidence.reviewedByHuman !== true) {
    evidenceMissing.push("S3 requires a human reviewer sign-off");
  }

  if (verdict !== "block") {
    if (evidenceMissing.length > 0) {
      verdict = "review";
      reasons.push(`Cannot ship at ${stakes} until verified: ${evidenceMissing.join("; ")}.`);
    } else {
      reasons.push(
        `Verified at ${stakes}: artifact checks passed and an independent reviewer approved.`,
      );
    }
  }

  return { deliverableClass, stakes, raci, verdict, reasons, evidenceMissing, recommendation };
}

/**
 * Single interlock the send/announce path consults. Only an explicit pass is
 * shippable to the operator/client; review and block are not. Use this instead
 * of parsing the prose notice, so the deliverable channel has one hard gate.
 */
export function isShippable(result: GateResult): boolean {
  return result.verdict === "pass";
}

/** Render a directive block for the orchestrator. Empty when verdict is pass. */
export function formatGateNotice(result: GateResult): string {
  if (result.verdict === "pass") return "";
  const header =
    result.verdict === "block"
      ? "QUALITY & DELEGATION GATE — BLOCK (do NOT report this as done):"
      : "QUALITY & DELEGATION GATE — VERIFICATION OWED (do NOT report as done yet):";
  const lines = [
    "",
    header,
    `  class=${result.deliverableClass} stakes=${result.stakes}`,
    ...result.reasons.map((r) => `  - ${r}`),
  ];
  if (result.recommendation) {
    lines.push(`  routing: ${result.recommendation}`);
  }
  if (result.verdict === "block") {
    lines.push("  Rebuild and re-verify before anything reaches the operator or a client.");
  } else {
    lines.push(
      "  Obtain the missing verification above, then re-run the gate before reporting done.",
    );
  }
  return lines.join("\n");
}
