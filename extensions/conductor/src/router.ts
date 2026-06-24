// router.ts — Phase 3: the difficulty router (the orchestration brain).
//
// Turns a per-task classification (RouterPlan) into a concrete, ordered execution
// plan (DispatchPlan) across the seat roster — and binds the Phase-1 egress guard
// and Phase-2 injection firewall to EVERY hop by construction, so the executor that
// makes the live model calls cannot accidentally route sensitive data to an
// untrusted lab or feed an unfortified cross-model draft into a synthesizer/judge.
//
// Everything here is PURE: the only live part is the planner LLM call (Stage 1) and
// the per-seat model calls, both injected by the executor. That keeps the brain's
// decision logic fully unit-testable offline.

import { assertRoutable, type EgressDecision, resolveVendor, type TrustPolicy, type Vendor } from "./model-trust.js";
import { fortify, type FortifyResult } from "./injection-firewall.js";

export type Mode = "solo" | "relay" | "panel" | "trinity";
export type Seat = "CORRECTNESS" | "COMPLETENESS" | "CLARITY" | "RISK" | "JUDGE";
export type Stakes = "routine" | "high_end";

// The Stage-1 planner's structured output.
export interface RouterPlan {
  mode: Mode;
  seats: Seat[]; // for panel: which DRAFT seats to convene (2-4); ignored for solo
  stakes: Stakes;
  grounding: boolean; // does a correct answer depend on external facts to look up?
  reason?: string;
}

// Seat -> provider/model key. Route by benchmarked strength; pick across DIFFERENT
// labs so the panel's drafts are architecturally diverse (the anti-correlated-error
// engine). Override per deployment.
export type Roster = Record<Seat, string>;

// Ships safe + runnable TODAY: the claude-max proxy is the only confirmed-live chat
// provider, so the default is Claude-only (prompt-diversity). rosterDiversity() will
// honestly report 1 for this roster. Switch to DIVERSE_ROSTER once a local (lmstudio)
// or cloud provider is confirmed up — that is where the architecture-diversity payoff
// (different labs making different mistakes) actually lives.
// Model ids verified against the live registry (cfg.models.providers.claude-max).
export const DEFAULT_ROSTER: Roster = {
  JUDGE: "claude-max/claude-fable-5", // strongest (the fleet's primary) — never drafts
  CORRECTNESS: "claude-max/claude-opus-4-8", // agentic, real-world/repo code + tool use
  RISK: "claude-max/claude-opus-4-8", // strong analytical reasoner for red-teaming
  COMPLETENESS: "claude-max/claude-sonnet-4", // broad, low-hallucination coverage
  CLARITY: "claude-max/claude-haiku-4", // fast, clean structure; also the synthesizer
};

// Opt-in roster for genuine architecture diversity. Spans Anthropic (cloud) + Qwen and
// Gemma served locally via lmstudio on the M5 (100.96.20.21:1234) — three distinct model
// architectures. Bonus: the local seats can take sensitive data with zero egress (see the
// model-trust 'local' vendor). Model ids verified against the live registry.
export const DIVERSE_ROSTER: Roster = {
  JUDGE: "claude-max/claude-fable-5",
  CORRECTNESS: "claude-max/claude-opus-4-8",
  RISK: "lmstudio/qwen/qwen3-14b", // local Qwen, distinct architecture
  COMPLETENESS: "lmstudio/google/gemma-4-e4b", // local Gemma, different training data
  CLARITY: "claude-max/claude-haiku-4",
};

// The reliable, best-presenting seat that performs the merge. NEVER a model that is
// strong at generating but weak at reviewing — and never the JUDGE (held in reserve).
export const SYNTHESIZER_SEAT: Seat = "CLARITY";

export type StepRole =
  | "solo"
  | "draft"
  | "verify"
  | "synthesize"
  | "evidence"
  | "judge"
  | "author"
  | "refine"
  | "think"
  | "work"
  | "verify-loop";

export interface DispatchStep {
  role: StepRole;
  seat: Seat;
  modelKey: string;
  group: number; // steps sharing a group run in parallel; groups execute in order
  inboundUntrusted: boolean; // step receives prior model output → executor MUST fortify it first
  loopBudget?: number; // for the trinity worker<->verifier loop
}

export interface DispatchPlan {
  mode: Mode;
  steps: DispatchStep[];
  usesJudge: boolean;
  usesEvidence: boolean;
}

// Does the judge fire? On high stakes always; for routine work the executor may still
// escalate at runtime when drafts disagree (low overlap) — that is a runtime signal,
// not a static one, so the plan reflects only the static guarantee here.
function judgeFires(plan: RouterPlan): boolean {
  return plan.mode !== "solo" && plan.stakes === "high_end";
}

function evidenceFires(plan: RouterPlan): boolean {
  return plan.mode !== "solo" && plan.grounding === true;
}

