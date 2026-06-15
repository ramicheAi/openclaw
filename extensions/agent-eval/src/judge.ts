// LLM-as-judge scoring for fuzzy rubric criteria.
//
// The `Judge` type is the seam that keeps scoring testable: the runner depends
// only on this function shape, so tests inject a deterministic fake and never
// touch the network. `createOpenAIJudge` is the one real implementation.

import OpenAI from "openai";

export type JudgeParams = {
  /** The original case input that produced the output. */
  input: string;
  /** The responder output under test. */
  output: string;
  /** The natural-language rubric to score against. */
  criteria: string;
};

export type JudgeVerdict = {
  /** Confidence the output satisfies the criteria, clamped to 0..1. */
  score: number;
  reasoning: string;
};

export type Judge = (params: JudgeParams) => Promise<JudgeVerdict>;

const SYSTEM_PROMPT =
  "You are a strict evaluation judge. You are given an input, a candidate output, " +
  "and a rubric. Score how well the output satisfies the rubric as a number from " +
  "0 (fails completely) to 1 (fully satisfies). Be rigorous and literal. Respond " +
  'ONLY with a JSON object of the form {"score": <number 0..1>, "reasoning": "<short explanation>"}.';

/** Clamp any incoming value to a finite 0..1 score; non-numbers become 0. */
export function clampScore(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Parse a judge model's JSON reply defensively. Models occasionally wrap JSON in
 * prose or code fences even under json_object mode, so we extract the first
 * brace-delimited object before parsing and always clamp the score.
 */
export function parseJudgeResponse(text: string): JudgeVerdict {
  const trimmed = (text ?? "").trim();
  const candidate = extractJsonObject(trimmed) ?? trimmed;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return {
      score: clampScore(parsed.score),
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return { score: 0, reasoning: `unparseable judge response: ${trimmed.slice(0, 200)}` };
  }
}

function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return text.slice(start, end + 1);
}

/**
 * Build a `Judge` backed by an OpenAI chat model. Network errors are surfaced as
 * a 0-score verdict (with the error in `reasoning`) so a flaky judge fails the
 * affected case rather than aborting the whole run.
 */
export function createOpenAIJudge(params: { apiKey: string; model: string }): Judge {
  const client = new OpenAI({ apiKey: params.apiKey });
  return async ({ input, output, criteria }) => {
    try {
      const completion = await client.chat.completions.create({
        model: params.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `# Rubric\n${criteria}\n\n# Input\n${input}\n\n# Candidate output\n${output}\n\n` +
              'Return JSON: {"score": <0..1>, "reasoning": "<why>"}.',
          },
        ],
      });
      const text = completion.choices[0]?.message?.content ?? "";
      return parseJudgeResponse(text);
    } catch (err) {
      return { score: 0, reasoning: `judge error: ${err instanceof Error ? err.message : String(err)}` };
    }
  };
}
