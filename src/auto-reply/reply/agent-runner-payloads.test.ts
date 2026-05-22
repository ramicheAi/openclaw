import { describe, expect, it } from "vitest";

import { buildReplyPayloads } from "./agent-runner-payloads.js";

const basePayload = { text: "hello world" };

const baseParams = {
  payloads: [basePayload],
  isHeartbeat: false,
  didLogHeartbeatStrip: false,
  blockStreamingEnabled: false,
  blockReplyPipeline: null,
  replyToMode: "off" as const,
};

describe("buildReplyPayloads — draft-stream gating", () => {
  it("keeps final payloads when draft stream is active but never delivered", () => {
    // The double-message bug: draft stream existed (e.g. Telegram DM) but the
    // model returned its reply without streaming partials, so the draft never
    // emitted anything. Final payloads must NOT be dropped — otherwise the
    // user gets total silence.
    const { replyPayloads } = buildReplyPayloads({
      ...baseParams,
      draftStreamActive: true,
      draftStreamDidDeliver: () => false,
    });
    expect(replyPayloads).toHaveLength(1);
    expect(replyPayloads[0]?.text).toBe("hello world");
  });

  it("drops final payloads when draft stream actually delivered", () => {
    const { replyPayloads } = buildReplyPayloads({
      ...baseParams,
      draftStreamActive: true,
      draftStreamDidDeliver: () => true,
    });
    expect(replyPayloads).toHaveLength(0);
  });

  it("keeps final payloads when draftStreamActive is false", () => {
    const { replyPayloads } = buildReplyPayloads({
      ...baseParams,
      draftStreamActive: false,
    });
    expect(replyPayloads).toHaveLength(1);
  });

  it("keeps final payloads when draftStreamActive is true but didDeliver callback is missing", () => {
    // Defensive default: absent callback => assume not delivered, keep finals.
    const { replyPayloads } = buildReplyPayloads({
      ...baseParams,
      draftStreamActive: true,
    });
    expect(replyPayloads).toHaveLength(1);
  });
});
