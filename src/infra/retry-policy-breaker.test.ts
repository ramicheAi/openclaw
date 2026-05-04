import { describe, expect, it, vi } from "vitest";

import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";
import type { RetryRunner } from "./retry-policy.js";
import { withBreaker } from "./retry-policy-breaker.js";

const passthroughRunner: RetryRunner = <T>(fn: () => Promise<T>) => fn();

describe("withBreaker", () => {
  it("passes successful calls through", async () => {
    const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1_000 });
    const run = withBreaker(passthroughRunner, breaker);

    await expect(run(async () => 42)).resolves.toBe(42);
    expect(breaker.snapshot().state).toBe("closed");
  });

  it("opens circuit after threshold consecutive failures", async () => {
    let clock = 0;
    const breaker = new CircuitBreaker({
      threshold: 2,
      cooldownMs: 1_000,
      now: () => clock,
    });
    const run = withBreaker(passthroughRunner, breaker);

    const boom = async () => {
      throw new Error("boom");
    };

    await expect(run(boom)).rejects.toThrow("boom");
    await expect(run(boom)).rejects.toThrow("boom");
    // Circuit should now be open
    await expect(run(boom)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(breaker.snapshot().state).toBe("open");
  });

  it("blocks calls without invoking fn when open", async () => {
    let clock = 0;
    const breaker = new CircuitBreaker({
      threshold: 1,
      cooldownMs: 5_000,
      now: () => clock,
    });
    const run = withBreaker(passthroughRunner, breaker);

    await expect(
      run(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");

    const fn = vi.fn(async () => "ok");
    await expect(run(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("probes after cooldown and closes on success", async () => {
    let clock = 0;
    const breaker = new CircuitBreaker({
      threshold: 1,
      cooldownMs: 1_000,
      now: () => clock,
    });
    const run = withBreaker(passthroughRunner, breaker);

    await expect(
      run(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    expect(breaker.snapshot().state).toBe("open");

    clock += 1_000;
    await expect(run(async () => "ok")).resolves.toBe("ok");
    expect(breaker.snapshot().state).toBe("closed");
  });

  it("forwards label argument to underlying runner", async () => {
    const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1_000 });
    const runner = vi.fn<RetryRunner>(<T>(fn: () => Promise<T>) => fn());
    const run = withBreaker(runner, breaker);

    await run(async () => "x", "my-label");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[1]).toBe("my-label");
  });
});
