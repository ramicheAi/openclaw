import { describe, expect, it, vi } from "vitest";

import { approve, enqueueDraft, memoryPostStore, type PostStore } from "./post-queue.js";
import { formatDraft } from "./platform.js";
import { dryRunPoster, type PlatformPoster, publishApproved } from "./poster.js";

async function seedApproved(store: PostStore, approveIt: boolean) {
  const draft = formatDraft({ platform: "tiktok", caption: "Proof first. Book today." });
  await enqueueDraft(store, { draft, id: "p1", createdAt: "2026-06-24T00:00:00Z" });
  if (approveIt) await approve(store, "p1", "Ramon");
}

describe("dryRunPoster", () => {
  it("logs and returns ok without any network call", async () => {
    const lines: string[] = [];
    const r = await dryRunPoster((l) => lines.push(l)).post({
      id: "p1",
      platform: "tiktok",
      caption: "hi",
      hashtags: [],
      status: "approved",
      createdAt: "2026-06-24T00:00:00Z",
      approvedBy: "Ramon",
    });
    expect(r.ok).toBe(true);
    expect(r.externalId).toContain("dryrun");
    expect(lines[0]).toContain("DRY-RUN POST");
  });
});

describe("publishApproved — the gate at the send point", () => {
  it("REFUSES to publish a draft that no human approved (poster never called)", async () => {
    const store = memoryPostStore();
    await seedApproved(store, false); // queued but NOT approved
    const poster: PlatformPoster = { post: vi.fn(async () => ({ ok: true, platform: "tiktok" as const })) };
    await expect(publishApproved(store, poster, "p1")).rejects.toThrow(/refusing to publish/);
    expect(poster.post).not.toHaveBeenCalled();
  });

  it("publishes an approved draft and marks it posted", async () => {
    const store = memoryPostStore();
    await seedApproved(store, true);
    const poster: PlatformPoster = { post: vi.fn(async (p) => ({ ok: true, platform: p.platform, externalId: "ext-123" })) };
    const r = await publishApproved(store, poster, "p1");
    expect(r.ok).toBe(true);
    const [post] = await store.load();
    expect(post.status).toBe("posted");
    expect(post.externalId).toBe("ext-123");
  });

  it("does NOT mark posted when the poster fails", async () => {
    const store = memoryPostStore();
    await seedApproved(store, true);
    const poster: PlatformPoster = { post: vi.fn(async () => ({ ok: false, platform: "tiktok" as const, error: "api down" })) };
    const r = await publishApproved(store, poster, "p1");
    expect(r.ok).toBe(false);
    const [post] = await store.load();
    expect(post.status).toBe("approved"); // stays approved, retryable
  });
});
