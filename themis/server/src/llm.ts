// LLM seam — Claude API behind a thin promise-returning interface. When
// ANTHROPIC_API_KEY is unset, every function returns null and callers fall
// back to the deterministic engine. That keeps the prototype runnable
// locally without an API key, and lights up the moment a key is present.

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null | undefined; // undefined = not yet probed; null = no key

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    client = null;
    return null;
  }
  client = new Anthropic({ apiKey: key });
  return client;
}

export function isLLMReady(): boolean {
  return getClient() !== null;
}

// Hide noisy debug at call-sites; toggle via THEMIS_LLM_LOG=1. Errors are
// ALWAYS surfaced (the silent-fallback bug had the operator staring at
// 'REFUSED deterministic (llm fallback)' with no clue why).
function log(...args: unknown[]): void {
  if (process.env.THEMIS_LLM_LOG === "1") console.log("[llm]", ...args);
}
function logErr(label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[llm] ${label}: ${msg}`);
}

// Default model. THEMIS_LLM_MODEL env var overrides if your API tier needs
// something different (older versions, or a model your org has access to).
const MODEL = process.env.THEMIS_LLM_MODEL ?? "claude-sonnet-4-5";
const SYNTH_MAX_TOKENS = 1024;
const JUDGE_MAX_TOKENS = 256;

// ---------------------------------------------------------------------------
// Synthesis — generate a grounded answer from retrieved sources. Caller
// supplies the question + a structured source list. We constrain the model
// to (a) ground every claim in cited Bates ids, (b) refuse if no source
// supports a specific answer, (c) emit citations as a structured trailer.
// ---------------------------------------------------------------------------

export interface SourceForSynthesis {
  bates: string;
  date: string;
  title: string;
  summary: string;
  body: string;
}

export interface SynthesisResult {
  text: string;
  citationBates: string[]; // ordered by importance
  refused: boolean;
}

const SYSTEM_PROMPT = `You are Themis, a litigation evidence intelligence assistant for paralegals and attorneys.

You MUST follow these rules:

1. Every factual claim must ground in one of the SOURCES below. Cite the Bates id in-line (e.g. "(NW-000847)") when you assert a fact.
2. If the sources do NOT contain enough information to answer the user's question with a specific claim, you MUST refuse. Begin your response with exactly: "I located documents that mention your question's terms, but none of them support a specific answer." Then briefly note what the sources do say and suggest a rephrase. Do not invent.
3. Do not speculate beyond what the sources state. If a date, name, or number is not in a source, do not provide it.
4. Write as a senior paralegal would brief an attorney: dense, factual, no fluff. Lead with the answer.
5. After your prose answer, output a final line of the form:
CITATIONS: NW-000847, NW-001120, NW-001498
listing every Bates id you cited, in order of importance. If you refused, leave this empty: "CITATIONS:".

You are answering on behalf of the firm representing the plaintiff in this matter. Treat the privilege wall as inviolable: if a document is flagged or withheld, it will not appear in your sources.`;

function formatSources(sources: SourceForSynthesis[]): string {
  return sources
    .map(
      (s, i) =>
        `SOURCE ${i + 1} — ${s.bates} (${s.date}) — ${s.title}\nSummary: ${s.summary}\nBody: ${s.body.slice(0, 2400)}`,
    )
    .join("\n\n---\n\n");
}

export async function synthesizeAnswer(
  question: string,
  sources: SourceForSynthesis[],
): Promise<SynthesisResult | null> {
  const c = getClient();
  if (!c || sources.length === 0) return null;

  const sourcesBlock = formatSources(sources);
  const userMessage = `SOURCES:\n\n${sourcesBlock}\n\n---\n\nUSER QUESTION: ${question}\n\nAnswer following all rules. Lead with the answer; cite Bates ids in-line; end with the CITATIONS line.`;

  try {
    log("synth", { question: question.slice(0, 60), sources: sources.length });
    const msg = await c.messages.create({
      model: MODEL,
      max_tokens: SYNTH_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();

    // Split out the trailing CITATIONS line.
    const m = text.match(/^([\s\S]*?)\n?CITATIONS:\s*(.*)$/m);
    let body = text;
    let citationBates: string[] = [];
    if (m) {
      body = m[1].trim();
      citationBates = m[2]
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^[A-Z]{2,}-\d{3,}$/.test(s));
    } else {
      // Fall back: scrape inline Bates citations from the body.
      citationBates = Array.from(new Set(body.match(/[A-Z]{2,}-\d{3,}/g) ?? []));
    }

    const refused = /^I located documents that mention/i.test(body) || /declining to claim/i.test(body);
    return { text: body, citationBates, refused };
  } catch (err) {
    logErr("synth", err);
    lastError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entailment judge — LLM-as-judge. Given a claim and a candidate source body,
// returns a 0..1 supportScore. Used in place of the token-overlap heuristic
// when the API is configured.
// ---------------------------------------------------------------------------

export interface EntailmentJudgment {
  entailed: boolean;
  supportScore: number; // 0..1
  reason: string;
}

const JUDGE_SYSTEM = `You are an evidence-entailment judge for a legal AI system. Given a CLAIM and a SOURCE TEXT, decide whether the source text supports the claim.

Reply with exactly one JSON object on a single line:
{"supportScore": <number 0..1>, "entailed": <true|false>, "reason": "<one-sentence reason>"}

Rules:
- supportScore is your calibrated belief that a reasonable attorney would cite this source for this claim. 0 = irrelevant. 1 = directly states it.
- entailed should be true iff supportScore >= 0.5.
- Be strict. A source that merely shares a topic but does not state the claim is NOT entailment (supportScore <= 0.3).
- A source that directly states the claim or its core proposition is entailment (supportScore >= 0.7).
- No prose outside the single JSON object.`;

export async function judgeEntailment(
  claim: string,
  sourceText: string,
): Promise<EntailmentJudgment | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const msg = await c.messages.create({
      model: MODEL,
      max_tokens: JUDGE_MAX_TOKENS,
      system: JUDGE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `CLAIM: ${claim}\n\nSOURCE TEXT:\n${sourceText.slice(0, 3000)}\n\nRespond with the JSON object only.`,
        },
      ],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<EntailmentJudgment>;
    if (typeof parsed.supportScore !== "number") return null;
    return {
      supportScore: Math.max(0, Math.min(1, parsed.supportScore)),
      entailed: parsed.entailed ?? parsed.supportScore >= 0.5,
      reason: parsed.reason ?? "",
    };
  } catch (err) {
    logErr("judge", err);
    lastError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

// Last LLM error, exposed via /api/engine for one-glance diagnostics. Surfaces
// to the engine pill tooltip so the operator sees the actual reason the chat
// is falling back (wrong model name, key denied, rate limit, etc.) instead
// of staring at silent refusals.
let lastError: string | null = null;
export function getLastLLMError(): string | null {
  return lastError;
}
export function getCurrentModel(): string {
  return MODEL;
}

// One-shot LLM health check. Calls the API with a tiny prompt and reports
// {ok, error?, model}. Wired to GET /api/engine/test so the operator can
// confirm the SDK actually works end-to-end before debugging chat.
export async function probeLLM(): Promise<{ ok: boolean; model: string; error?: string }> {
  const c = getClient();
  if (!c) return { ok: false, model: MODEL, error: "ANTHROPIC_API_KEY not set" };
  try {
    const msg = await c.messages.create({
      model: MODEL,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    lastError = null;
    return { ok: text.toLowerCase().includes("ok"), model: MODEL };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    lastError = error;
    return { ok: false, model: MODEL, error };
  }
}
