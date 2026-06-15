import { describe, expect, it } from "vitest";

import { clampScore, parseJudgeResponse, type Judge } from "./judge.js";
import { runSuite } from "./runner.js";
import type { Responder } from "./responder.js";
import type { EvalSuite } from "./suite.js";

const echo: Responder = async (input) => input;

// A fake judge with a fixed score — no network. This is the seam the spec
// requires: criteria cases are scored without ever calling OpenAI.
const fixedJudge = (score: number): Judge => async () => ({ score, reasoning: `fixed ${score}` });

describe("clampScore", () => {
  it("clamps and coerces", () => {
    expect(clampScore(0.5)).toBe(0.5);
    expect(clampScore(2)).toBe(1);
    expect(clampScore(-1)).toBe(0);
    expect(clampScore("0.3")).toBe(0.3);
    expect(clampScore("nonsense")).toBe(0);
    expect(clampScore(undefined)).toBe(0);
  });
});

describe("parseJudgeResponse", () => {
  it("parses clean JSON", () => {
    expect(parseJudgeResponse('{"score": 0.8, "reasoning": "good"}')).toEqual({
      score: 0.8,
      reasoning: "good",
    });
  });

  it("extracts JSON embedded in prose or code fences", () => {
    const v = parseJudgeResponse('Here you go:\n```json\n{"score":0.4,"reasoning":"meh"}\n```');
    expect(v.score).toBe(0.4);
    expect(v.reasoning).toBe("meh");
  });

  it("clamps an out-of-range score from the model", () => {
    expect(parseJudgeResponse('{"score": 9, "reasoning": "x"}').score).toBe(1);
  });

  it("returns a zero-score verdict on unparseable text", () => {
    const v = parseJudgeResponse("totally not json");
    expect(v.score).toBe(0);
    expect(v.reasoning).toContain("unparseable");
  });
});

describe("runner with an injected fake judge", () => {
  const suite: EvalSuite = {
    name: "criteria-only",
    cases: [{ id: "rubric", input: "anything", expect: { criteria: "should be excellent" } }],
  };

  it("passes a criteria case when the judge scores at/above threshold", async () => {
    const result = await runSuite({ suite, responder: echo, judge: fixedJudge(0.9), passThreshold: 0.6 });
    expect(result.passed).toBe(1);
    expect(result.cases[0].judgeScore).toBe(0.9);
  });

  it("fails a criteria case when the judge scores below threshold", async () => {
    const result = await runSuite({ suite, responder: echo, judge: fixedJudge(0.2), passThreshold: 0.6 });
    expect(result.passed).toBe(0);
    expect(result.cases[0].judgeScore).toBe(0.2);
  });

  it("honors a per-case minScore over the suite threshold", async () => {
    const strict: EvalSuite = {
      name: "strict",
      cases: [{ id: "r", input: "x", expect: { criteria: "great", minScore: 0.95 } }],
    };
    const result = await runSuite({ suite: strict, responder: echo, judge: fixedJudge(0.9), passThreshold: 0.6 });
    expect(result.passed).toBe(0); // 0.9 < 0.95 even though 0.9 > suite threshold
  });

  it("fails a criteria case when no judge is provided", async () => {
    const result = await runSuite({ suite, responder: echo, judge: undefined, passThreshold: 0.6 });
    expect(result.passed).toBe(0);
    expect(result.cases[0].error).toContain("no judge");
  });
});
