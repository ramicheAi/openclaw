import { describe, expect, it } from "vitest";
import { GATEWAY_RECONNECT_MAX_BACKOFF_MS, planGatewayReconnect } from "./client.js";

describe("planGatewayReconnect", () => {
  it("retries forever by default (Infinity max) — never gives up after a blip", () => {
    // The exact regression from the 'cap reconnect attempts at 10' commit:
    // a long outage must not permanently disable the client.
    for (const attempts of [1, 10, 11, 100, 10_000]) {
      const plan = planGatewayReconnect({
        attempts,
        maxAttempts: Number.POSITIVE_INFINITY,
        backoffMs: 1000,
      });
      expect(plan.giveUp).toBe(false);
    }
  });

  it("gives up only when a finite cap is explicitly set and exceeded", () => {
    expect(planGatewayReconnect({ attempts: 10, maxAttempts: 10, backoffMs: 1000 }).giveUp).toBe(
      false,
    );
    expect(planGatewayReconnect({ attempts: 11, maxAttempts: 10, backoffMs: 1000 }).giveUp).toBe(
      true,
    );
  });

  it("uses the current backoff as the delay and doubles it, capped at the ceiling", () => {
    const first = planGatewayReconnect({
      attempts: 1,
      maxAttempts: Number.POSITIVE_INFINITY,
      backoffMs: 1000,
    });
    expect(first.delayMs).toBe(1000);
    expect(first.nextBackoffMs).toBe(2000);

    const capped = planGatewayReconnect({
      attempts: 50,
      maxAttempts: Number.POSITIVE_INFINITY,
      backoffMs: GATEWAY_RECONNECT_MAX_BACKOFF_MS,
    });
    expect(capped.nextBackoffMs).toBe(GATEWAY_RECONNECT_MAX_BACKOFF_MS);
  });
});
