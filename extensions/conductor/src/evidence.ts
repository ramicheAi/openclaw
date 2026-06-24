// evidence.ts — Phase 5: the external-evidence fact-check.
//
// Cross-model agreement cannot catch a fact that ALL your models are confidently
// wrong about (a correlated hallucination). Only real evidence can. This stage takes
// the synthesized answer + retrieved evidence, has a strict checker verdict each
// checkable claim, yields a MEASURED hallucination count, and strips/hedges the
// unsupported claims. The verdict itself is a model call (in the executor); the
// parsing, counting, and stripping here are pure and unit-tested.

export type Verdict = "supported" | "unsupported" | "unverifiable";

export interface ClaimVerdict {
  claim: string;
  verdict: Verdict;
}

export const EVIDENCE_VERDICT_PROMPT =
  'You are a strict fact-checker. Given the EVIDENCE and the ANSWER, extract the answer\'s checkable specific ' +
  'claims and verdict EACH: "supported" only if directly entailed by the evidence; "unsupported" if it ' +
  'contradicts the evidence or is a checkable specific absent from it; "unverifiable" if the evidence is ' +
  'silent (when in doubt, unverifiable). Output ONLY JSON: {"claims":[{"claim":"...","verdict":"..."}]}.';

const VALID: ReadonlySet<string> = new Set(["supported", "unsupported", "unverifiable"]);

export function parseVerdicts(raw: string): ClaimVerdict[] {
  const m = (raw ?? "").match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]) as { claims?: unknown };
    if (!Array.isArray(o.claims)) return [];
    const out: ClaimVerdict[] = [];
    for (const c of o.claims) {
      const claim = (c as { claim?: unknown }).claim;
      const verdict = (c as { verdict?: unknown }).verdict;
      if (typeof claim === "string" && typeof verdict === "string" && VALID.has(verdict)) {
        out.push({ claim, verdict: verdict as Verdict });
      }
    }
    return out;
  } catch {
    return [];
  }
}

// The measured hallucination number: how many checkable claims the evidence refutes
// or fails to support.
export function countUnsupported(claims: ClaimVerdict[]): number {
  return claims.filter((c) => c.verdict === "unsupported").length;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Best-effort local strip: hedge any unsupported claim whose text appears verbatim in
// the answer. (A re-synthesizer model call is higher fidelity for paraphrased claims;
// this guarantees the obvious ones are flagged with zero extra latency.)
export function stripUnsupported(answer: string, claims: ClaimVerdict[]): string {
  let out = answer ?? "";
  for (const c of claims) {
    if (c.verdict !== "unsupported") continue;
    const needle = c.claim.trim();
    if (needle.length < 4) continue;
    out = out.replace(new RegExp(escapeRe(needle), "g"), `⟨unverified: ${needle}⟩`);
  }
  return out;
}

export interface EvidenceReport {
  claims: ClaimVerdict[];
  unsupported: number;
  cleaned: string;
}

// Convenience: parse a verdict response and produce the report + cleaned answer.
export function evidenceReport(answer: string, verdictRaw: string): EvidenceReport {
  const claims = parseVerdicts(verdictRaw);
  return { claims, unsupported: countUnsupported(claims), cleaned: stripUnsupported(answer, claims) };
}
