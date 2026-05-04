/**
 * Canary-enabled delivery wrapper.
 *
 * Does NOT modify delivery.ts or send.ts. Instead, provides an opt-in
 * deliverRepliesCanary() that wraps the underlying bot.api.sendMessage
 * path with the canary retry + circuit-breaker using createCanarySend.
 *
 * Usage: consumers can call deliverRepliesCanary(params) as a drop-in
 * replacement for deliverReplies() when canary semantics are desired.
 */

import type { Bot } from "grammy";
import { deliverReplies } from "./delivery.js";
import { createCanarySend, type CanarySendFn } from "../send-canary.js";
import { traceSend } from "./trace-sends.js";
import type { ReplyPayload } from "../../auto-reply/types.js";
import type { ReplyToMode } from "../../config/config.js";
import type { MarkdownTableMode } from "../../config/types.base.js";
import type { ChunkMode } from "../../auto-reply/chunk.js";
import type { RuntimeEnv } from "../../runtime.js";

// Marker property used by `wrapBotWithCanary` to detect (and refuse) a second
// wrap of the same grammy `bot.api` object. A silent second wrap would layer
// two Proxies and each would fire `originalSend`, delivering the message
// twice. Refusing the second wrap surfaces the bug immediately instead.
const CANARY_MARK = Symbol.for("openclaw.telegram.canary-wrapped");

type DeliverParams = {
  replies: ReplyPayload[];
  chatId: string;
  token: string;
  runtime: RuntimeEnv;
  bot: Bot;
  replyToMode: ReplyToMode;
  textLimit: number;
  messageThreadId?: number;
  tableMode?: MarkdownTableMode;
  chunkMode?: ChunkMode;
  onVoiceRecording?: () => Promise<void> | void;
  linkPreview?: boolean;
  replyQuoteText?: string;
};

/**
 * Wrap bot.api.sendMessage with the canary retry + circuit-breaker.
 * Uses a Proxy so only sendMessage is intercepted; all other bot.api
 * methods pass through unchanged.
 *
 * Double-send safety:
 *   - The canary retry will call `originalSend` multiple times only on
 *     retryable failures (5xx/network/timeout). One successful attempt
 *     produces one delivered message.
 *   - The Proxy handler never falls back to a second `originalSend` when
 *     the canary reports success. Falling back would silently duplicate
 *     a message that the canary already delivered. If the canary ever
 *     completes without a captured grammy Message (impossible via the
 *     current code path), we throw instead of re-sending.
 *   - If a bot is already canary-wrapped, we return it as-is instead of
 *     wrapping again — a second Proxy layer would invoke the underlying
 *     `originalSend` once per layer on a single call.
 */
function wrapBotWithCanary(bot: Bot): Bot {
  // Refuse to double-wrap: two layered Proxies would each call originalSend
  // and deliver the same message twice.
  const alreadyMarked = (bot as unknown as Record<symbol, boolean>)[CANARY_MARK];
  if (alreadyMarked) return bot;

  const originalSend = bot.api.sendMessage.bind(bot.api);

  // Capture the grammy response from within canarySend so the Proxy
  // handler can return it without re-calling originalSend.
  let lastGrammyResult: Awaited<ReturnType<typeof originalSend>> | null = null;

  const canarySend: CanarySendFn = async (to, text, opts) => {
    const res = await originalSend(to, text, opts as Parameters<typeof originalSend>[2]);
    lastGrammyResult = res;
    return { messageId: String(res.message_id), chatId: String(to) };
  };

  const wrapped = createCanarySend(canarySend);

  const patchedApi = new Proxy(bot.api, {
    get(target, prop, receiver) {
      if (prop === "sendMessage") {
        return async (
          chatId: Parameters<typeof originalSend>[0],
          text: Parameters<typeof originalSend>[1],
          opts?: Parameters<typeof originalSend>[2],
        ) => {
          traceSend("proxy.sendMessage", { chatId: String(chatId), text });
          lastGrammyResult = null;
          await wrapped(String(chatId), text, opts as Record<string, unknown> | undefined);
          if (!lastGrammyResult) {
            // The canary completed without capturing a grammy Message. This
            // is an impossible state under the current canarySend + retry
            // implementation (success means originalSend resolved and
            // lastGrammyResult was assigned). We refuse to silently fall
            // back to a second originalSend: if the canary DID deliver, a
            // fallback would duplicate the message on Telegram.
            traceSend("canary.fallback", {
              chatId: String(chatId),
              text,
              note: "refusing to fall back",
            });
            throw new Error(
              "delivery-canary: send completed but no grammy Message was captured; refusing to fall back to avoid duplicate delivery",
            );
          }
          return lastGrammyResult;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const wrappedBot = new Proxy(bot, {
    get(target, prop, receiver) {
      if (prop === CANARY_MARK) return true;
      if (prop === "api") return patchedApi;
      return Reflect.get(target, prop, receiver);
    },
  }) as Bot;

  return wrappedBot;
}

/**
 * Drop-in replacement for deliverReplies that routes the sendMessage
 * call through the canary wrapper (retry + circuit breaker).
 */
export async function deliverRepliesCanary(params: DeliverParams): Promise<{ delivered: boolean }> {
  const wrappedBot = wrapBotWithCanary(params.bot);
  return deliverReplies({ ...params, bot: wrappedBot });
}
