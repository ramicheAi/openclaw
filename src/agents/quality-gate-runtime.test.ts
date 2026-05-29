import { describe, expect, it } from "vitest";
import type { GateResult } from "./quality-delegation-gate.js";
import { shouldSuppressDelivery } from "./quality-gate-runtime.js";

function gate(partial: Partial<GateResult>): GateResult {
  return {
    deliverableClass: "client-facing-creative",
    stakes: "S2",
    raci: null,
    verdict: "block",
    reasons: [],
    evidenceMissing: [],
    recommendation: null,
    ...partial,
  };
}

describe("shouldSuppressDelivery", () => {
  it("holds an S3 block by default (mandatory), no env needed", () => {
    expect(shouldSuppressDelivery(gate({ stakes: "S3", verdict: "block" }), "unset")).toBe(true);
  });

  it("does NOT hold a lower-stakes block unless enforcement is explicitly on", () => {
    expect(shouldSuppressDelivery(gate({ stakes: "S2", verdict: "block" }), "unset")).toBe(false);
    expect(shouldSuppressDelivery(gate({ stakes: "S2", verdict: "block" }), "on")).toBe(true);
  });

  it("an explicit off disables all suppression, including S3 (escape hatch)", () => {
    expect(shouldSuppressDelivery(gate({ stakes: "S3", verdict: "block" }), "off")).toBe(false);
  });

  it("never holds a non-block verdict", () => {
    expect(shouldSuppressDelivery(gate({ stakes: "S3", verdict: "review" }), "on")).toBe(false);
    expect(shouldSuppressDelivery(gate({ stakes: "S3", verdict: "pass" }), "on")).toBe(false);
  });
});
