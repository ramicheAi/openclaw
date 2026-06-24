// poster.ts — the send layer.
//
// `publishApproved` is the ONLY path that turns an approved draft into a posted one. It
// re-enforces the human gate at the actual send point (defense in depth — not just at
// approval time), then dispatches to a PlatformPoster and records the result. Real
// platform adapters (TikTok / Instagram / X) implement the same `PlatformPoster`
// interface and drop in behind this same gate once credentials exist.
//
// The default poster is a DRY-RUN that logs the payload and never touches a network, so
// the full loop is exercisable end-to-end with zero risk of anything leaking out.

import type { Platform } from "./platform.js";
import { canSend, markPosted, type PostStore, type QueuedPost } from "./post-queue.js";

export interface PostResult {
  ok: boolean;
  platform: Platform;
  externalId?: string;
  error?: string;
}

export interface PlatformPoster {
  // Performs the live post. publishApproved guarantees this is only ever called for a
  // post that passed canSend(), so implementations need not re-check the gate.
  post(post: QueuedPost): Promise<PostResult>;
}

// Safe default: simulates a post (logs it), never makes a network call. Used until real
// platform adapters + credentials are wired.
export function dryRunPoster(sink: (line: string) => void = (l) => console.log(l)): PlatformPoster {
  return {
    post: async (p) => {
      sink(`[DRY-RUN POST] ${p.platform} ${p.id}: ${p.caption.replace(/\s+/g, " ").slice(0, 80)}`);
      return { ok: true, platform: p.platform, externalId: `dryrun-${p.id}` };
    },
  };
}

// The send dispatcher. Refuses anything that isn't human-approved, posts it, and marks
// it posted only on success.
export async function publishApproved(store: PostStore, poster: PlatformPoster, id: string): Promise<PostResult> {
  const post = (await store.load()).find((p) => p.id === id);
  if (!post) throw new Error(`no draft ${id}`);
  const gate = canSend(post);
  if (!gate.ok) throw new Error(`refusing to publish ${id}: ${gate.reason}`);
  const result = await poster.post(post);
  if (result.ok) await markPosted(store, id, result.externalId);
  return result;
}
