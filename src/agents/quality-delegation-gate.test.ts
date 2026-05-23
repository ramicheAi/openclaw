import { describe, expect, it } from "vitest";
import {
  checkDefinitionOfDone,
  classifyDeliverable,
  evaluateDeliverable,
  formatGateNotice,
  inferStakes,
  requiredSpecialists,
} from "./quality-delegation-gate.js";

describe("classifyDeliverable", () => {
  it("classifies a client pitch as client-facing-creative", () => {
    expect(classifyDeliverable("Build a swim pitch deck for the coach")).toBe(
      "client-facing-creative",
    );
  });

  it("classifies code work", () => {
    expect(classifyDeliverable("Refactor the auth endpoint and add unit tests")).toBe("code");
  });

  it("classifies outbound email as external-comms", () => {
    expect(classifyDeliverable("Write a cold email sequence to 10 leads")).toBe("external-comms");
  });

  it("falls back to unknown when nothing matches", () => {
    expect(classifyDeliverable("ponder the universe")).toBe("unknown");
  });
});

describe("inferStakes", () => {
  it("treats legal/financial work as S3", () => {
    expect(inferStakes("review this client contract for compliance")).toBe("S3");
  });

  it("defaults client-facing creative to at least S2", () => {
    expect(inferStakes("make a mood board", "client-facing-creative")).toBe("S2");
  });

  it("treats internal scratch as S0", () => {
    expect(inferStakes("jot a quick note to myself")).toBe("S0");
  });
});

describe("requiredSpecialists", () => {
  it("routes creative to aetherion as responsible, vee as reviewer", () => {
    const raci = requiredSpecialists("client-facing-creative");
    expect(raci?.responsible).toBe("aetherion");
    expect(raci?.reviewer).toBe("vee");
    expect(raci?.contributors).toContain("vee");
  });

  it("routes code to shuri with triage review", () => {
    const raci = requiredSpecialists("code");
    expect(raci?.responsible).toBe("shuri");
    expect(raci?.reviewer).toBe("triage");
  });

  it("returns null for unknown", () => {
    expect(requiredSpecialists("unknown")).toBeNull();
  });
});

describe("checkDefinitionOfDone", () => {
  it("flags placeholder text", () => {
    const failures = checkDefinitionOfDone("external-comms", "Hi [insert name], lorem ipsum");
    expect(failures.some((f) => /placeholder/i.test(f))).toBe(true);
  });

  it("flags client creative with no brand reference", () => {
    const failures = checkDefinitionOfDone(
      "client-facing-creative",
      "Here is the finished swim pitch.",
    );
    expect(failures.some((f) => /brand-asset/i.test(f))).toBe(true);
  });

  it("passes creative that references the brand kit", () => {
    const failures = checkDefinitionOfDone(
      "client-facing-creative",
      "Pitch using the Mettle brand kit, logo and palette #0e0e18.",
    );
    expect(failures).toHaveLength(0);
  });
});

describe("evaluateDeliverable — the swim-pitch incident", () => {
  it("BLOCKS a high-stakes creative the orchestrator made solo, off-brand", () => {
    const result = evaluateDeliverable({
      task: "Make the swim pitch deck for the client",
      reply: "Done — here is the swim pitch.",
      producer: "atlas",
    });
    expect(result.deliverableClass).toBe("client-facing-creative");
    expect(result.stakes).toBe("S2");
    expect(result.verdict).toBe("block");
    // Both failure modes should be cited: no brand reference + delegation skipped.
    expect(result.reasons.join(" ")).toMatch(/brand-asset/i);
    expect(result.reasons.join(" ")).toMatch(/Delegation skipped/i);
  });

  it("downgrades to REVIEW when the right owner produced an on-brand deliverable", () => {
    const result = evaluateDeliverable({
      task: "Make the swim pitch deck for the client",
      reply: "Pitch built with the Mettle brand kit, logo, on-brand palette.",
      producer: "aetherion",
    });
    expect(result.verdict).toBe("review");
    expect(result.reasons.join(" ")).toMatch(/independent review by @vee/i);
  });

  it("PASSES low-stakes internal scratch", () => {
    const result = evaluateDeliverable({
      task: "jot a quick internal note about the meeting",
      reply: "noted.",
    });
    expect(result.verdict).toBe("pass");
  });
});

describe("formatGateNotice", () => {
  it("returns empty string for a pass", () => {
    const result = evaluateDeliverable({ task: "internal scratch note", reply: "ok" });
    expect(formatGateNotice(result)).toBe("");
  });

  it("renders a BLOCK directive with do-not-report language", () => {
    const result = evaluateDeliverable({
      task: "swim pitch deck for client",
      reply: "done",
      producer: "atlas",
    });
    const notice = formatGateNotice(result);
    expect(notice).toMatch(/BLOCK/);
    expect(notice).toMatch(/do NOT report this as done/i);
  });
});
