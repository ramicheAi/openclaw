// Configuration parsing for the agent-eval plugin.
//
// Parsing is intentionally defensive: unknown or malformed fields fall back to
// documented defaults rather than throwing, so a bad config value never breaks
// gateway boot. The plugin loader registers synchronously, so this runs at
// import time and must never throw.

export type ResponderKind = "command" | "openai";

export type EvalConfig = {
  /** Model used by the LLM judge to score rubric criteria. */
  judgeModel: string;
  /** Which responder the CLI builds by default when `--responder` is omitted. */
  defaultResponder: ResponderKind;
  /** Model used by the OpenAI responder (the system under test). */
  model: string;
  /** Env var name that holds the OpenAI API key (for judge + openai responder). */
  apiKeyEnv: string;
  /** Default minimum judge score (0..1) for a case to pass on its criteria. */
  passThreshold: number;
};

export type ParsedEvalConfig = { config: EvalConfig; errors: string[] };

export const DEFAULT_JUDGE_MODEL = "gpt-4o-mini";
export const DEFAULT_RESPONDER: ResponderKind = "command";
export const DEFAULT_MODEL = "gpt-4o-mini";
export const DEFAULT_API_KEY_ENV = "OPENAI_API_KEY";
export const DEFAULT_PASS_THRESHOLD = 0.6;

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function clampNumber(v: unknown, dflt: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : dflt;
  return Math.min(max, Math.max(min, n));
}

function parseResponderKind(raw: unknown): ResponderKind | undefined {
  const t = asString(raw)?.toLowerCase();
  if (t === "command" || t === "openai") return t;
  return undefined;
}

export function parseEvalConfig(raw: unknown): ParsedEvalConfig {
  const errors: string[] = [];
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const judgeModel = asString(root.judgeModel) ?? DEFAULT_JUDGE_MODEL;
  const model = asString(root.model) ?? DEFAULT_MODEL;
  const apiKeyEnv = asString(root.apiKeyEnv) ?? DEFAULT_API_KEY_ENV;

  let defaultResponder = DEFAULT_RESPONDER;
  if (root.defaultResponder !== undefined) {
    const parsed = parseResponderKind(root.defaultResponder);
    if (parsed) defaultResponder = parsed;
    else errors.push(`defaultResponder must be "command" or "openai" (got ${JSON.stringify(root.defaultResponder)})`);
  }

  // Threshold is clamped to a probability; out-of-range values are corrected
  // silently because a 0..1 score range is a hard invariant downstream.
  const passThreshold = clampNumber(root.passThreshold, DEFAULT_PASS_THRESHOLD, 0, 1);

  return {
    config: { judgeModel, defaultResponder, model, apiKeyEnv, passThreshold },
    errors,
  };
}
