// executor.ts — Phase 3 (cont.): the live orchestration runner.
//
// Walks a DispatchPlan group-by-group (parallel within a group, sequential across
// groups), enforcing the Phase-1 egress guard and Phase-2 injection firewall on
// EVERY hop. The actual model call is injected (`deps.callModel`) so the entire
// orchestration — routing, guarding, fortifying, the trinity loop, the never-empty
// floor — is unit-testable offline; the executor itself never imports a network client.

import { countUnsupported, EVIDENCE_VERDICT_PROMPT, parseVerdicts, stripUnsupported } from "./evidence.js";
import { applyQualityFloor, type BlindScorer } from "./floor.js";
import { bestModeFor, type LearningStore, recordRun, taskKind } from "./learning.js";
import { EgressBlockedError, type TrustPolicy } from "./model-trust.js";
import {
  buildDispatchPlan,
  DEFAULT_ROSTER,
  type DispatchPlan,
  type DispatchStep,
  guardInbound,
  guardOutbound,
  type Mode,
  PLANNER_PROMPT,
  type Roster,
  type RouterPlan,
  type Seat,
} from "./router.js";

export type ModelCaller = (a: { modelKey: string; prompt: string; role: string }) => Promise<string>;

export interface ConductorDeps {
  callModel: ModelCaller;
  policy?: TrustPolicy;
  roster?: Roster;
  evidence?: string; // optional retrieved evidence for the fact-check step
  scorer?: BlindScorer; // optional Phase-4 quality floor (revert a regressed merge)
  learn?: { store: LearningStore; explore?: () => boolean }; // optional Phase-6 learning loop
  log?: (m: string) => void;
}

export interface StepOutcome {
  role: string;
  seat: string;
  modelKey: string;
  output: string;
  skipped?: "egress";
}

export interface ConductorResult {
  mode: Mode;
  plan: DispatchPlan;
  final: string;
  transcript: StepOutcome[];
  egressBlocks: number;
  floorReverted: boolean;
  hallucinationCount?: number; // # of unsupported claims when the evidence check ran
}

const ROLE_INSTRUCTION: Record<string, string> = {
  solo: "Answer the TASK directly and completely.",
  draft: "Produce YOUR strongest, complete answer to the TASK. Never invent specifics; abstaining beats fabricating.",
  verify: "Adversarially review the drafts through YOUR lens only. List each issue -> the single best fix. Flag fabricated specifics as [UNSUPPORTED]. No praise.",
  synthesize: "Merge the strongest material from all drafts; fix every valid issue; DROP anything flagged [UNSUPPORTED]. Output ONLY the merged answer.",
  evidence: EVIDENCE_VERDICT_PROMPT,
  judge: "Final judge. Verify correctness, sweep for unsupported specifics, add blind spots. Your final MUST be at least as strong as the best single draft — ADD, never subtract. Output ONLY the final answer.",
  author: "Write the first complete, runnable solution to the TASK.",
  refine: "You are given a teammate's draft. Improve it for real — fix every bug, edge case, race, and non-idiomatic choice. Output the COMPLETE improved solution, never a diff.",
  think: "Decompose the TASK into key steps and what the solution MUST get right. Plan only; do not solve.",
  work: "Using the PLAN and any verifier feedback, produce/improve the full solution.",
  "verify-loop": "Evaluate the solution vs the TASK and PLAN. Reply 'ACCEPT' if correct, complete, top-tier; else 'REVISE' + the specific fixes.",
};

// Which prior roles' outputs feed a given step (as untrusted, fortified context).
function inboundSources(step: DispatchStep, mode: Mode): string[] {
  switch (step.role) {
    case "verify":
      return ["draft"];
    case "synthesize":
      return ["draft", "verify"];
    case "evidence":
      return ["synthesize"];
    case "judge":
      // the evidence step's output is verdict JSON; the judge reads the CLEANED synthesis instead
      return ["synthesize", "refine", "work"];
    case "refine":
      return ["author"];
    case "work":
      return mode === "trinity" ? ["think", "verify-loop"] : ["think"];
    case "verify-loop":
      return ["work"];
    default:
      return [];
  }
}

function assemblePrompt(step: DispatchStep, task: string, ctx: Map<string, string[]>, deps: ConductorDeps, mode: Mode): string {
  const parts = [`TASK: ${task}`, "", ROLE_INSTRUCTION[step.role] ?? "Address the TASK."];
  for (const src of inboundSources(step, mode)) {
    for (const out of ctx.get(src) ?? []) {
      if (out) parts.push("", guardInbound(out, `${src}`).safe);
    }
  }
  if (step.role === "evidence" && deps.evidence) parts.push("", guardInbound(deps.evidence, "evidence:retrieved").safe);
  return parts.join("\n");
}

