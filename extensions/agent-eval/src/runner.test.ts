import { describe, expect, it } from "vitest";

import type { Judge } from "./judge.js";
import { runSuite } from "./runner.js";
import type { Responder } from "./responder.js";
import type { EvalSuite } from "./suite.js";

// End-to-end runner test with fully injected fakes — no network, no spawn.

// Responder keyed by input so each case gets a controlled output. The special
// input "BOOM" makes the responder throw, exercising per-case error isolation.
const scriptedResponder: Responder = async (input) => {
  if (input === "BOOM") throw new Error("responder exploded");
  const map: Record<string, string> = {
    "say-hello": "hello there, friend",
    "be-rude": "go away, error",
  };
  return map[input] ?? "";
};

// Fake judge that scores high only when the rubric mentions "polite".
const keywordJudge: Judge = async ({ criteria }) => ({
  score: criteria.includes("polite") ? 0.95 : 0.1,
  reasoning: "keyword heuristic",
});

const suite: EvalSuite = {
  name: "runner-e2e",
  cases: [
    // Passes: deterministic contains + judge polite => high score.
    {
      id: "good",
      input: "say-hello",
      expect: { contains: ["hello"], notContains: ["error"], criteria: "is polite" },
    },
    // Fails: contains 'error' violates notContains (deterministic fail).
    {
      id: "rude",
      input: "be-rude",
      expect: { notContains: ["error"], criteria: "is polite" },
    },
    // Fails: responder throws -> case errored but run continues.
    {
      id: "explodes",
      input: "BOOM",
      expect: { contains: ["anything"] },
    },
  ],
};

describe("runSuite — end to end", () => {
  it("scores per-case pass/fail and aggregates accuracy", async () => {
    const result = await runSuite({
      suite,
      responder: scriptedResponder,
      judge: keywordJudge,
      passThreshold: 0.6,
    });

    const byId = Object.fromEntries(result.cases.map((c) => [c.id, c]));

    expect(byId.good.passed).toBe(true);
    expect(byId.good.judgeScore).toBe(0.95);

    expect(byId.rude.passed).toBe(false);
    // Deterministic notContains should be the failing check.
    expect(byId.rude.checks.find((c) => c.check === "notContains")?.passed).toBe(false);

    expect(byId.explodes.passed).toBe(false);
    expect(byId.explodes.error).toContain("responder error");
    expect(byId.explodes.output).toBe("");

    // 1 of 3 passed.
    expect(result.total).toBe(3);
    expect(result.passed).toBe(1);
    expect(result.accuracy).toBeCloseTo(1 / 3, 5);
    expect(result.suiteName).toBe("runner-e2e");
  });

  it("completes the whole run even though one case threw", async () => {
    const result = await runSuite({
      suite,
      responder: scriptedResponder,
      judge: keywordJudge,
      passThreshold: 0.6,
    });
    // All three cases are present in the output despite the thrown one.
    expect(result.cases.map((c) => c.id).sort()).toEqual(["explodes", "good", "rude"]);
  });

  it("reports zero accuracy for an empty suite", async () => {
    const result = await runSuite({
      suite: { name: "empty", cases: [] },
      responder: scriptedResponder,
      passThreshold: 0.6,
    });
    expect(result.total).toBe(0);
    expect(result.accuracy).toBe(0);
  });

  it("passes a deterministic-only case without a judge", async () => {
    const detOnly: EvalSuite = {
      name: "det",
      cases: [{ id: "x", input: "say-hello", expect: { contains: ["hello"] } }],
    };
    const result = await runSuite({ suite: detOnly, responder: scriptedResponder, passThreshold: 0.6 });
    expect(result.passed).toBe(1);
  });
});
