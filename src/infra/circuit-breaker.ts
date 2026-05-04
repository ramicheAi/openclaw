/**
 * Circuit breaker for stopping retry storms.
 *
 * Wraps a runner (e.g., a provider call). Tracks consecutive failures.
 * When failures >= threshold, circuit opens and blocks calls for cooldownMs.
 * After cooldown, enters half-open: next call is a probe. Success closes,
 * failure re-opens.
 *
 * States: closed (normal) -> open (blocked) -> half-open (probe) -> closed|open
 */

export type CircuitState = "closed" | "open" | "half-open";

export type CircuitBreakerConfig = {
  /** Failures before opening. Default 5. */
  threshold?: number;
  /** Cooldown window in ms before probing. Default 30_000. */
  cooldownMs?: number;
  /** Optional label for logging. */
  label?: string;
  /** Clock override for tests. */
  now?: () => number;
};

export type CircuitBreakerSnapshot = {
  label?: string;
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  lastFailure: unknown;
};

export class CircuitOpenError extends Error {
  readonly state: CircuitState = "open";
  readonly retryAfterMs: number;
  constructor(label: string | undefined, retryAfterMs: number) {
    super(`Circuit${label ? ` [${label}]` : ""} is open; retry after ${retryAfterMs}ms`);
    this.name = "CircuitOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

const DEFAULTS = {
  threshold: 5,
  cooldownMs: 30_000,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private lastFailure: unknown = null;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly label?: string;
  private readonly now: () => number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.threshold = Math.max(1, Math.round(config.threshold ?? DEFAULTS.threshold));
    this.cooldownMs = Math.max(0, Math.round(config.cooldownMs ?? DEFAULTS.cooldownMs));
    this.label = config.label;
    this.now = config.now ?? (() => Date.now());
  }

  snapshot(): CircuitBreakerSnapshot {
    return {
      label: this.label,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      lastFailure: this.lastFailure,
    };
  }

  /** Force-reset to closed (e.g., after manual intervention). */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.lastFailure = null;
  }

  /**
   * Check if a call is allowed right now. Also transitions open -> half-open
   * when the cooldown has elapsed. Does NOT mutate on closed/half-open calls.
   */
  private allowCall(): { allowed: true } | { allowed: false; retryAfterMs: number } {
    if (this.state === "closed") return { allowed: true };
    if (this.state === "half-open") return { allowed: true };

    const elapsed = this.openedAt === null ? Infinity : this.now() - this.openedAt;
    if (elapsed >= this.cooldownMs) {
      this.state = "half-open";
      return { allowed: true };
    }
    return { allowed: false, retryAfterMs: Math.max(0, this.cooldownMs - elapsed) };
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.lastFailure = null;
    this.state = "closed";
    this.openedAt = null;
  }

  private onFailure(err: unknown): void {
    this.lastFailure = err;
    if (this.state === "half-open") {
      this.state = "open";
      this.openedAt = this.now();
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.threshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }

  /**
   * Execute fn under the circuit breaker.
   * Throws CircuitOpenError without calling fn when open.
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const gate = this.allowCall();
    if (!gate.allowed) {
      throw new CircuitOpenError(this.label, gate.retryAfterMs);
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }
}

/** Simple registry for named breakers (e.g., per-provider). */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  get(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    const existing = this.breakers.get(name);
    if (existing) return existing;
    const breaker = new CircuitBreaker({ label: name, ...config });
    this.breakers.set(name, breaker);
    return breaker;
  }

  snapshot(): CircuitBreakerSnapshot[] {
    return Array.from(this.breakers.values()).map((b) => b.snapshot());
  }

  reset(name?: string): void {
    if (name) {
      this.breakers.get(name)?.reset();
      return;
    }
    for (const b of this.breakers.values()) b.reset();
  }
}
