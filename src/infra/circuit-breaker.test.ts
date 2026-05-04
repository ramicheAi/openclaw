import { describe, expect, it } from "vitest";
import { CircuitBreaker, CircuitBreakerRegistry, CircuitOpenError } from "./circuit-breaker.js";

function makeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("CircuitBreaker", () => {
  it("starts closed and stays closed on success", async () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    const result = await cb.exec(async () => "ok");
    expect(result).toBe("ok");
    expect(cb.snapshot().state).toBe("closed");
    expect(cb.snapshot().consecutiveFailures).toBe(0);
  });

  it("opens after threshold consecutive failures", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000, now: clock.now });
    const boom = async () => {
      throw new Error("boom");
    };
    await expect(cb.exec(boom)).rejects.toThrow("boom");
    await expect(cb.exec(boom)).rejects.toThrow("boom");
    expect(cb.snapshot().state).toBe("closed");
    await expect(cb.exec(boom)).rejects.toThrow("boom");
    expect(cb.snapshot().state).toBe("open");
  });

  it("blocks calls while open and throws CircuitOpenError", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 5000, now: clock.now });
    await expect(
      cb.exec(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(cb.snapshot().state).toBe("open");

    let called = false;
    await expect(
      cb.exec(async () => {
        called = true;
        return "never";
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
  });

  it("transitions to half-open after cooldown and closes on success", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000, now: clock.now });
    await expect(
      cb.exec(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(cb.snapshot().state).toBe("open");

    clock.advance(1500);
    const result = await cb.exec(async () => "probe-ok");
    expect(result).toBe("probe-ok");
    expect(cb.snapshot().state).toBe("closed");
    expect(cb.snapshot().consecutiveFailures).toBe(0);
  });

  it("re-opens immediately if probe fails in half-open", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000, now: clock.now });
    await expect(
      cb.exec(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    clock.advance(1500);
    await expect(
      cb.exec(async () => {
        throw new Error("still-bad");
      }),
    ).rejects.toThrow("still-bad");
    expect(cb.snapshot().state).toBe("open");
  });

  it("reset() returns to closed state", async () => {
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 9999 });
    await expect(
      cb.exec(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow();
    expect(cb.snapshot().state).toBe("open");
    cb.reset();
    expect(cb.snapshot().state).toBe("closed");
    expect(cb.snapshot().consecutiveFailures).toBe(0);
  });

  it("CircuitOpenError carries retryAfterMs", async () => {
    const clock = makeClock();
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 2000, now: clock.now });
    await expect(
      cb.exec(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow();
    clock.advance(500);
    try {
      await cb.exec(async () => "nope");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError);
      const ce = err as CircuitOpenError;
      expect(ce.retryAfterMs).toBeGreaterThan(0);
      expect(ce.retryAfterMs).toBeLessThanOrEqual(1500);
    }
  });
});

describe("CircuitBreakerRegistry", () => {
  it("reuses breakers by name", () => {
    const reg = new CircuitBreakerRegistry();
    const a = reg.get("discord");
    const b = reg.get("discord");
    expect(a).toBe(b);
  });

  it("resets all or by name", async () => {
    const reg = new CircuitBreakerRegistry();
    const a = reg.get("a", { threshold: 1 });
    const b = reg.get("b", { threshold: 1 });
    await expect(
      a.exec(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow();
    await expect(
      b.exec(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow();
    expect(a.snapshot().state).toBe("open");
    expect(b.snapshot().state).toBe("open");

    reg.reset("a");
    expect(a.snapshot().state).toBe("closed");
    expect(b.snapshot().state).toBe("open");

    reg.reset();
    expect(b.snapshot().state).toBe("closed");
  });
});
