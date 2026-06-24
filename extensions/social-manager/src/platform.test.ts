import { describe, expect, it } from "vitest";

import { brandLint, formatDraft, PLATFORMS } from "./platform.js";

describe("brandLint — the locked Parallax no-AI-syntax rule", () => {
  it("flags em/en dashes and ellipses", () => {
    const issues = brandLint("We win — always… really–truly...");
    const labels = issues.map((i) => i.label);
    expect(labels).toContain("em dash");
    expect(labels).toContain("en dash");
    expect(labels).toContain("ellipsis character");
    expect(labels).toContain("three-dot ellipsis");
  });
  it("passes clean copy", () => {
    expect(brandLint("Proof first. Then the offer. Book today.")).toEqual([]);
  });
});

describe("formatDraft", () => {
  it("caps hashtags to the platform best-practice and normalizes them", () => {
    const d = formatDraft({ platform: "tiktok", caption: "hook", hashtags: ["#a", "b", " c ", "#d", "e", "f", "g"] });
    expect(d.hashtags).toHaveLength(PLATFORMS.tiktok.maxHashtags);
    expect(d.hashtags.every((h) => h.startsWith("#") && !h.includes(" "))).toBe(true);
    expect(d.warnings.some((w) => w.includes("hashtags"))).toBe(true);
  });

  it("truncates an over-long caption to the platform limit with NO ellipsis", () => {
    const long = "word ".repeat(100); // 500 chars
    const d = formatDraft({ platform: "x", caption: long }); // x limit = 280
    expect(d.caption.length).toBeLessThanOrEqual(280);
    expect(d.caption).not.toContain("...");
    expect(d.caption).not.toContain("…");
    expect(d.warnings.some((w) => w.includes("truncated"))).toBe(true);
  });

  it("marks a draft invalid when the caption violates the brand rule", () => {
    const d = formatDraft({ platform: "instagram_reels", caption: "the website sees what you see — live" });
    expect(d.valid).toBe(false);
    expect(d.brandIssues.some((b) => b.label === "em dash")).toBe(true);
  });

  it("warns on an aspect-ratio mismatch with the platform", () => {
    const d = formatDraft({ platform: "tiktok", caption: "hi", mediaAspect: "1:1" });
    expect(d.warnings.some((w) => w.includes("9:16"))).toBe(true);
  });

  it("appends hashtags after the caption within the length budget", () => {
    const d = formatDraft({ platform: "instagram_feed", caption: "Boca open water weekend", hashtags: ["swim", "openwater"] });
    expect(d.valid).toBe(true);
    expect(d.caption).toContain("Boca open water weekend");
    expect(d.caption).toContain("#swim #openwater");
  });
});
