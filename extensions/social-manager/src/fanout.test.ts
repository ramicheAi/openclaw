import { describe, expect, it, vi } from "vitest";

import { ALL_PLATFORMS, fanout } from "./fanout.js";
import { type Generator } from "./generate.js";

describe("fanout", () => {
  it("produces one platform-correct draft per target platform", async () => {
    const gen: Generator = vi.fn(async () => "Proof first. Book the open water weekend today.");
    const items = await fanout({ topic: "SCOWW" }, ["tiktok", "x", "linkedin"], gen);
    expect(items.map((i) => i.platform)).toEqual(["tiktok", "x", "linkedin"]);
    expect(items.every((i) => i.draft.valid)).toBe(true);
    // one generation per platform
    expect((gen as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("formats each draft to its OWN platform limit (x is short, tiktok is long)", async () => {
    const long = "word ".repeat(120); // 600 chars, brand-clean
    const gen: Generator = vi.fn(async () => long);
    const items = await fanout({ topic: "t" }, ["x", "tiktok"], gen);
    const x = items.find((i) => i.platform === "x")!;
    const tt = items.find((i) => i.platform === "tiktok")!;
    expect(x.draft.caption.length).toBeLessThanOrEqual(280); // x limit
    expect(tt.draft.caption.length).toBeGreaterThan(280); // tiktok allows much more
  });

  it("flags a platform whose copy stayed brand-dirty after retries", async () => {
    const gen: Generator = vi.fn(async () => "still has a dash — here");
    const items = await fanout({ topic: "t" }, ["instagram_reels"], gen, );
    expect(items[0]!.brandClean).toBe(false);
    expect(items[0]!.draft.valid).toBe(false);
  });

  it("exposes the full platform set", () => {
    expect(ALL_PLATFORMS).toContain("tiktok");
    expect(ALL_PLATFORMS).toContain("youtube_shorts");
    expect(ALL_PLATFORMS.length).toBe(6);
  });
});