async function execStep(step: DispatchStep, task: string, ctx: Map<string, string[]>, deps: ConductorDeps, mode: Mode): Promise<StepOutcome> {
  const prompt = assemblePrompt(step, task, ctx, deps, mode);
  try {
    guardOutbound(prompt, step.modelKey, deps.policy);
  } catch (e) {
    if (e instanceof EgressBlockedError) {
      deps.log?.(`egress-blocked ${step.role}(${step.seat}) → ${step.modelKey}: ${e.decision.violations.map((v) => v.class).join(",")}`);
      return { role: step.role, seat: step.seat, modelKey: step.modelKey, output: "", skipped: "egress" };
    }
    throw e;
  }
  const output = await deps.callModel({ modelKey: step.modelKey, prompt, role: step.role });
  return { role: step.role, seat: step.seat, modelKey: step.modelKey, output };
}

function record(ctx: Map<string, string[]>, outcome: StepOutcome): void {
  if (outcome.skipped || !outcome.output) return;
  const arr = ctx.get(outcome.role) ?? [];
  arr.push(outcome.output);
  ctx.set(outcome.role, arr);
}

// Run the trinity worker<->verifier loop until ACCEPT or the budget is spent.
async function runTrinityLoop(task: string, plan: DispatchPlan, deps: ConductorDeps, ctx: Map<string, string[]>, transcript: StepOutcome[], egress: { n: number }): Promise<void> {
  const work = plan.steps.find((s) => s.role === "work")!;
  const verify = plan.steps.find((s) => s.role === "verify-loop")!;
  const budget = verify.loopBudget ?? 3;
  for (let turn = 0; turn < budget; turn++) {
    const w = await execStep(work, task, ctx, deps, "trinity");
    transcript.push(w);
    if (w.skipped) egress.n++;
    record(ctx, w);
    const v = await execStep(verify, task, ctx, deps, "trinity");
    transcript.push(v);
    if (v.skipped) egress.n++;
    record(ctx, v);
    if (/\bACCEPT\b/.test(v.output)) break;
  }
}

// Execute a classified task. The planner (Stage 1) is the caller's responsibility —
// pass the RouterPlan it produced; this runs the rest deterministically + securely.
export async function runConductor(task: string, plan: RouterPlan, deps: ConductorDeps): Promise<ConductorResult> {
  const dispatch = buildDispatchPlan(plan, deps.roster);
  const ctx = new Map<string, string[]>();
  const transcript: StepOutcome[] = [];
  const egress = { n: 0 };
  let lastGood = "";

  if (dispatch.mode === "trinity") {
    const think = dispatch.steps.find((s) => s.role === "think")!;
    const t = await execStep(think, task, ctx, deps, "trinity");
    transcript.push(t);
    if (t.skipped) egress.n++;
    record(ctx, t);
    await runTrinityLoop(task, dispatch, deps, ctx, transcript, egress);
    const judge = dispatch.steps.find((s) => s.role === "judge");
    if (judge) {
      const j = await execStep(judge, task, ctx, deps, "trinity");
      transcript.push(j);
      if (j.skipped) egress.n++;
      record(ctx, j);
    }
    for (const o of transcript) if (!o.skipped && o.output) lastGood = o.output;
    return { mode: dispatch.mode, plan: dispatch, final: lastGood, transcript, egressBlocks: egress.n, floorReverted: false };
  }

  // forward modes: solo / relay / panel — groups in order, parallel within a group
  const groups = [...new Set(dispatch.steps.map((s) => s.group))].sort((a, b) => a - b);
  let floorReverted = false;
  let hallucinationCount: number | undefined;
  for (const g of groups) {
    const inGroup = dispatch.steps.filter((s) => s.group === g);
    const outcomes = await Promise.all(inGroup.map((s) => execStep(s, task, ctx, deps, dispatch.mode)));
    for (const o of outcomes) {
      transcript.push(o);
      if (o.skipped) egress.n++;
      record(ctx, o);
      // never-empty floor: keep the latest good answer — but the evidence step emits
      // verdict JSON, not an answer, so it must not become the candidate.
      if (!o.skipped && o.output && o.role !== "evidence") lastGood = o.output;
    }
    // Phase-5 evidence check: parse the verdicts, measure hallucinations, strip the
    // unsupported claims from the synthesis before the judge/final.
    const ev = outcomes.find((o) => o.role === "evidence" && !o.skipped && o.output);
    if (ev) {
      const verdicts = parseVerdicts(ev.output);
      hallucinationCount = countUnsupported(verdicts);
      const synthText = (ctx.get("synthesize") ?? []).slice(-1)[0] ?? lastGood;
      const cleaned = stripUnsupported(synthText, verdicts);
      ctx.set("synthesize", [cleaned]);
      lastGood = cleaned;
      deps.log?.(`evidence: ${hallucinationCount} unsupported claim(s)`);
    }
    // Phase-4 quality floor: right after the synthesis, score it blind against the raw
    // drafts and revert if the merge regressed — before the judge ever sees it.
    const synth = outcomes.find((o) => o.role === "synthesize" && !o.skipped && o.output);
    if (synth && deps.scorer) {
      const drafts = (ctx.get("draft") ?? []).map((t, i) => ({ label: `draft${i}`, text: t }));
      if (drafts.length) {
        const floored = await applyQualityFloor(synth.output, drafts, deps.scorer);
        ctx.set("synthesize", [floored.final]); // the judge + final use the floored text
        lastGood = floored.final;
        if (floored.reverted) {
          floorReverted = true;
          deps.log?.(`floor: merge regressed (${floored.mergedScore} < ${floored.bestDraftScore}) → reverted to ${floored.bestDraftLabel}`);
        }
      }
    }
  }
  return { mode: dispatch.mode, plan: dispatch, final: lastGood, transcript, egressBlocks: egress.n, floorReverted, hallucinationCount };
}

