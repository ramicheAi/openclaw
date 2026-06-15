// Eval-suite parsing and loading.
//
// A suite is plain JSON: `{ name, cases: EvalCase[] }`. Parsing is defensive in
// the same spirit as the rest of the harness — a malformed case is skipped with
// an error string rather than throwing, so one bad fixture never aborts a run.
// Suites are JSON (no YAML dependency) per the extension's zero-extra-deps rule.

import fs from "node:fs";

import { expectHasAnyCheck, type EvalExpect } from "./matchers.js";

export type EvalCase = {
  id: string;
  input: string;
  expect: EvalExpect;
  tags?: string[];
};

export type EvalSuite = {
  name: string;
  cases: EvalCase[];
};

export type ParsedSuite = { suite: EvalSuite; errors: string[] };

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length ? out : undefined;
}

/** Extract a validated `expect` block; returns undefined when nothing scorable. */
function parseExpect(raw: unknown): EvalExpect | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const expect: EvalExpect = {};

  const contains = asStringArray(r.contains);
  if (contains) expect.contains = contains;
  const notContains = asStringArray(r.notContains);
  if (notContains) expect.notContains = notContains;
  const regex = asString(r.regex);
  if (regex !== undefined) expect.regex = regex;
  const equals = asString(r.equals);
  if (equals !== undefined) expect.equals = equals;
  const criteria = asNonEmptyString(r.criteria);
  if (criteria !== undefined) expect.criteria = criteria;
  if (typeof r.minScore === "number" && Number.isFinite(r.minScore)) {
    expect.minScore = Math.min(1, Math.max(0, r.minScore));
  }

  return expectHasAnyCheck(expect) ? expect : undefined;
}

/**
 * Parse a raw value into a suite. Each case must carry an `id`, an `input`, and
 * a non-empty `expect`; cases failing validation are dropped and recorded in
 * `errors`. Never throws — junk input yields an empty suite plus errors.
 */
export function parseSuite(raw: unknown): ParsedSuite {
  const errors: string[] = [];
  const root = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  const name = asNonEmptyString(root.name) ?? "unnamed-suite";
  if (asNonEmptyString(root.name) === undefined) {
    errors.push("suite missing 'name' — defaulting to 'unnamed-suite'");
  }

  const rawCases = Array.isArray(root.cases) ? root.cases : [];
  if (!Array.isArray(root.cases)) {
    errors.push("suite 'cases' is not an array — no cases loaded");
  }

  const cases: EvalCase[] = [];
  const seen = new Set<string>();
  rawCases.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`case #${index}: not an object — skipped`);
      return;
    }
    const c = item as Record<string, unknown>;
    const id = asNonEmptyString(c.id);
    if (!id) {
      errors.push(`case #${index}: missing 'id' — skipped`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`case '${id}': duplicate id — skipped`);
      return;
    }
    const input = asString(c.input);
    if (input === undefined || input.length === 0) {
      errors.push(`case '${id}': missing non-empty 'input' — skipped`);
      return;
    }
    const expect = parseExpect(c.expect);
    if (!expect) {
      errors.push(`case '${id}': 'expect' must declare at least one check — skipped`);
      return;
    }
    cases.push({ id, input, expect, tags: asStringArray(c.tags) });
    seen.add(id);
  });

  return { suite: { name, cases }, errors };
}

/** Read + parse a suite file from disk. Throws only on file-read errors. */
export function loadSuiteFile(filePath: string): ParsedSuite {
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Malformed JSON is a hard load error (distinct from per-case validation):
    // surface it as a single error with an empty suite rather than throwing.
    return {
      suite: { name: "unparsed-suite", cases: [] },
      errors: [`invalid JSON in ${filePath}: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  return parseSuite(parsed);
}
