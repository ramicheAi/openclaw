import { describe, expect, it } from "vitest";

import { formatDraft } from "./platform.js";
import { approve, canSend, enqueueDraft, listByStatus, memoryPostStore, type QueuedPost, reject } from "./post-queue.js";

const fmt = (caption: string, hashtags: string[] = []) => formatDraft({ platform: "instagram_reels", caption, hashtags });
const enq = (store: ReturnType<typeof memoryPostStore>, caption: string, id = "p1") =>
  enqueueDraft(store, { draft: fmt(caption), id, createdAt: "2026-06-23T00:00:00Z" });

describe("enqueueDraft", () => {
  it("always lands as 'draft' — never pre-approved", async () => {
    const store = memoryPostStore();
    const post = await enq(store, "Proof first. Book the weekend.");
    expect(post.status).toBe("draft");
    expect(post.approvedBy).toBeUndefined();
  });

  it("refuses to queue copy that violates the brand rule", async () => {
    const store = memoryPostStore();
    await expect(enq(store, "the site sees what you see — live")).rejects.toThrow(/brand-rule/);
    expect(await listByStatus(store, "draft")).toHaveLength(0);
  });
});

describe("the send gate", () => {
  it("a fresh draft can NEVER be sent", async () => {
    const store = memoryPostStore();
    const post = await enq(store, "clean caption here");
    expect(canSend(post).ok).toBe(false);
    expect(canSend(post).reason).toContain("not 'approved'");
  });

  it("only an explicit human approval makes a post sendable", async () => {
    const store = memoryPostStore();
    await enq(store, "clean caption here");
    const approved = await approve(store, "p1", "Ramon");
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("Ramon");
    expect(canSend(approved).ok).toBe(true);
  });

  it("rejects approval with no named approver", async () => {
    const store = memoryPostStore();
    await enq(store, "clean caption here");
    await expect(approve(store, "p1", "  ")).rejects.toThrow(/named human approver/);
  });

  it("an 'approved' status with no approver on record still cannot send (defense in depth)", () => {
    const forged: QueuedPost = {
      id: "x",
      platform: "tiktok",
      caption: "c",
      hashtags: [],
      status: "approved",
      createdAt: "2026-06-23T00:00:00Z",
      // approvedBy deliberately absent
    };
    expect(canSend(forged).ok).toBe(false);
    expect(canSend(forged).reason).toContain("no human approver");
  });

  it("a rejected draft cannot send", async () => {
    const store = memoryPostStore();
    await enq(store, "clean caption here");
    const r = await reject(store, "p1", "off-brand");
    expect(canSend(r).ok).toBe(false);
  });
});
