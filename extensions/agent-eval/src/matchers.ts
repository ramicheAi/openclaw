// Pure deterministic scoring for an eval case's `expect` block.
//
// Every matcher here is a pure function of (output, expectation) — no IO, no
// clock, no network — so the scoring core is trivially testable and reproducible.
// The LLM judge (src/judge.ts) layers on top for fuzzy/rubric criteria.

export type EvalExpect = {
  /** Every listed substring must appear in the output. */
  contains?: string[];
  /** None of the listed substrings may appear in the output. */
  notContains?: string[];
  /** The output must match this regular expression (source string). */
  regex?: string;
  /** The trimmed output must exactly equal this trimmed string. */
  equals?: string;
  /** Natural-language rubric handed to the LLM judge. */
  criteria?: string;
  /** Per-case override for the judge pass threshold (0..1). */
  minScore?: number;
};

export type CheckResult = {
  /** Stable identifier for the check kind, e.g. "contains" or "regex". */
  check: string;
  passed: boolean;
  /** Human-readable explanation, present on failure (and some passes). */
  detail?: string;
};

/** Max output length a suite-supplied regex is tested against (ReDoS haystack cap). */
const MAX_REGEX_INPUT = 50_000;

/**
 * Heuristic: does the pattern apply a quantifier directly to a group that is
 * itself quantified (e.g. (a+)+, (a*)*, (a{1,})+)? That nesting is the classic
 * catastrophic-backtracking trigger. Not exhaustive, but it catches the common
 * exponential cases without a regex-engine dependency.
 */
function looksCatastrophic(source: string): boolean {
  return /[+*}]\)[*+{]/.test(source);
}

/**
 * Run all deterministic matchers declared on `expect` against `output`.
 *
 * Returns one result per declared matcher (in a stable order). `criteria` is
 * intentionally NOT scored here — it is the LLM judge's responsibility — so a
 * case with only `criteria` produces zero deterministic checks.
 */
export function runDeterministicChecks(output: string, expect: EvalExpect): CheckResult[] {
  const results: CheckResult[] = [];

  if (expect.contains && expect.contains.length > 0) {
    const missing = expect.contains.filter((needle) => !output.includes(needle));
    results.push({
      check: "contains",
      passed: missing.length === 0,
      detail: missing.length === 0 ? undefined : `missing: ${missing.map(quote).join(", ")}`,
    });
  }

  if (expect.notContains && expect.notContains.length > 0) {
    const present = expect.notContains.filter((needle) => output.includes(needle));
    results.push({
      check: "notContains",
      passed: present.length === 0,
      detail: present.length === 0 ? undefined : `unexpectedly present: ${present.map(quote).join(", ")}`,
    });
  }

  if (expect.regex !== undefined) {
    // ReDoS guard: suite files are semi-trusted, so a malicious pattern like
    // /(a+)+$/ against a long responder output could backtrack exponentially and
    // hang the run. Reject nested-quantifier patterns outright and cap the
    // haystack length. For fully untrusted suites, prefer a linear engine (re2).
    if (looksCatastrophic(expect.regex)) {
      results.push({
        check: "regex",
        passed: false,
        detail: "rejected: pattern has nested quantifiers (ReDoS risk) — rewrite without (x+)+ style nesting",
      });
    } else {
      let re: RegExp | null = null;
      let compileError: string | undefined;
      try {
        re = new RegExp(expect.regex);
      } catch (err) {
        compileError = err instanceof Error ? err.message : String(err);
      }
      if (!re) {
        // A broken pattern is a failed check, not a thrown error — the suite author
        // gets actionable feedback instead of an aborted run.
        results.push({ check: "regex", passed: false, detail: `invalid regex: ${compileError}` });
      } else {
        const haystack = output.length > MAX_REGEX_INPUT ? output.slice(0, MAX_REGEX_INPUT) : output;
        const matched = re.test(haystack);
        results.push({
          check: "regex",
          passed: matched,
          detail: matched ? undefined : `did not match /${expect.regex}/`,
        });
      }
    }
  }

  if (expect.equals !== undefined) {
    const matched = output.trim() === expect.equals.trim();
    results.push({
      check: "equals",
      passed: matched,
      detail: matched ? undefined : `expected exactly ${quote(expect.equals.trim())}`,
    });
  }

  return results;
}

/** True when an expectation declares at least one scorable field. */
export function expectHasAnyCheck(expect: EvalExpect): boolean {
  return (
    (Array.isArray(expect.contains) && expect.contains.length > 0) ||
    (Array.isArray(expect.notContains) && expect.notContains.length > 0) ||
    typeof expect.regex === "string" ||
    typeof expect.equals === "string" ||
    (typeof expect.criteria === "string" && expect.criteria.trim().length > 0)
  );
}

function quote(s: string): string {
  // Truncate long needles so failure details stay readable.
  const shown = s.length > 60 ? `${s.slice(0, 57)}...` : s;
  return JSON.stringify(shown);
}
