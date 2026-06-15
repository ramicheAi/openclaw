// Suite runner: the orchestration core that ties responder + matchers + judge
// together and aggregates results.
//
// Pass rule per case: ALL deterministic checks pass AND (no rubric criteria, OR
// the judge score >= the case's minScore (default = suite passThreshold)).
//
// Robustness: a responder or judge failure on one case is caught and recorded as
// a failed-with-error case; the run always completes so a single flaky case can
// never hide the rest of the results.

import { runDeterministicChecks, type CheckResult } from "./matchers.js";
import type { Judge } from "./judge.js";
import type { Responder } from "./responder.js";
import type { EvalCase, EvalSuite } from "./suite.js";

export type CaseResult = {
  id: string;
  passed: boolean;
  /** Deterministic matcher outcomes (empty when only criteria were declared). */
  checks: CheckResult[];
  /** The responder output under test (truncated for the report). */
  output: string;
  /** Judge score (0..1) when criteria were scored, else undefined. */
  judgeScore?: number;
  judgeReasoning?: string;
  /** Set when the responder or judge threw — the case fails with this note. */
  error?: string;
  tags?: string[];
};

export type SuiteResult = {
  suiteName: string;
  total: number;
  passed: number;
  /** passed / total in 0..1 (0 when the suite has no cases). */
  accuracy: number;
  passThreshold: number;
  cases: CaseResult[];
};

export type RunSuiteParams = {
  suite: EvalSuite;
  responder: Responder;
  judge?: Judge;
  /** Suite-level default judge threshold (0..1). */
  passThreshold: number;
  /** Cap stored output length per case so reports stay manageable. */
  maxOutputChars?: number;
};

const DEFAULT_MAX_OUTPUT_CHARS = 4_000;

/** Run every case in the suite sequentially and aggregate the outcome. */
export async function runSuite(params: RunSuiteParams): Promise<SuiteResult> {
  const { suite, responder, judge, passThreshold } = params;
  const maxOutputChars = params.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

  const cases: CaseResult[] = [];
  for (const testCase of suite.cases) {
    cases.push(await runCase(testCase, responder, judge, passThreshold, maxOutputChars));
  }

  const passed = cases.filter((c) => c.passed).length;
  const total = cases.length;
  return {
    suiteName: suite.name,
    total,
    passed,
    accuracy: total === 0 ? 0 : passed / total,
    passThreshold,
    cases,
  };
}

async function runCase(
  testCase: EvalCase,
  responder: Responder,
  judge: Judge | undefined,
  passThreshold: number,
  maxOutputChars: number,
): Promise<CaseResult> {
  let output: string;
  try {
    output = await responder(testCase.input);
  } catch (err) {
    // Responder failure → the case fails; we never got an output to score.
    return {
      id: testCase.id,
      passed: false,
      checks: [],
      output: "",
      error: `responder error: ${err instanceof Error ? err.message : String(err)}`,
      tags: testCase.tags,
    };
  }

  const checks = runDeterministicChecks(output, testCase.expect);
  const deterministicPass = checks.every((c) => c.passed);

  const result: CaseResult = {
    id: testCase.id,
    passed: deterministicPass,
    checks,
    output: truncate(output, maxOutputChars),
    tags: testCase.tags,
  };

  const criteria = testCase.expect.criteria;
  if (criteria && criteria.trim().length > 0) {
    if (!judge) {
      // Criteria declared but no judge available (e.g. --no-judge or no API key):
      // the criteria portion cannot be satisfied, so the case fails.
      result.passed = false;
      result.error = "criteria present but no judge configured (run without --no-judge and set an API key)";
      return result;
    }
    try {
      const verdict = await judge({ input: testCase.input, output, criteria });
      result.judgeScore = verdict.score;
      result.judgeReasoning = verdict.reasoning;
      const threshold = testCase.expect.minScore ?? passThreshold;
      const judgePass = verdict.score >= threshold;
      result.passed = deterministicPass && judgePass;
    } catch (err) {
      // Judge failure → case fails, but the run continues.
      result.passed = false;
      result.error = `judge error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return result;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}… [truncated ${s.length - max} chars]` : s;
}
