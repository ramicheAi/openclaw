import { describe, expect, it } from "vitest";

import {
  addLesson,
  bestModeFor,
  emptyState,
  injectLessons,
  lessonsFor,
  memoryStore,
  recordRun,
  taskKind,
} from "./learning.js";

describe("taskKind", () => {
  it("classifies by keyword", () => {
    expect(taskKind("refactor this async function and fix the bug")).toBe("code");
    expect(taskKind("write a blog post headline")).toBe("writing");
    expect(taskKind("compare these two strategies and assess tradeoffs")).toBe("analysis");
    expect(taskKind("what year was the release date and cite the source")).toBe("factual");
    expect(taskKind("hello there")).toBe("other");
  });
});

describe("recordRun + bestModeFor", () => {
  it("returns null until there are enough runs to trust", () => {
    let s = emptyState();
    s = recordRun(s, { kind: "code", mode: "relay", success: true });
    s = recordRun(s, { kind: "code", mode: "relay", success: true });
    expect(bestModeFor(s, "code")).toBeNull(); // < 3 runs
    s = recordRun(s, { kind: "code", mode: "relay", success: true });
    expect(bestModeFor(s, "code")).toBe("relay");
  });

  it("credits only clean runs and picks the winningest mode", () => {
    let s = emptyState();
    s = recordRun(s, { kind: "analysis", mode: "panel", success: true });
    s = recordRun(s, { kind: "analysis", mode: "panel", success: true });
    s = recordRun(s, { kind: "analysis", mode: "trinity", success: false }); // failed → no credit
    s = recordRun(s, { kind: "analysis", mode: "trinity", success: true });
    expect(bestModeFor(s, "analysis")).toBe("panel");
    expect(s.byKind.analysis.runs).toBe(4);
    expect(s.byKind.analysis.clean).toBe(3);
  });

  it("does not mutate the input state (pure)", () => {
    const s0 = emptyState();
    const s1 = recordRun(s0, { kind: "code", mode: "solo", success: true });
    expect(s0.byKind.code).toBeUndefined();
    expect(s1.byKind.code?.runs).toBe(1);
  });
});

describe("lessons", () => {
  it("dedupes, caps, and injects known failure modes into a prompt", () => {
    let s = emptyState();
    s = addLesson(s, "code", "forgot the null check");
    s = addLesson(s, "code", "forgot the null check"); // dup ignored
    s = addLesson(s, "code", "off-by-one in the loop");
    expect(lessonsFor(s, "code")).toHaveLength(2);
    const injected = injectLessons("Solve the task.", s, "code");
    expect(injected).toContain("Known failure modes for code");
    expect(injected).toContain("forgot the null check");
    expect(injected).toContain("Solve the task.");
  });
});

describe("memoryStore", () => {
  it("round-trips state and isolates copies", async () => {
    const store = memoryStore();
    const loaded = await store.load();
    await store.save(recordRun(loaded, { kind: "writing", mode: "solo", success: true }));
    const again = await store.load();
    expect(again.byKind.writing?.runs).toBe(1);
    // mutating a loaded copy must not corrupt the store
    again.byKind.writing!.runs = 999;
    expect((await store.load()).byKind.writing?.runs).toBe(1);
  });
});
