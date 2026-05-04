import { describe, expect, it, vi } from "vitest";
import { CircuitBreakerRegistry, CircuitOpenError } from "../infra/circuit-breaker.js";
import {
  createCanarySend,
  isRetryableError,
  type CanaryFailureEvent,
  type CanarySendFn,
  type CanarySendResult,
} from "./send-canary.js";

function ok(messageId = "1", chatId = "chat"): CanarySendResult {
  return { messageId, chatId };
}

function makeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** Build a canary with fast delays + isolated registry + event capture. */
function makeCanary(sendFn: CanarySendFn, extra: Parameters<typeof createCanarySend>[1] = {}) {
  const events: CanaryFailureEvent[] = [];
  const breakers = new CircuitBreakerRegistry();
  const wrapped = createCanarySend(sendFn, {
    retryAttempts: 3,
    minDelayMs: 1,
    maxDelayMs: 4,
    breakerThreshold: 3,
    breakerCooldownMs: 1000,
    breakers,
    onEvent: (e) => events.push(e),
    ...extra,
  });
  return { wrapped, events, breakers };
}

describe("send-canary", () => {
  it("1. Success on first attempt", async () => {
    const sendFn = vi.fn().mockResolvedValueOnce(ok("m1", "c1"));
    const { wrapped, events } = makeCanary(sendFn);
    const res = await wrapped("c1", "hi");
    expect(res).toEqual({ messageId: "m1", chatId: "c1" });
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.kind === "retry")).toHaveLength(0);
  });

  it("2. Success after one retry", async () => {
    const sendFn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("boom 500"), { status: 500 }))
      .mockResolvedValueOnce(ok("m2", "c2"));
    const { wrapped, events } = makeCanary(sendFn);
    const res = await wrapped("c2", "hi");
    expect(res.messageId).toBe("m2");
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.kind === "retry")).toHaveLength(1);
  });

  it("3. Success after two retries", async () => {
    const err = Object.assign(new Error("boom 502"), { status: 502 });
    const sendFn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(ok("m3", "c3"));
    const { wrapped, events } = makeCanary(sendFn);
    const res = await wrapped("c3", "hi");
    expect(res.messageId).toBe("m3");
    expect(sendFn).toHaveBeenCalledTimes(3);
    expect(events.filter((e) => e.kind === "retry")).toHaveLength(2);
  });

  it("4. Failure after 3 retries", async () => {
    const err = Object.assign(new Error("boom 503"), { status: 503 });
    const sendFn = vi.fn().mockRejectedValue(err);
    const { wrapped, events } = makeCanary(sendFn, { breakerThreshold: 999 });
    await expect(wrapped("c4", "hi")).rejects.toThrow("boom 503");
    expect(sendFn).toHaveBeenCalledTimes(3);
    expect(events.some((e) => e.kind === "failed")).toBe(true);
  });

  it("5. Circuit opens after N failures for a given chat", async () => {
    // Breaker opens on exec-level failures. Each call that bubbles out of retry
    // counts as one breaker failure. With threshold=2 and non-retryable errors
    // (to avoid the retry attempts being eaten), two calls open the circuit.
    const err = Object.assign(new Error("bad 400"), { status: 400 });
    const sendFn = vi.fn().mockRejectedValue(err);
    const { wrapped, breakers } = makeCanary(sendFn, {
      breakerThreshold: 2,
    });
    await expect(wrapped("chatA", "hi")).rejects.toThrow("bad 400");
    await expect(wrapped("chatA", "hi")).rejects.toThrow("bad 400");
    const snap = breakers.snapshot().find((s) => s.label === "telegram:chatA");
    expect(snap?.state).toBe("open");
  });

  it("6. Circuit rejects calls when open", async () => {
    const err = Object.assign(new Error("bad 400"), { status: 400 });
    const sendFn = vi.fn().mockRejectedValue(err);
    const { wrapped, events } = makeCanary(sendFn, { breakerThreshold: 1 });
    await expect(wrapped("chatB", "hi")).rejects.toThrow("bad 400");
    const callsBefore = sendFn.mock.calls.length;
    await expect(wrapped("chatB", "hi")).rejects.toBeInstanceOf(CircuitOpenError);
    // When the circuit is open, sendFn must not be invoked again.
    expect(sendFn.mock.calls.length).toBe(callsBefore);
    expect(events.some((e) => e.kind === "circuit-open")).toBe(true);
  });

  it("7. Circuit resets after cooldown", async () => {
    const clock = makeClock();
    const err = Object.assign(new Error("bad 400"), { status: 400 });
    const sendFn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(ok("m7", "chatC"));
    const { wrapped, breakers } = makeCanary(sendFn, {
      breakerThreshold: 1,
      breakerCooldownMs: 500,
      now: clock.now,
    });
    await expect(wrapped("chatC", "hi")).rejects.toThrow("bad 400");
    expect(breakers.snapshot().find((s) => s.label === "telegram:chatC")?.state).toBe("open");
    // Advance past cooldown; half-open probe should succeed and close circuit.
    clock.advance(600);
    const res = await wrapped("chatC", "hi");
    expect(res.messageId).toBe("m7");
    expect(breakers.snapshot().find((s) => s.label === "telegram:chatC")?.state).toBe("closed");
  });

  it("8. Different chats have independent circuits", async () => {
    const err = Object.assign(new Error("bad 400"), { status: 400 });
    const sendFn = vi.fn().mockImplementation(async (to: string) => {
      if (to === "chatX") throw err;
      return ok("m8", to);
    });
    const { wrapped, breakers } = makeCanary(sendFn, { breakerThreshold: 1 });
    await expect(wrapped("chatX", "hi")).rejects.toThrow("bad 400");
    // chatX open, chatY must still succeed.
    const res = await wrapped("chatY", "hi");
    expect(res.chatId).toBe("chatY");
    const snaps = breakers.snapshot();
    const x = snaps.find((s) => s.label === "telegram:chatX");
    const y = snaps.find((s) => s.label === "telegram:chatY");
    expect(x?.state).toBe("open");
    expect(y?.state).toBe("closed");
  });

  it("9. Non-retryable errors don't retry (e.g., 4xx)", async () => {
    const err = Object.assign(new Error("bad 404"), { status: 404 });
    const sendFn = vi.fn().mockRejectedValue(err);
    const { wrapped } = makeCanary(sendFn, { breakerThreshold: 999 });
    await expect(wrapped("c9", "hi")).rejects.toThrow("bad 404");
    // Exactly one attempt — no retries on 4xx.
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it("10. Retryable errors retry (e.g., 5xx, network)", async () => {
    const netErr = Object.assign(new Error("econnreset"), { code: "ECONNRESET" });
    const srvErr = Object.assign(new Error("boom 500"), { status: 500 });
    const sendFn = vi
      .fn()
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(srvErr)
      .mockResolvedValueOnce(ok("m10", "c10"));
    const { wrapped } = makeCanary(sendFn);
    const res = await wrapped("c10", "hi");
    expect(res.messageId).toBe("m10");
    expect(sendFn).toHaveBeenCalledTimes(3);
    expect(isRetryableError(netErr)).toBe(true);
    expect(isRetryableError(srvErr)).toBe(true);
  });

  it("11. Empty input passes through unchanged", async () => {
    const sendFn = vi.fn().mockImplementation(async (to: string, text: string) => {
      // Simulate underlying send rejecting empty input.
      if (!to || !text) throw new Error("empty input");
      return ok("m11", to);
    });
    const { wrapped } = makeCanary(sendFn, { breakerThreshold: 999 });
    await expect(wrapped("", "hi")).rejects.toThrow("empty input");
    // The wrapper must forward args verbatim — no trimming, no default.
    expect(sendFn).toHaveBeenCalledWith("", "hi", undefined);
  });

  it("12. Timeout triggers retry", async () => {
    const timeout = Object.assign(new Error("request timeout"), {
      name: "TimeoutError",
      code: "ETIMEDOUT",
    });
    const sendFn = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(ok("m12", "c12"));
    const { wrapped, events } = makeCanary(sendFn);
    const res = await wrapped("c12", "hi");
    expect(res.messageId).toBe("m12");
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.kind === "retry")).toHaveLength(1);
  });

  it("13. Backoff delay increases", async () => {
    const err = Object.assign(new Error("boom 500"), { status: 500 });
    const sendFn = vi.fn().mockRejectedValue(err);
    const { wrapped, events } = makeCanary(sendFn, {
      retryAttempts: 3,
      minDelayMs: 10,
      maxDelayMs: 10_000,
      breakerThreshold: 999,
    });
    await expect(wrapped("c13", "hi")).rejects.toThrow("boom 500");
    const retries = events.filter((e) => e.kind === "retry");
    expect(retries).toHaveLength(2);
    // Exponential backoff: delay(attempt 2) > delay(attempt 1).
    expect(retries[1].delayMs!).toBeGreaterThan(retries[0].delayMs!);
    // Sanity: first delay matches minDelayMs * 2^0 = 10.
    expect(retries[0].delayMs).toBe(10);
    expect(retries[1].delayMs).toBe(20);
  });

  it("14. All attempts logged", async () => {
    const err = Object.assign(new Error("boom 500"), { status: 500 });
    const sendFn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(ok("m14", "c14"));
    const { wrapped, events } = makeCanary(sendFn);
    const res = await wrapped("c14", "hi");
    expect(res.messageId).toBe("m14");
    const attempts = events.filter((e) => e.kind === "attempt");
    expect(attempts).toHaveLength(3);
    expect(attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
    expect(attempts.every((a) => a.chatId === "c14")).toBe(true);
  });
});
