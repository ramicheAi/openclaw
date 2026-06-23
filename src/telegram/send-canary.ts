/**
 * Canary wrapper around Telegram send.
 *
 * Adds:
 *   - retry with exponential backoff (max 3 attempts)
 *   - per-chat-id circuit breaker
 *   - structured failure events (console.warn)
 *
 * Does NOT modify src/telegram/send.ts. Composes with the existing send
 * via an injected `sendFn`, so the wrapper is testable in isolation.
 */

import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
} from "../infra/circuit-breaker.js";
import { retryAsync, type RetryConfig } from "../infra/retry.js";

export type CanarySendResult = {
  messageId: string;
  chatId: string;
};

/**
 * Shape of the underlying send function. Compatible with
 * `sendMessageTelegram(to, text, opts?)` from ./send.ts.
 */
export type CanarySendFn = (
  to: string,
  text: string,
  opts?: Record<string, unknown>,
) => Promise<CanarySendResult>;

export type CanaryFailureEvent = {
  kind: "retry" | "circuit-open" | "failed" | "attempt";
  chatId: string;
  attempt: number;
  maxAttempts: number;
  delayMs?: number;
  error?: unknown;
  message: string;
};

export type CanarySendOptions = {
  /** Max retry attempts across the retry ladder. Default 3. */
  retryAttempts?: number;
  /** Minimum delay between retries (ms). Default 50. */
  minDelayMs?: number;
  /** Maximum delay between retries (ms). Default 5_000. */
  maxDelayMs?: number;
  /** Failures before per-chat breaker opens. Default 5. */
  breakerThreshold?: number;
  /** Cooldown ms before breaker probes. Default 30_000. */
  breakerCooldownMs?: number;
  /** Clock override for tests (used by circuit breakers). */
  now?: () => number;
  /** Classifier for whether an error should be retried. Default: retry 5xx/network. */
  shouldRetry?: (err: unknown) => boolean;
  /** Emit structured failure/attempt event. Default: console.warn. */
  onEvent?: (event: CanaryFailureEvent) => void;
  /** Registry of per-chat breakers. If omitted, a module-local one is used. */
  breakers?: CircuitBreakerRegistry;
};

/** Shared module-scope registry so all canary calls share per-chat breakers. */
const defaultRegistry = new CircuitBreakerRegistry();

/**
 * Get (or lazily create) the breaker for a given chat id inside a registry.
 * Kept small so it's easy to inject in tests.
 */
function breakerForChat(
  registry: CircuitBreakerRegistry,
  chatId: string,
  threshold: number,
  cooldownMs: number,
  now?: () => number,
): CircuitBreaker {
  return registry.get(`telegram:${chatId}`, {
    threshold,
    cooldownMs,
    ...(now ? { now } : {}),
  });
}

/** Default retry predicate: retry on 5xx, network, timeout; not on 4xx client errors. */
export function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  const any = err as {
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
    name?: string;
  };
  const status = any.status ?? any.statusCode;
  if (typeof status === "number") {
    // 4xx: client / non-retryable (bad request, not found, etc.)
    if (status >= 400 && status < 500) return false;
    // 5xx: server / retryable
    if (status >= 500) return true;
  }
  const code = any.code ?? "";
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENETUNREACH" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }
  const name = String(any.name ?? "").toLowerCase();
  if (name === "timeouterror" || name === "aborterror") return true;
  const rawMsg =
    any.message ?? (err instanceof Error ? err.message : typeof err === "string" ? err : "");
  const msg = rawMsg.toLowerCase();
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("socket")) return true;
  return false;
}

/**
 * Build a canary-wrapped send function.
 *
 * @param sendFn The raw send implementation (e.g. `sendMessageTelegram`).
 * @param options Canary behavior overrides.
 * @returns A drop-in replacement function with retry + circuit-breaker + events.
 */
export function createCanarySend(
  sendFn: CanarySendFn,
  options: CanarySendOptions = {},
): CanarySendFn {
  const retryAttempts = Math.max(1, Math.round(options.retryAttempts ?? 3));
  const minDelayMs = Math.max(0, Math.round(options.minDelayMs ?? 50));
  const maxDelayMs = Math.max(minDelayMs, Math.round(options.maxDelayMs ?? 5_000));
  const breakerThreshold = Math.max(1, Math.round(options.breakerThreshold ?? 5));
  const breakerCooldownMs = Math.max(0, Math.round(options.breakerCooldownMs ?? 30_000));
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  const registry = options.breakers ?? defaultRegistry;
  const emit =
    options.onEvent ??
    ((e) => {
      // Default sink: structured console warn. Skip "attempt" noise unless failing.
      if (e.kind === "attempt") return;
      console.warn(`[telegram-canary] ${e.message}`, {
        kind: e.kind,
        chatId: e.chatId,
        attempt: e.attempt,
        maxAttempts: e.maxAttempts,
        delayMs: e.delayMs,
      });
    });

  return async function canarySend(to, text, opts): Promise<CanarySendResult> {
    // Empty/whitespace input: pass through unchanged so the underlying send
    // decides (it throws a clear error). The wrapper should not transform input.
    const chatId = typeof to === "string" ? to : String(to ?? "");

    const breaker = breakerForChat(
      registry,
      chatId || "__unknown__",
      breakerThreshold,
      breakerCooldownMs,
      options.now,
    );

    const retryConfig: RetryConfig = {
      attempts: retryAttempts,
      minDelayMs,
      maxDelayMs,
      jitter: 0,
    };

    let attemptCount = 0;

    try {
      return await breaker.exec(async () =>
        retryAsync(
          async () => {
            attemptCount += 1;
            emit({
              kind: "attempt",
              chatId,
              attempt: attemptCount,
              maxAttempts: retryAttempts,
              message: `attempt ${attemptCount}/${retryAttempts} for ${chatId}`,
            });
            return sendFn(to, text, opts);
          },
          {
            ...retryConfig,
            label: `telegram-canary:${chatId}`,
            shouldRetry: (err, attempt) => {
              const canRetry = shouldRetry(err);
              if (!canRetry) {
                emit({
                  kind: "failed",
                  chatId,
                  attempt,
                  maxAttempts: retryAttempts,
                  error: err,
                  message: `non-retryable error on attempt ${attempt}: ${String((err as Error)?.message ?? err)}`,
                });
              }
              return canRetry;
            },
            onRetry: (info) => {
              emit({
                kind: "retry",
                chatId,
                attempt: info.attempt,
                maxAttempts: info.maxAttempts,
                delayMs: info.delayMs,
                error: info.err,
                message: `retry ${info.attempt}/${info.maxAttempts} after ${info.delayMs}ms: ${String((info.err as Error)?.message ?? info.err)}`,
              });
            },
          },
        ),
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        emit({
          kind: "circuit-open",
          chatId,
          attempt: attemptCount,
          maxAttempts: retryAttempts,
          error: err,
          message: `circuit open for ${chatId}, retry after ${err.retryAfterMs}ms`,
        });
        throw err;
      }
      emit({
        kind: "failed",
        chatId,
        attempt: attemptCount,
        maxAttempts: retryAttempts,
        error: err,
        message: `send failed for ${chatId} after ${attemptCount} attempt(s): ${String((err as Error)?.message ?? err)}`,
      });
      throw err;
    }
  };
}

/** Exported only for tests; resets the shared registry. */
export function __resetCanaryRegistryForTests(): void {
  defaultRegistry.reset();
}