// Convert a classification + roster into the ordered execution plan.
export function buildDispatchPlan(plan: RouterPlan, roster: Roster = DEFAULT_ROSTER): DispatchPlan {
  const usesJudge = judgeFires(plan);
  const usesEvidence = evidenceFires(plan);
  const steps: DispatchStep[] = [];

  const draftSeats = (plan.seats.length ? plan.seats : (["CORRECTNESS", "COMPLETENESS", "RISK"] as Seat[])).filter(
    (s) => s !== "JUDGE",
  );

  if (plan.mode === "solo") {
    const seat = draftSeats[0] ?? "CLARITY";
    steps.push({ role: "solo", seat, modelKey: roster[seat], group: 0, inboundUntrusted: false });
    return { mode: plan.mode, steps, usesJudge: false, usesEvidence: false };
  }

  if (plan.mode === "relay") {
    // reliable author -> different-lab refiner -> (high-stakes) judge
    const author: Seat = "CORRECTNESS";
    const refiner: Seat = roster[SYNTHESIZER_SEAT] !== roster[author] ? SYNTHESIZER_SEAT : "RISK";
    steps.push({ role: "author", seat: author, modelKey: roster[author], group: 0, inboundUntrusted: false });
    steps.push({ role: "refine", seat: refiner, modelKey: roster[refiner], group: 1, inboundUntrusted: true });
    if (usesJudge) steps.push({ role: "judge", seat: "JUDGE", modelKey: roster.JUDGE, group: 2, inboundUntrusted: true });
    return { mode: plan.mode, steps, usesJudge, usesEvidence: false };
  }

  if (plan.mode === "trinity") {
    // thinker (plan) -> worker -> verifier loop (different lab than worker)
    const thinker: Seat = "COMPLETENESS";
    const worker: Seat = "CORRECTNESS";
    const verifier: Seat = roster.RISK !== roster[worker] ? "RISK" : "CLARITY";
    steps.push({ role: "think", seat: thinker, modelKey: roster[thinker], group: 0, inboundUntrusted: false });
    steps.push({ role: "work", seat: worker, modelKey: roster[worker], group: 1, inboundUntrusted: true });
    steps.push({ role: "verify-loop", seat: verifier, modelKey: roster[verifier], group: 2, inboundUntrusted: true, loopBudget: 3 });
    if (usesJudge) steps.push({ role: "judge", seat: "JUDGE", modelKey: roster.JUDGE, group: 3, inboundUntrusted: true });
    return { mode: plan.mode, steps, usesJudge, usesEvidence };
  }

  // PANEL (breadth): parallel drafts -> lens critiques -> synthesize -> [evidence] -> [judge]
  let group = 0;
  for (const seat of draftSeats) {
    steps.push({ role: "draft", seat, modelKey: roster[seat], group, inboundUntrusted: false });
  }
  group += 1;
  for (const seat of draftSeats) {
    steps.push({ role: "verify", seat, modelKey: roster[seat], group, inboundUntrusted: true });
  }
  group += 1;
  steps.push({ role: "synthesize", seat: SYNTHESIZER_SEAT, modelKey: roster[SYNTHESIZER_SEAT], group, inboundUntrusted: true });
  if (usesEvidence) {
    group += 1;
    // fact-check is performed by the precise/correctness seat against retrieved evidence
    steps.push({ role: "evidence", seat: "CORRECTNESS", modelKey: roster.CORRECTNESS, group, inboundUntrusted: true });
  }
  if (usesJudge) {
    group += 1;
    steps.push({ role: "judge", seat: "JUDGE", modelKey: roster.JUDGE, group, inboundUntrusted: true });
  }
  return { mode: plan.mode, steps, usesJudge, usesEvidence };
}

// --- per-hop guards (bind Phase 1 + Phase 2 to every model call) --------------

// Before sending content TO a seat's model: enforce the egress trust policy.
// Throws EgressBlockedError if the route would leak sensitive data to that lab.
export function guardOutbound(content: string, modelKey: string, policy?: TrustPolicy): EgressDecision {
  return assertRoutable(content, modelKey, policy);
}

// When taking content FROM a model (or from retrieved evidence) into a downstream
// step: wrap it as untrusted so it cannot hijack the next model.
export function guardInbound(content: string, source: string): FortifyResult {
  return fortify(content, { source });
}

// How many distinct labs the draft seats span — the architectural-diversity that
// makes cross-model error-cancellation work. 1 = a monoculture wearing many hats.
export function rosterDiversity(roster: Roster, seats: Seat[]): number {
  const vendors = new Set<Vendor>(seats.map((s) => resolveVendor(roster[s])));
  return vendors.size;
}

// The Stage-1 planner prompt (executed live by the router to classify a task).
export const PLANNER_PROMPT = `You are a routing planner. For the TASK, decide:
- mode: "solo" (simple/tactical/short) | "relay" (code & build work — author then refine) | "panel" (hard/multi-perspective) | "trinity" (hard multi-step needing iterative depth)
- seats: for panel, which 2-4 of CORRECTNESS / COMPLETENESS / CLARITY / RISK the task needs (the most COMPLEMENTARY set, not duplicates)
- stakes: "routine" | "high_end" (flagship / customer-facing / ships to production)
- grounding: does a correct answer depend on external facts to look up? (true/false)
Output ONLY JSON: {"mode":"...","seats":[...],"stakes":"...","grounding":bool,"reason":"..."}
TASK: <task>`;

export function dispatchSummary(plan: DispatchPlan): string {
  const byGroup = new Map<number, string[]>();
  for (const s of plan.steps) {
    const arr = byGroup.get(s.group) ?? [];
    arr.push(`${s.role}(${s.seat})`);
    byGroup.set(s.group, arr);
  }
  const stages = [...byGroup.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.join(" ∥ "));
  return `${plan.mode}: ${stages.join(" → ")}${plan.usesEvidence ? " [+evidence]" : ""}${plan.usesJudge ? " [+judge]" : ""}`;
}
