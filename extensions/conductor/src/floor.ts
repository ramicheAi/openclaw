// floor.ts — Phase 4: the measured quality floor.
//
// A known failure mode of merge-based orchestration is that the synthesizer can
// CORRUPT a draft that was already correct — the aggregate scores worse than the best
// input. This module guarantees that can't ship: score the merged answer in the SAME
// blind batch as the raw drafts (anonymized so the scorer can't favour "the merge"),
// and if the merge scored below the best draft, revert to that draft. A free safety net.
//
// The scorer is injected, so the decision logic is fully unit-testable offline.

export type BlindScorer = (items: Array<{ id: string; text: string }>) => Promise<Record<string, number>>;

export interface FloorResult {
  final: string;
  reverted: boolean;
  mergedScore: number;
  bestDraftScore: number;
  bestDraftLabel: string | null;
}

// Pure decision: given the merged text + scored drafts, keep the merge unless a raw
// draft scored strictly higher (the merge regressed), in which case return that draft.
export function pickFloor(
  merged: { text: string; score: number },
  drafts: Array<{ label: string; text: string; score: number }>,
): FloorResult {
  let best: { label: string; text: string; score: number } | null = null;
  for (const d of drafts) {
    if (!best || d.score > best.score) best = d;
  }
  const bestDraftScore = best?.score ?? -Infinity;
  if (best && bestDraftScore > merged.score) {
    return { final: best.text, reverted: true, mergedScore: merged.score, bestDraftScore, bestDraftLabel: best.label };
  }
  return {
    final: merged.text,
    reverted: false,
    mergedScore: merged.score,
    bestDraftScore: Number.isFinite(bestDraftScore) ? bestDraftScore : merged.score,
    bestDraftLabel: best?.label ?? null,
  };
}

// Score merged + drafts together under anonymized ids, then apply the floor.
export async function applyQualityFloor(
  mergedText: string,
  drafts: Array<{ label: string; text: string }>,
  scorer: BlindScorer,
): Promise<FloorResult> {
  if (!drafts.length) {
    return { final: mergedText, reverted: false, mergedScore: 0, bestDraftScore: 0, bestDraftLabel: null };
  }
  // anonymize: the scorer must not know which item is the merge.
  const mergedId = "c0";
  const items = [{ id: mergedId, text: mergedText }, ...drafts.map((d, i) => ({ id: `c${i + 1}`, text: d.text }))];
  const scores = await scorer(items);
  const scored = drafts.map((d, i) => ({ label: d.label, text: d.text, score: scores[`c${i + 1}`] ?? 0 }));
  return pickFloor({ text: mergedText, score: scores[mergedId] ?? 0 }, scored);
}

// Build a blind scorer from a model caller — a neutral judge scoring each candidate
// 0-10 by anonymized id. Returns JSON {id: score}.
export const SCORER_PROMPT = `You are a neutral grader. Score EACH candidate answer 0-10 on correctness, completeness, and clarity. Judge only the text; the ids are arbitrary. Output ONLY JSON mapping id -> integer score, e.g. {"c0":7,"c1":9}.`;

export function parseScores(raw: string): Record<string, number> {
  const m = (raw ?? "").match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

// Build a BlindScorer from a model caller — a neutral judge scoring each anonymized
// candidate. The structural param avoids importing the executor (no cycle).
export function createBlindScorer(
  modelKey: string,
  call: (a: { modelKey: string; prompt: string; role: string }) => Promise<string>,
): BlindScorer {
  return async (items) => {
    const body = items.map((it) => `[${it.id}]\n${it.text}`).join("\n\n");
    const raw = await call({ modelKey, prompt: `${SCORER_PROMPT}\n\nCANDIDATES:\n${body}`, role: "score" });
    return parseScores(raw);
  };
}
