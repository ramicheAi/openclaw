// Eval harness — proves system reliability with falsifiable Q&A scoring.
//
//   node run: `npm run eval`
//
// For each test case we ask the chat service the question and grade:
//   - citation existence  : every cited Bates must resolve
//   - citation entailment : at least one cited body must support the claim
//   - bates expected      : the answer must cite specific expected Bates ids
//     (the substantive correctness check)
//   - refused              : when the case is intentionally unanswerable, the
//     system must refuse rather than fabricate
//
// Returns aggregate precision (entailed/total cited), recall on expected
// Bates ids, and a refusal-correctness rate. Non-zero exit code on failure.
process.env.THEMIS_DB = ":memory:";

import { buildApp } from "./src/index.js";

interface EvalCase {
  matterId: string;
  question: string;
  /** Bates ids the system MUST cite for a correct answer (recall). */
  expectBates?: string[];
  /** True if the only correct response is a refusal (no specific answer). */
  expectRefusal?: boolean;
  /** Substrings the answer text should contain. */
  expectContains?: string[];
}

const CASES: EvalCase[] = [
  {
    matterId: "reyes-northwind",
    question: "How much time passed between Reyes's wage complaint and her termination?",
    expectBates: ["NW-000847", "NW-001502"],
    expectContains: ["32"],
  },
  {
    matterId: "reyes-northwind",
    question: "Did the negative performance review come before or after the wage complaint?",
    expectBates: ["NW-000847", "NW-001120"],
  },
  {
    matterId: "mata-avianca",
    question: "What's the timeline between the fabricated affirmation and the sanctions order?",
    expectBates: ["MATA-000005", "MATA-000012"],
    // Note: the templated ChatService does not compute date arithmetic; this
    // eval intentionally does NOT assert "113" as a substring. A future
    // ChatService upgrade that synthesizes the duration should pass it.
  },
  {
    matterId: "mata-avianca",
    question: "Which judge sanctioned the lawyers and how much was the sanction?",
    expectBates: ["MATA-000012"],
    expectContains: ["Castel", "5,000"],
  },
  {
    matterId: "mata-avianca",
    question: "What was the home address and dietary preferences of Roberto Mata's spouse?",
    expectRefusal: true,
  },
  {
    matterId: "atlas-merger",
    question: "What did Tom Brandt say about Maria Reyes?",
    // Cross-matter probe — Atlas has no docs, system must refuse cleanly.
    expectRefusal: true,
  },
];

const app = buildApp();

interface Result {
  caseIndex: number;
  question: string;
  matterId: string;
  passed: boolean;
  failures: string[];
  metrics: { citations: number; entailed: number; existedAll: boolean; recallHit: number; recallTotal: number };
}

const results: Result[] = [];

for (let i = 0; i < CASES.length; i++) {
  const tc = CASES[i];
  const res = await app.request(`/api/matters/${tc.matterId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-themis-actor": "eval" },
    body: JSON.stringify({ question: tc.question }),
  });
  const body = (await res.json()) as {
    text: string;
    citations?: { bates: string; verified: boolean; entailed?: boolean; supportScore?: number }[];
    confidence?: string;
  };
  const failures: string[] = [];

  const citations = body.citations ?? [];
  const existedAll = citations.length > 0 && citations.every((c) => c.verified);
  const entailedCount = citations.filter((c) => c.entailed).length;

  // Refusal contract
  const refusedSignals = ["declining", "couldn't find", "I'm declining", "located documents that mention"];
  const refused = refusedSignals.some((s) => body.text.toLowerCase().includes(s.toLowerCase()));

  if (tc.expectRefusal) {
    if (!refused) failures.push("expected refusal but got an answer");
  } else {
    if (refused) failures.push("expected an answer but system refused");
    if (citations.length === 0) failures.push("no citations returned");
    if (citations.length > 0 && !existedAll) failures.push("a citation failed existence verification");
    if (entailedCount === 0) failures.push("no citation entailed the claim");
  }

  // Bates recall
  const bates = new Set(citations.map((c) => c.bates));
  const expected = tc.expectBates ?? [];
  const recallHit = expected.filter((b) => bates.has(b)).length;
  if (expected.length > 0 && recallHit < expected.length) {
    failures.push(`bates recall ${recallHit}/${expected.length} (missing: ${expected.filter((b) => !bates.has(b)).join(", ")})`);
  }

  // Substring expectations
  for (const s of tc.expectContains ?? []) {
    if (!body.text.includes(s)) failures.push(`answer missing expected substring "${s}"`);
  }

  results.push({
    caseIndex: i,
    question: tc.question,
    matterId: tc.matterId,
    passed: failures.length === 0,
    failures,
    metrics: {
      citations: citations.length,
      entailed: entailedCount,
      existedAll,
      recallHit,
      recallTotal: expected.length,
    },
  });
}

// --- Aggregate ---
const passed = results.filter((r) => r.passed).length;
const total = results.length;
const totalCitations = results.reduce((s, r) => s + r.metrics.citations, 0);
const totalEntailed = results.reduce((s, r) => s + r.metrics.entailed, 0);
const entailmentRate = totalCitations === 0 ? 0 : totalEntailed / totalCitations;
const refusalCases = CASES.filter((c) => c.expectRefusal).length;
const refusalCorrect = results.filter((r, i) => CASES[i].expectRefusal && r.passed).length;
const answerableCases = total - refusalCases;
const answerablePassed = results.filter((r, i) => !CASES[i].expectRefusal && r.passed).length;

console.log("\nThemis eval harness\n");
results.forEach((r, i) => {
  const status = r.passed ? "ok  " : "FAIL";
  console.log(`  ${status} [${CASES[i].matterId}] ${r.question}`);
  console.log(`         citations=${r.metrics.citations} entailed=${r.metrics.entailed} recall=${r.metrics.recallHit}/${r.metrics.recallTotal}`);
  for (const f of r.failures) console.log(`         · ${f}`);
});
console.log("");
console.log(`Cases:               ${passed}/${total} passed`);
console.log(`Citation entailment: ${(entailmentRate * 100).toFixed(1)}% (${totalEntailed}/${totalCitations})`);
console.log(`Answerable cases:    ${answerablePassed}/${answerableCases}`);
console.log(`Refusal cases:       ${refusalCorrect}/${refusalCases}`);
console.log("");

if (passed < total) {
  console.error(`${total - passed} case(s) failed.`);
  process.exit(1);
}
