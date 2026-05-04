# Circuit Breaker — Usage Guide

Opt-in protection against retry storms. Wraps any `RetryRunner` so repeated failures open the circuit and block calls during a cooldown window, preventing the "250K-call failure mode" from Claude Code's leak analysis.

## Files

- `circuit-breaker.ts` — core breaker (states: closed → open → half-open → closed), registry, `CircuitOpenError`
- `retry-policy-breaker.ts` — `withBreaker(runner, breaker)` wrapper for `RetryRunner`
- `circuit-breaker.test.ts` — 9 tests (transitions, cooldown, reset, retry-after)
- `retry-policy-breaker.test.ts` — 5 tests (passthrough, threshold, blocked-without-invoke, probe→close, label forwarding)

## Quick Start

```ts
import { createCircuitBreaker } from './circuit-breaker';
import { withBreaker } from './retry-policy-breaker';
import { createTelegramRunner } from './retry-policy';

// 1. Create breaker (one per provider/runner, lives at module scope)
const telegramBreaker = createCircuitBreaker({
  failureThreshold: 5,       // open after 5 consecutive failures
  cooldownMs: 60_000,        // block calls for 60s once open
  halfOpenMaxProbes: 1,      // allow 1 probe in half-open state
});

// 2. Wrap existing runner
const rawRunner = createTelegramRunner();
const runner = withBreaker(rawRunner, telegramBreaker);

// 3. Use normally — no API change
await runner.run(() => fetch('https://api.telegram.org/...'));
```

## When It Trips

The breaker opens when the underlying runner fails `failureThreshold` times in a row (after all retries exhausted). Subsequent calls throw `CircuitOpenError` immediately — no retries, no attempts — with `retryAfterMs` telling consumers when to try again.

After cooldown, the breaker transitions to half-open. The next call is a probe. Success → closed. Failure → open (fresh cooldown).

## Opt-In Wiring (per-consumer)

To wire at a construction site, replace:

```ts
const runner = createTelegramRunner();
```

with:

```ts
const breaker = getOrCreateBreaker('telegram', { failureThreshold: 5, cooldownMs: 60_000 });
const runner = withBreaker(createTelegramRunner(), breaker);
```

`getOrCreateBreaker` lives in `circuit-breaker.ts` and returns a singleton per label, so every call site for "telegram" shares state.

## Why Opt-In (Not Auto-Wired)

Auto-wiring would require editing every construction site in `telegram/send.ts`, `discord/send.shared.ts`, `discord/monitor/provider.ts`. The library is ready; wiring is a separate, reversible decision per provider. Ship incrementally — start with Telegram, observe, then Discord.

## Rollback

If a breaker misbehaves, remove the `withBreaker(...)` wrapper — original `RetryRunner` behavior returns. No state pollution, no cleanup required.

## Tests

```bash
cd /Users/admin/openclaw-src
npm test -- circuit-breaker
npm test -- retry-policy-breaker
```

All 14 tests must pass before wiring any consumer.
