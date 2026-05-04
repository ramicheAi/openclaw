/**
 * Wiring layer: wraps retry runners with a circuit breaker.
 *
 * Separate from retry-policy.ts and circuit-breaker.ts — composes them
 * without mutating either. Opt-in via explicit constructor call.
 *
 * Use:
 *   const protectedRun = withBreaker(
 *     createTelegramRetryRunner({ ... }),
 *     registry.get("telegram", { threshold: 5, cooldownMs: 30_000 }),
 *   );
 */

import type { CircuitBreaker } from "./circuit-breaker.js";
import type { RetryRunner } from "./retry-policy.js";

/**
 * Wrap a RetryRunner so every call passes through a circuit breaker.
 * When the breaker is open, calls throw CircuitOpenError without retrying.
 */
export function withBreaker(runner: RetryRunner, breaker: CircuitBreaker): RetryRunner {
  return <T>(fn: () => Promise<T>, label?: string) => breaker.exec(() => runner(fn, label));
}
