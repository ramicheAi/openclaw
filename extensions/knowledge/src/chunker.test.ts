import { describe, expect, it } from "vitest";

import { chunkText } from "./chunker.js";

describe("chunkText", () => {
  it("returns [] for empty or whitespace-only input", () => {
    expect(chunkText("", { tokens: 100, overlap: 10 })).toEqual([]);
    expect(chunkText("   \n  \t\n", { tokens: 100, overlap: 10 })).toEqual([]);
  });

  it("keeps short text as a single chunk with index 0", () => {
    const chunks = chunkText("hello world", { tokens: 100, overlap: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ text: "hello world", index: 0 });
  });

  it("splits a multi-paragraph string into multiple sequential chunks", () => {
    // Six paragraphs, each ~30 chars. tokens:10 => ~40 char budget, so each
    // chunk holds roughly one paragraph and we get several chunks.
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Paragraph number ${i} content here.`);
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, { tokens: 10, overlap: 2 });

    expect(chunks.length).toBeGreaterThan(1);
    // Indices are contiguous starting at 0.
    chunks.forEach((c, i) => expect(c.index).toBe(i));
    // Every chunk is non-empty and within a reasonable bound of the budget.
    for (const c of chunks) {
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.text.length).toBeLessThanOrEqual(40 + 40); // budget + one carried line
    }
  });

  it("carries overlapping lines between adjacent chunks when overlap > 0", () => {
    const lines = Array.from({ length: 8 }, (_, i) => `line-${i}-aaaaaaaa`).join("\n");
    const withOverlap = chunkText(lines, { tokens: 8, overlap: 4 });
    const noOverlap = chunkText(lines, { tokens: 8, overlap: 0 });

    expect(withOverlap.length).toBeGreaterThan(1);
    // Overlap re-emits boundary lines, so the total reconstructed length is
    // strictly greater than the zero-overlap version.
    const lenWith = withOverlap.reduce((n, c) => n + c.text.length, 0);
    const lenNo = noOverlap.reduce((n, c) => n + c.text.length, 0);
    expect(lenWith).toBeGreaterThan(lenNo);

    // A concrete overlap check: some line at the end of chunk k reappears at the
    // start of chunk k+1.
    let sawSharedLine = false;
    for (let k = 0; k < withOverlap.length - 1; k++) {
      const tail = withOverlap[k].text.split("\n").at(-1);
      const head = withOverlap[k + 1].text.split("\n")[0];
      if (tail && tail === head) sawSharedLine = true;
    }
    expect(sawSharedLine).toBe(true);
  });

  it("hard-splits a single line longer than the budget", () => {
    const longLine = "x".repeat(200); // 200 chars
    const chunks = chunkText(longLine, { tokens: 10, overlap: 0 }); // 40-char budget
    expect(chunks.length).toBe(5);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(40);
  });
});
