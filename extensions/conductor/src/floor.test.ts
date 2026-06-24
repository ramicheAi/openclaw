import { describe, expect, it, vi } from "vitest";

import { applyQualityFloor, type BlindScorer, parseScores, pickFloor } from "./floor.js";

describe("pickFloor", () => {
  it("keeps the merge when it scores at least as high as the best draft", () => {
    const r = pickFloor({ text: "merged", score: 9 }, [
      { label: "d0", text: "a", score: 7 },
      { label: "d1", text: "b", score: 8 },
    ]);
    expect(r.reverted).toBe(false);
    expect(r.final).toBe("merged");
  });

  it("reverts to the best draft when the merge regressed", () => {
    const r = pickFloor({ text: "bad merge", score: 5 }, [
      { label: "d0", text: "good draft", score: 9 },
      { label: "d1", text: "ok", score: 6 },
    ]);
    expect(r.reverted).toBe(true);
    expect(r.final).toBe("good draft");
    expect(r.bestDraftLabel).toBe("d0");
  });
});

describe("applyQualityFloor — blind scoring", () => {
  it("scores merged + drafts under anonymized ids and reverts a regression", async () => {
    // scorer gives the merge (c0) a low score, draft c1 a high one
    const scorer: BlindScorer = vi.fn(async (items) => {
      const out: Record<string, number> = {};
      for (const it of items) out[it.id] = it.id === "c0" ? 4 : it.id === "c1" ? 9 : 5;
      return out;
    });
    const r = await applyQualityFloor("the merge", [{ label: "A", text: "draft A" }, { label: "B", text: "draft B" }], scorer);
    expect(r.reverted).toBe(true);
    expect(r.final).toBe("draft A");
    // the scorer saw anonymized ids only (c0 is the merge — it could not tell)
    const passed = (scorer as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ id: string }>;
    expect(passed.map((p) => p.id)).toEqual(["c0", "c1", "c2"]);
  });

  it("is a no-op with no drafts", async () => {
    const scorer: BlindScorer = vi.fn(async () => ({}));
    const r = await applyQualityFloor("solo answer", [], scorer);
    expect(r.reverted).toBe(false);
    expect(scorer).not.toHaveBeenCalled();
  });
});

describe("parseScores", () => {
  it("extracts an id→score map and coerces numeric strings", () => {
    expect(parseScores('{"c0":7,"c1":"9"}')).toEqual({ c0: 7, c1: 9 });
    expect(parseScores("no json")).toEqual({});
  });
});
