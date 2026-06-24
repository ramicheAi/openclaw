import { describe, expect, it } from "vitest";

import { countUnsupported, evidenceReport, parseVerdicts, stripUnsupported } from "./evidence.js";

describe("parseVerdicts", () => {
  it("parses claims with valid verdicts and drops invalid ones", () => {
    const raw = '{"claims":[{"claim":"A","verdict":"supported"},{"claim":"B","verdict":"unsupported"},{"claim":"C","verdict":"bogus"}]}';
    const v = parseVerdicts(raw);
    expect(v).toEqual([
      { claim: "A", verdict: "supported" },
      { claim: "B", verdict: "unsupported" },
    ]);
  });
  it("returns [] on garbage", () => {
    expect(parseVerdicts("not json")).toEqual([]);
    expect(parseVerdicts('{"claims":"nope"}')).toEqual([]);
  });
});

describe("countUnsupported", () => {
  it("counts only unsupported verdicts — the measured hallucination number", () => {
    expect(
      countUnsupported([
        { claim: "A", verdict: "supported" },
        { claim: "B", verdict: "unsupported" },
        { claim: "C", verdict: "unverifiable" },
        { claim: "D", verdict: "unsupported" },
      ]),
    ).toBe(2);
  });
});

describe("stripUnsupported", () => {
  it("hedges unsupported claims found verbatim and leaves supported text intact", () => {
    const out = stripUnsupported("The pool is 10 lanes. The event is in Boca.", [
      { claim: "The pool is 10 lanes", verdict: "unsupported" },
      { claim: "The event is in Boca", verdict: "supported" },
    ]);
    expect(out).toContain("⟨unverified: The pool is 10 lanes⟩");
    expect(out).toContain("The event is in Boca.");
  });
});

describe("evidenceReport", () => {
  it("bundles claims, count, and cleaned answer", () => {
    const r = evidenceReport("X is 5. Y is 9.", '{"claims":[{"claim":"X is 5","verdict":"unsupported"}]}');
    expect(r.unsupported).toBe(1);
    expect(r.cleaned).toContain("⟨unverified: X is 5⟩");
  });
});
