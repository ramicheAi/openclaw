import os from "node:os";
import path from "node:path";

import { Type } from "@sinclair/typebox";

import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

import { formatDraft, type Platform } from "./platform.js";
import { enqueueDraft, filePostStore, listByStatus, type PostStore } from "./post-queue.js";

const QUEUE_PATH = path.join(os.homedir(), ".openclaw", "social", "queue.json");

const PLATFORM_ENUM = ["tiktok", "instagram_reels", "instagram_feed", "x", "youtube_shorts", "linkedin"];

function store(api: OpenClawPluginApi): PostStore {
  const cfg = (api.pluginConfig ?? {}) as { queuePath?: string };
  return filePostStore(cfg.queuePath ?? QUEUE_PATH);
}

// social_draft — format a post to platform spec + the brand rule and QUEUE it as a DRAFT.
// It can never send. Brand-violating copy is refused (returned for rewrite, not queued).
export function createSocialDraftTool(api: OpenClawPluginApi) {
  return {
    name: "social_draft",
    label: "Social Draft",
    description:
      "Prepare a platform-correct, brand-safe social post and queue it as a DRAFT for human review. " +
      "Formats to the platform's caption/hashtag/aspect limits and lints against the locked Parallax no-AI-syntax " +
      "rule (no dashes/ellipses). Refuses to queue copy that violates the brand rule. NEVER posts — sending is " +
      "human-gated and not agent-reachable.",
    parameters: Type.Object({
      platform: Type.Unsafe<Platform>({ type: "string", enum: PLATFORM_ENUM, description: "Target platform." }),
      caption: Type.String({ description: "The caption/copy for the post." }),
      hashtags: Type.Optional(Type.Array(Type.String(), { description: "Hashtags (with or without #)." })),
      mediaPath: Type.Optional(Type.String({ description: "Path to the finished media asset." })),
      mediaAspect: Type.Optional(Type.String({ description: "Aspect ratio of the media, e.g. '9:16'." })),
      scheduledFor: Type.Optional(Type.String({ description: "Optional ISO datetime the human intends to post." })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const draft = formatDraft({
        platform: params.platform as Platform,
        caption: String(params.caption ?? ""),
        hashtags: Array.isArray(params.hashtags) ? (params.hashtags as string[]) : undefined,
        mediaPath: params.mediaPath ? String(params.mediaPath) : undefined,
        mediaAspect: params.mediaAspect ? String(params.mediaAspect) : undefined,
      });

      if (!draft.valid) {
        return {
          content: [
            {
              type: "text" as const,
              text: `NOT QUEUED — brand-rule violations (rewrite the copy): ${draft.brandIssues.map((b) => `${b.count}× ${b.label}`).join(", ")}`,
            },
          ],
          details: { queued: false, brandIssues: draft.brandIssues, warnings: draft.warnings },
        };
      }

      const id = `post-${Date.now()}`;
      const post = await enqueueDraft(store(api), {
        draft,
        id,
        createdAt: new Date().toISOString(),
        mediaPath: draft.platform && params.mediaPath ? String(params.mediaPath) : undefined,
        scheduledFor: params.scheduledFor ? String(params.scheduledFor) : undefined,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Queued draft ${id} for ${post.platform} (status: draft, awaiting human approval).\n\n${post.caption}${draft.warnings.length ? `\n\n⚠︎ ${draft.warnings.join("; ")}` : ""}`,
          },
        ],
        details: { queued: true, id, status: post.status, warnings: draft.warnings },
      };
    },
  };
}

// social_queue — list drafts awaiting review. Read-only.
export function createSocialQueueTool(api: OpenClawPluginApi) {
  return {
    name: "social_queue",
    label: "Social Queue",
    description: "List queued social drafts awaiting human review (status: draft or approved). Read-only.",
    parameters: Type.Object({}),
    async execute(_id: string, _params: Record<string, unknown>) {
      const s = store(api);
      const drafts = await listByStatus(s, "draft");
      const approved = await listByStatus(s, "approved");
      const lines = [...drafts, ...approved].map((p) => `[${p.status}] ${p.id} · ${p.platform} · ${p.caption.slice(0, 60)}`);
      return {
        content: [{ type: "text" as const, text: lines.length ? lines.join("\n") : "queue empty" }],
        details: { drafts: drafts.length, approved: approved.length },
      };
    },
  };
}
