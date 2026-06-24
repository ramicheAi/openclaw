// post-queue.ts — the gated publish-to-post queue.
//
// COO hard rule: "sending public content is gated — drafts auto-prepared, SENDING is
// gated to Ramon." This module makes that an ENFORCED INVARIANT, not a guideline:
//   - enqueueDraft only ever creates status "draft" (never approved, never posted).
//   - canSend() returns ok ONLY when a human has explicitly approved (approvedBy set).
//   - There is no auto-approve and no agent-reachable send path. An agent can prepare,
//     format, and queue posts all day; it physically cannot push them live.
// The actual platform API call is intentionally NOT implemented here — so even an
// approved draft can't leak out until that integration is added deliberately, behind
// this same gate.
//
// Pure logic + an injectable store, so the gate is unit-tested offline.

import fs from "node:fs/promises";
import path from "node:path";

import type { FormattedDraft, Platform } from "./platform.js";

export type DraftStatus = "draft" | "approved" | "rejected" | "posted";

export interface QueuedPost {
  id: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
  mediaPath?: string;
  status: DraftStatus;
  createdAt: string;
  approvedBy?: string; // the human who approved — required to send
  scheduledFor?: string;
  note?: string;
}

export interface PostStore {
  load(): Promise<QueuedPost[]>;
  save(posts: QueuedPost[]): Promise<void>;
}

export interface EnqueueParams {
  draft: FormattedDraft;
  id: string; // caller supplies a stable id (e.g. timestamp-based) — no Date.now() here
  createdAt: string;
  mediaPath?: string;
  scheduledFor?: string;
}

// Always lands as "draft". A formatted draft that fails the brand lint is refused
// outright — broken copy never enters the queue.
export async function enqueueDraft(store: PostStore, params: EnqueueParams): Promise<QueuedPost> {
  if (!params.draft.valid) {
    throw new Error(`refusing to queue: brand-rule violations (${params.draft.brandIssues.map((b) => b.label).join(", ")})`);
  }
  const post: QueuedPost = {
    id: params.id,
    platform: params.draft.platform,
    caption: params.draft.caption,
    hashtags: params.draft.hashtags,
    mediaPath: params.mediaPath,
    status: "draft",
    createdAt: params.createdAt,
    scheduledFor: params.scheduledFor,
  };
  const posts = await store.load();
  posts.push(post);
  await store.save(posts);
  return post;
}

export async function listByStatus(store: PostStore, status: DraftStatus): Promise<QueuedPost[]> {
  return (await store.load()).filter((p) => p.status === status);
}

// Explicit human approval — the ONLY way a post becomes sendable. `approver` identifies
// who approved (audit trail); an empty approver is rejected.
export async function approve(store: PostStore, id: string, approver: string): Promise<QueuedPost> {
  if (!approver.trim()) throw new Error("approval requires a named human approver");
  const posts = await store.load();
  const post = posts.find((p) => p.id === id);
  if (!post) throw new Error(`no draft ${id}`);
  if (post.status === "posted") throw new Error(`draft ${id} already posted`);
  post.status = "approved";
  post.approvedBy = approver;
  await store.save(posts);
  return post;
}

export async function reject(store: PostStore, id: string, note?: string): Promise<QueuedPost> {
  const posts = await store.load();
  const post = posts.find((p) => p.id === id);
  if (!post) throw new Error(`no draft ${id}`);
  post.status = "rejected";
  if (note) post.note = note;
  await store.save(posts);
  return post;
}

// THE GATE. ok only if a human explicitly approved this exact post. Everything else
// (draft, rejected, already-posted, missing approver) is a hard no.
export function canSend(post: QueuedPost): { ok: boolean; reason?: string } {
  if (post.status !== "approved") return { ok: false, reason: `status is '${post.status}', not 'approved'` };
  if (!post.approvedBy?.trim()) return { ok: false, reason: "no human approver on record" };
  return { ok: true };
}

// In-memory store (tests / ephemeral).
export function memoryPostStore(initial: QueuedPost[] = []): PostStore {
  let posts = structuredClone(initial);
  return {
    load: async () => structuredClone(posts),
    save: async (p) => {
      posts = structuredClone(p);
    },
  };
}

// File-backed store (drafts survive gateway restarts; this is the queue a human reviews).
export function filePostStore(filePath: string): PostStore {
  return {
    load: async () => {
      try {
        return JSON.parse(await fs.readFile(filePath, "utf8")) as QueuedPost[];
      } catch {
        return [];
      }
    },
    save: async (posts) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(posts, null, 2));
    },
  };
}