const DRAFT_SEATS = new Set<Seat>(["CORRECTNESS", "COMPLETENESS", "CLARITY", "RISK"]);
const FALLBACK_PLAN: RouterPlan = {
  mode: "panel",
  seats: ["CORRECTNESS", "COMPLETENESS", "RISK"],
  stakes: "routine",
  grounding: false,
  reason: "planner-fallback",
};

// Parse the planner's JSON into a validated RouterPlan, or null if malformed.
export function safeParsePlan(raw: string): RouterPlan | null {
  const m = (raw ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const mode = o.mode;
    if (mode !== "solo" && mode !== "relay" && mode !== "panel" && mode !== "trinity") return null;
    const seats = Array.isArray(o.seats) ? (o.seats.filter((s) => DRAFT_SEATS.has(s as Seat)) as Seat[]) : [];
    return {
      mode,
      seats,
      stakes: o.stakes === "high_end" ? "high_end" : "routine",
      grounding: o.grounding === true,
      reason: typeof o.reason === "string" ? o.reason : undefined,
    };
  } catch {
    return null;
  }
}

// Stage 1: classify a task into a RouterPlan via the live planner. The planner hop is
// itself egress-guarded — if the task can't safely reach the planner model, we fall
// back to a conservative panel rather than leaking it.
export async function planTask(task: string, deps: ConductorDeps): Promise<RouterPlan> {
  const roster = deps.roster ?? DEFAULT_ROSTER;
  const prompt = PLANNER_PROMPT.replace("<task>", task);
  try {
    guardOutbound(prompt, roster.CLARITY, deps.policy);
  } catch {
    return FALLBACK_PLAN;
  }
  let raw = "";
  try {
    raw = await deps.callModel({ modelKey: roster.CLARITY, prompt, role: "plan" });
  } catch {
    return FALLBACK_PLAN;
  }
  return biasFromHistory(task, safeParsePlan(raw) ?? FALLBACK_PLAN, deps);
}

const MODES = new Set<Mode>(["solo", "relay", "panel", "trinity"]);

// Phase-6 routing bias: most of the time, route a task-kind to its proven-winning mode;
// occasionally explore (keep the planner's choice) so a newly-better mode is re-discovered.
async function biasFromHistory(task: string, plan: RouterPlan, deps: ConductorDeps): Promise<RouterPlan> {
  if (!deps.learn) return plan;
  const explore = deps.learn.explore ?? (() => Math.random() < 0.2);
  if (explore()) return plan;
  const best = bestModeFor(await deps.learn.store.load(), taskKind(task));
  if (best && best !== plan.mode && MODES.has(best as Mode)) {
    return { ...plan, mode: best as Mode, reason: `${plan.reason ?? ""} [routed to historical winner '${best}']`.trim() };
  }
  return plan;
}

// End-to-end: classify, then orchestrate. The one call a tool/agent makes.
export async function runConductorAuto(task: string, deps: ConductorDeps): Promise<ConductorResult> {
  const plan = await planTask(task, deps);
  const result = await runConductor(task, plan, deps);
  if (deps.learn) {
    // a "clean" run is one that passed every quality gate — that mode earns the credit.
    const success = !result.floorReverted && !result.hallucinationCount && result.egressBlocks === 0;
    const state = await deps.learn.store.load();
    await deps.learn.store.save(recordRun(state, { kind: taskKind(task), mode: result.mode, success }));
  }
  return result;
}
