import { describe, expect, it } from "vitest";
import {
  classifyDeliverable,
  evaluateDeliverable,
  formatGateNotice,
  inferStakes,
  inspectArtifactText,
  isShippable,
  recommendedSpecialists,
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

  it("does not misclassify a POST handler/route as external-comms", () => {
    expect(classifyDeliverable("Refactor the POST handler and add a route")).toBe("code");
    expect(classifyDeliverable("Implement a POST API endpoint")).toBe("code");
  });

  it("still classifies a social post as external-comms", () => {
    expect(classifyDeliverable("Schedule a post for the launch")).toBe("external-comms");
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

  it("raises stakes when the reply reveals external/brand markers despite an 'internal' framing", () => {
    expect(
      inferStakes("internal draft", undefined, "Final deck attached for the client launch"),
    ).toBe("S2");
  });
});

describe("recommendedSpecialists", () => {
  it("recommends aetherion as responsible and vee as reviewer for creative", () => {
    const raci = recommendedSpecialists("client-facing-creative");
    expect(raci?.responsible).toBe("aetherion");
    expect(raci?.reviewer).toBe("vee");
    expect(raci?.contributors).toContain("vee");
  });

  it("recommends shuri with triage review for code", () => {
    const raci = recommendedSpecialists("code");
    expect(raci?.responsible).toBe("shuri");
    expect(raci?.reviewer).toBe("triage");
  });

  it("returns null for unknown", () => {
    expect(recommendedSpecialists("unknown")).toBeNull();
  });
});

describe("inspectArtifactText — evidence from the real artifact, not the reply", () => {
  it("flags placeholder text found in the artifact", () => {
    const ev = inspectArtifactText("external-comms", "Hi [insert name], lorem ipsum");
    expect(ev.placeholdersFound).toBe(true);
  });

  it("reports brand usage as verified when the artifact carries brand markers", () => {
    const ev = inspectArtifactText(
      "client-facing-creative",
      "<svg fill='#0e0e18'><image href='mettle-logo.svg'/></svg>",
    );
    expect(ev.brandAssetsVerified).toBe(true);
    expect(ev.placeholdersFound).toBe(false);
  });

  it("reports brand usage as NOT verified when the artifact has no brand markers", () => {
    const ev = inspectArtifactText("client-facing-creative", "<h1>Swim faster</h1><p>Join us.</p>");
    expect(ev.brandAssetsVerified).toBe(false);
  });

  it("does NOT flag TODO/FIXME in code as a placeholder defect", () => {
    const ev = inspectArtifactText("code", "function f() { // TODO: optimize\n return 1; }");
    expect(ev.placeholdersFound).toBeUndefined();
  });
});

describe("evaluateDeliverable — the swim-pitch incident", () => {
  const swimTask = "Make the swim pitch deck for the client";

  it("does NOT block solo creative on delegation alone — it surfaces a routing recommendation", () => {
    const result = evaluateDeliverable({
      task: swimTask,
      reply: "Done — here is the swim pitch.",
      producer: "atlas",
    });
    expect(result.deliverableClass).toBe("client-facing-creative");
    expect(result.stakes).toBe("S2");
    // No artifact evidence ⇒ verification owed, not an outright block.
    expect(result.verdict).toBe("review");
    expect(result.recommendation).toMatch(/@aetherion/i);
    expect(result.reasons.join(" ")).not.toMatch(/Delegation skipped/i);
  });

  it("BLOCKS when the inspected artifact does not actually use the brand kit", () => {
    const result = evaluateDeliverable({
      task: swimTask,
      reply: "Pitch built with the Mettle brand kit and palette #0e0e18.", // claim only
      producer: "atlas",
      evidence: { brandAssetsVerified: false, placeholdersFound: false },
    });
    expect(result.verdict).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/does not actually use the brand kit/i);
  });

  it("text claims in the reply never clear the gate — only inspected evidence can", () => {
    const result = evaluateDeliverable({
      task: swimTask,
      reply: "Pitch built with the Mettle brand kit, logo and on-brand palette #0e0e18.",
      producer: "aetherion",
      // no evidence supplied
    });
    expect(result.verdict).toBe("review");
    expect(result.evidenceMissing.join(" ")).toMatch(/brand-kit usage not verified/i);
  });

  it("PASSES when every required fact is inspected good and an independent reviewer approved", () => {
    const result = evaluateDeliverable({
      task: swimTask,
      reply: "Pitch ready.",
      producer: "aetherion",
      evidence: {
        brandAssetsVerified: true,
        placeholdersFound: false,
        reviewerSignedOff: true,
        reviewedBy: "vee",
      },
    });
    expect(result.verdict).toBe("pass");
    expect(isShippable(result)).toBe(true);
  });

  it("BLOCKS when the reviewer is the same agent that produced the work", () => {
    const result = evaluateDeliverable({
      task: swimTask,
      reply: "Pitch ready.",
      producer: "aetherion",
      evidence: {
        brandAssetsVerified: true,
        placeholdersFound: false,
        reviewerSignedOff: true,
        reviewedBy: "aetherion",
      },
    });
    expect(result.verdict).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/review must be independent/i);
  });

  it("requires a HUMAN reviewer at S3 even when an agent signed off", () => {
    const result = evaluateDeliverable({
      task: "Review this client contract for compliance before we send it",
      reply: "Reviewed.",
      producer: "themis",
      evidence: {
        placeholdersFound: false,
        reviewerSignedOff: true,
        reviewedBy: "dr-strange",
      },
    });
    expect(result.stakes).toBe("S3");
    expect(result.verdict).toBe("review");
    expect(result.evidenceMissing.join(" ")).toMatch(/human reviewer/i);
  });

  it("does NOT block high-stakes code just because the artifact contains TODO/FIXME", () => {
    const result = evaluateDeliverable({
      task: "Deploy the production endpoint refactor",
      reply: "Shipped /src/handler.ts",
      producer: "shuri",
      // inspector did not flag placeholders for code (placeholdersFound undefined)
      evidence: { reviewerSignedOff: true, reviewedBy: "triage" },
    });
    expect(result.deliverableClass).toBe("code");
    expect(result.stakes).toBe("S2");
    expect(result.verdict).toBe("pass");
  });

  it("PASSES low-stakes internal scratch", () => {
    const result = evaluateDeliverable({
      task: "jot a quick internal note about the meeting",
      reply: "noted.",
    });
    expect(result.verdict).toBe("pass");
    expect(isShippable(result)).toBe(true);
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
      evidence: { brandAssetsVerified: false, placeholdersFound: false },
    });
    const notice = formatGateNotice(result);
    expect(notice).toMatch(/BLOCK/);
    expect(notice).toMatch(/do NOT report this as done/i);
  });

  it("renders a VERIFICATION OWED directive when evidence is missing", () => {
    const result = evaluateDeliverable({
      task: "swim pitch deck for client",
      reply: "done",
      producer: "atlas",
    });
    const notice = formatGateNotice(result);
    expect(notice).toMatch(/VERIFICATION OWED/);
  });
});
