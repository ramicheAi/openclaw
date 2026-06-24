import { describe, expect, it, vi } from "vitest";

import { buildCaptionPrompt, generateCaption, type Generator } from "./generate.js";

describe("buildCaptionPrompt", () => {
  it("bakes in CATALYST hook doctrine, the brand rule, and the platform spec", () => {
    const p = buildCaptionPrompt({ platform: "tiktok", topic: "open water weekend", proof: "240 swimmers" });
    expect(p).toContain("CATALYST");
    expect(p).toContain("Proof");
    expect(p).toContain("NEVER use an em dash");
    expect(p).toContain("240 swimmers");
    expect(p).toContain("2200 characters"); // tiktok caption limit
  });
});

describe("generateCaption — brand safety enforced during generation", () => {
  it("returns immediately when the first attempt is brand-clean", async () => {
    const gen: Generator = vi.fn(async () => "Proof first. Book the weekend. See you in the water.");
    const r = await generateCaption({ platform: "instagram_reels", topic: "x" }, gen);
    expect(r.attempts).toBe(1);
    expect(r.brandClean).toBe(true);
    expect(gen).toHaveBeenCalledOnce();
  });

  it("regenerates when the model emits a dash, then accepts the clean rewrite", async () => {
    let n = 0;
    const gen: Generator = vi.fn(async () => (++n === 1 ? "The site sees what you see — live" : "The site sees what you see. Live."));
    const r = await generateCaption({ platform: "tiktok", topic: "live sky" }, gen);
    expect(r.attempts).toBe(2);
    expect(r.brandClean).toBe(true);
    expect(r.caption).not.toContain("—");
  });

  it("gives up after maxAttempts and flags it not brand-clean (never silently ships a dash)", async () => {
    const gen: Generator = vi.fn(async () => "always uses a dash — like this");
    const r = await generateCaption({ platform: "x", topic: "y" }, gen, 2);
    expect(r.attempts).toBe(2);
    expect(r.brandClean).toBe(false);
  });
});
