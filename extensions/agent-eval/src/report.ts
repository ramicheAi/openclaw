// Rendering and persistence of suite results.
//
// `formatReport` produces a human-readable summary for the terminal; `writeReport`
// persists the full machine-readable result to `<stateDir>/agent-eval/` so runs
// can be diffed over time and regressions caught.

import fs from "node:fs";
import path from "node:path";

import { evalReportDir } from "./paths.js";
import type { CaseResult, SuiteResult } from "./runner.js";

/** Render a suite result as a readable, paste-friendly text summary. */
export function formatReport(result: SuiteResult): string {
  const lines: string[] = [];
  const pct = (result.accuracy * 100).toFixed(1);
  lines.push(`Suite: ${result.suiteName}`);
  lines.push(`Result: ${result.passed}/${result.total} passed (${pct}% accuracy)`);
  lines.push(`Judge pass threshold: ${result.passThreshold}`);
  lines.push("");

  for (const c of result.cases) {
    lines.push(formatCaseLine(c));
    for (const detail of caseDetails(c)) lines.push(`    ${detail}`);
  }

  return lines.join("\n");
}

function formatCaseLine(c: CaseResult): string {
  const mark = c.passed ? "PASS" : "FAIL";
  const tags = c.tags && c.tags.length > 0 ? ` [${c.tags.join(", ")}]` : "";
  const score = c.judgeScore !== undefined ? ` (judge ${c.judgeScore.toFixed(2)})` : "";
  return `[${mark}] ${c.id}${tags}${score}`;
}

function caseDetails(c: CaseResult): string[] {
  const out: string[] = [];
  for (const check of c.checks) {
    if (!check.passed) out.push(`✗ ${check.check}: ${check.detail ?? "failed"}`);
  }
  if (c.error) out.push(`! ${c.error}`);
  if (!c.passed && c.judgeReasoning && c.judgeScore !== undefined) {
    out.push(`judge: ${truncateLine(c.judgeReasoning)}`);
  }
  return out;
}

function truncateLine(s: string): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 157)}...` : oneLine;
}

/** Filesystem-safe slug for the suite name used in the report filename. */
function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "suite"
  );
}

/**
 * Write the full result as JSON to `<stateDir>/agent-eval/<slug>-<timestamp>.json`
 * and return the path. Timestamp comes from the wall clock — fine in normal use;
 * tests assert on the returned object, not on filenames.
 */
export async function writeReport(
  result: SuiteResult,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const dir = evalReportDir(env);
  // Reports embed raw responder output and judge reasoning, which can contain
  // sensitive data — keep the dir and files owner-only (0700/0600).
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${slugify(result.suiteName)}-${timestamp}.json`);
  const payload = {
    ...result,
    generatedAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(file, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
  return file;
}

/** Read a saved report back from disk (for the `eval report` command). */
export function readReportFile(filePath: string): SuiteResult {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as SuiteResult;
}
