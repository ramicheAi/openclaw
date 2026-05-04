import { describe, expect, it, vi } from "vitest";
import type { Bot } from "grammy";
import { deliverRepliesCanary } from "./delivery-canary.js";
import { __resetCanaryRegistryForTests } from "../send-canary.js";

/**
 * Minimal fake grammy bot surface. We only need the methods touched by
 * deliverReplies() and the canary Proxy. The fake counts raw sendMessage
 * invocations so we can prove the canary does not double-send.
 */
function makeFakeBot(opts?: { failFirstN?: number }) {
  let sendCount = 0;
  let nextId = 1;
  let failuresLeft = opts?.failFirstN ?? 0;
  const sendMessage = vi.fn(async (_chatId: unknown, text: string) => {
    sendCount += 1;
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      const err = Object.assign(new Error("boom 500"), { status: 500 });
      throw err;
    }
    return { message_id: nextId++, text };
  });
  const api = {
    sendMessage,
    sendAnimation: vi.fn(),
    sendPhoto: vi.fn(),
    sendVideo: vi.fn(),
    sendVoice: vi.fn(),
    sendAudio: vi.fn(),
    sendDocument: vi.fn(),
    config: { use: () => {} },
  };
  const bot = { api } as unknown as Bot;
  return { bot, api, sendMessage, getSendCount: () => sendCount };
}

const baseParams = {
  chatId: "chat-123",
  token: "tok",
  runtime: {},
  replyToMode: "off" as const,
  textLimit: 4000,
  tableMode: undefined,
  chunkMode: "length" as const,
  linkPreview: false,
};

describe("deliverRepliesCanary / wrapBotWithCanary", () => {
  it("delivers one text reply with exactly one raw sendMessage", async () => {
    __resetCanaryRegistryForTests();
    const { bot, getSendCount } = makeFakeBot();
    const res = await deliverRepliesCanary({
      ...baseParams,
      bot,
      replies: [{ text: "hello world" }],
    });
    expect(res.delivered).toBe(true);
    expect(getSendCount()).toBe(1);
  });

  it("delivers two sequential replies with exactly two raw sendMessages", async () => {
    __resetCanaryRegistryForTests();
    const { bot, getSendCount } = makeFakeBot();
    await deliverRepliesCanary({ ...baseParams, bot, replies: [{ text: "one" }] });
    await deliverRepliesCanary({ ...baseParams, bot, replies: [{ text: "two" }] });
    expect(getSendCount()).toBe(2);
  });

  it("does NOT double-send under concurrent dispatches on the same bot", async () => {
    // Each deliverRepliesCanary call creates its own wrapper Proxy; even if
    // two calls race, the per-call closures must not leak state into each
    // other (the regression we're guarding against).
    __resetCanaryRegistryForTests();
    const { bot, getSendCount } = makeFakeBot();
    await Promise.all([
      deliverRepliesCanary({ ...baseParams, bot, replies: [{ text: "a" }] }),
      deliverRepliesCanary({ ...baseParams, bot, replies: [{ text: "b" }] }),
      deliverRepliesCanary({ ...baseParams, bot, replies: [{ text: "c" }] }),
    ]);
    expect(getSendCount()).toBe(3);
  });

  it("retries a retryable failure exactly once and delivers exactly one final message", async () => {
    __resetCanaryRegistryForTests();
    const { bot, getSendCount } = makeFakeBot({ failFirstN: 1 });
    const res = await deliverRepliesCanary({
      ...baseParams,
      bot,
      replies: [{ text: "retry me" }],
    });
    expect(res.delivered).toBe(true);
    // 1 failed attempt + 1 successful attempt = 2 raw sendMessage calls,
    // which is the INTENDED canary retry behavior (not a duplicate).
    expect(getSendCount()).toBe(2);
  });

  it("refuses to double-wrap an already-wrapped bot (no layered Proxies)", async () => {
    // Layering two canary Proxies on the same bot would make every call
    // fire originalSend twice (one per layer). Confirm the second wrap is
    // a no-op: only one real sendMessage per call.
    __resetCanaryRegistryForTests();
    const { bot, getSendCount } = makeFakeBot();
    // First call wraps, second call would normally wrap again inside its
    // deliverRepliesCanary. We simulate that by calling the exported
    // wrap+deliver twice with the same shared bot and verify per-call
    // send counts.
    await deliverRepliesCanary({ ...baseParams, bot, replies: [{ text: "x" }] });
    await deliverRepliesCanary({ ...baseParams, bot, replies: [{ text: "y" }] });
    expect(getSendCount()).toBe(2);
  });
});
