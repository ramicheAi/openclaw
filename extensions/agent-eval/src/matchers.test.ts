import { describe, expect, it } from "vitest";

import { expectHasAnyCheck, runDeterministicChecks } from "./matchers.js";

describe("runDeterministicChecks — contains", () => {
  it("passes when every substring is present", () => {
    const [r] = runDeterministicChecks("the quick brown fox", { contains: ["quick", "fox"] });
    expect(r).toEqual({ check: "contains", passed: true, detail: undefined });
  });

  it("fails and reports the missing substrings", () => {
    const [r] = runDeterministicChecks("the quick brown fox", { contains: ["quick", "cat"] });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("cat");
    expect(r.detail).not.toContain("quick");
  });

  it("is case-sensitive", () => {
    const [r] = runDeterministicChecks("Hello World", { contains: ["hello"] });
    expect(r.passed).toBe(false);
  });
});

describe("runDeterministicChecks — notContains", () => {
  it("passes when no forbidden substring is present", () => {
    const [r] = runDeterministicChecks("all good here", { notContains: ["error", "fail"] });
    expect(r.passed).toBe(true);
  });

  it("fails and reports the offending substrings", () => {
    const [r] = runDeterministicChecks("there was an error", { notContains: ["error"] });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("error");
  });
});

describe("runDeterministicChecks — regex", () => {
  it("passes when the pattern matches", () => {
    const [r] = runDeterministicChecks("order 12345 confirmed", { regex: "order\\s+\\d+" });
    expect(r.passed).toBe(true);
  });

  it("fails when the pattern does not match", () => {
    const [r] = runDeterministicChecks("no number here", { regex: "\\d{3}" });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("did not match");
  });

  it("treats an invalid pattern as a failed check, not a throw", () => {
    expect(() => runDeterministicChecks("x", { regex: "(" })).not.toThrow();
    const [r] = runDeterministicChecks("x", { regex: "(" });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("invalid regex");
  });

  it("rejects nested-quantifier (ReDoS) patterns quickly instead of backtracking", () => {
    const evil = "a".repeat(40); // would hang against /(a+)+$/ if executed
    const start = Date.now();
    const [r] = runDeterministicChecks(evil, { regex: "(a+)+$" });
    expect(Date.now() - start).toBeLessThan(1000);
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("ReDoS");
  });

  it("only tests the capped prefix of very long output", () => {
    const output = `${"y".repeat(60_000)}MATCH`;
    const [r] = runDeterministicChecks(output, { regex: "MATCH$" });
    expect(r.passed).toBe(false); // MATCH lies beyond the 50k haystack cap
  });
});

describe("runDeterministicChecks — equals", () => {
  it("passes on an exact match", () => {
    const [r] = runDeterministicChecks("ACK", { equals: "ACK" });
    expect(r.passed).toBe(true);
  });

  it("ignores surrounding whitespace on both sides", () => {
    const [r] = runDeterministicChecks("  ACK\n", { equals: "ACK" });
    expect(r.passed).toBe(true);
  });

  it("fails on a content mismatch", () => {
    const [r] = runDeterministicChecks("NACK", { equals: "ACK" });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("ACK");
  });
});

describe("runDeterministicChecks — mixed", () => {
  it("produces one result per declared matcher and excludes criteria", () => {
    const results = runDeterministicChecks("the quick brown fox", {
      contains: ["quick"],
      notContains: ["slow"],
      regex: "fox$",
      equals: "the quick brown fox",
      criteria: "should describe a fox", // not scored here
    });
    expect(results.map((r) => r.check)).toEqual(["contains", "notContains", "regex", "equals"]);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it("returns no deterministic checks when only criteria are declared", () => {
    expect(runDeterministicChecks("anything", { criteria: "is nice" })).toEqual([]);
  });
});

describe("expectHasAnyCheck", () => {
  it("is true when any scorable field is declared", () => {
    expect(expectHasAnyCheck({ contains: ["a"] })).toBe(true);
    expect(expectHasAnyCheck({ criteria: "x" })).toBe(true);
    expect(expectHasAnyCheck({ equals: "" })).toBe(true); // equals "" is a real check
  });

  it("is false for an empty expectation", () => {
    expect(expectHasAnyCheck({})).toBe(false);
    expect(expectHasAnyCheck({ contains: [], notContains: [] })).toBe(false);
    expect(expectHasAnyCheck({ criteria: "   " })).toBe(false);
  });
});
