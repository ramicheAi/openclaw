import { describe, expect, it } from "vitest";

import { parseSuite } from "./suite.js";

describe("parseSuite", () => {
  it("parses a valid suite with all matcher kinds", () => {
    const { suite, errors } = parseSuite({
      name: "demo",
      cases: [
        { id: "a", input: "hi", expect: { contains: ["hi"] }, tags: ["smoke"] },
        { id: "b", input: "x", expect: { equals: "y" } },
        { id: "c", input: "z", expect: { criteria: "is polite", minScore: 0.8 } },
      ],
    });
    expect(errors).toEqual([]);
    expect(suite.name).toBe("demo");
    expect(suite.cases).toHaveLength(3);
    expect(suite.cases[0].tags).toEqual(["smoke"]);
    expect(suite.cases[2].expect.minScore).toBe(0.8);
  });

  it("skips invalid cases with errors but keeps the good ones", () => {
    const { suite, errors } = parseSuite({
      name: "mixed",
      cases: [
        { id: "ok", input: "in", expect: { contains: ["in"] } },
        { input: "no-id", expect: { contains: ["x"] } },
        { id: "no-input", expect: { contains: ["x"] } },
        { id: "empty-expect", input: "i", expect: {} },
        { id: "ok", input: "dup", expect: { contains: ["x"] } }, // duplicate id
        "not-an-object",
      ],
    });
    expect(suite.cases.map((c) => c.id)).toEqual(["ok"]);
    expect(errors).toHaveLength(5);
  });

  it("clamps an out-of-range minScore into 0..1", () => {
    const { suite } = parseSuite({
      name: "clamp",
      cases: [{ id: "a", input: "x", expect: { criteria: "c", minScore: 5 } }],
    });
    expect(suite.cases[0].expect.minScore).toBe(1);
  });

  it("defaults a missing name and records it", () => {
    const { suite, errors } = parseSuite({ cases: [] });
    expect(suite.name).toBe("unnamed-suite");
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("tolerates junk input without throwing", () => {
    expect(() => parseSuite(undefined)).not.toThrow();
    expect(() => parseSuite("nope")).not.toThrow();
    expect(() => parseSuite(42)).not.toThrow();
    expect(parseSuite(undefined).suite.cases).toEqual([]);
    expect(parseSuite({ name: "x", cases: "notarray" }).errors.length).toBeGreaterThan(0);
  });
});
