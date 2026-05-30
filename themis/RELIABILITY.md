# Themis Reliability & Trust Posture

This document is the system's honest self-assessment. It maps each trust claim
the product makes onto the actual code that delivers (or stubs) it, surfaces
gaps without hiding them, and names the upgrade path for each. It is meant to
be the truth-of-record so a reviewer can audit Themis's reliability story in
~10 minutes.

The reliability work was prompted by **Mata v. Avianca, Inc.**, 678 F. Supp.
3d 443 (S.D.N.Y. 2023) — Themis is now seeded with that case as the literal
counter-example to the failure mode it exists to prevent.

---

## 1 · The trust thesis, mapped to code

| Claim Themis makes | Where it lives | Status |
| --- | --- | --- |
| Every citation grounds in a real source page | `services.ts:verifyCitation` + `assessCitation` | **Real (both layers)** |
| Privilege is *flagged*, never decided | `services.ts:privilegeService.scan/decide` + `repo.ts:setPrivilege` | **Real (flagging is lexical-heuristic; see §3)** |
| Chat refuses rather than guess when sources don't support a claim | `services.ts:chatService.ask` (REFUSAL_THRESHOLD) | **Real (deterministic)** |
| Chronology events are draft until a human accepts | `repo.ts:setChronologyAccepted` + `ChronologyPanel.tsx` | **Real** |
| Privileged docs are excluded from chat retrieval | `services.ts:searchService.search({excludePrivileged})` | **Real** |
| Exports lock during ingest | `lib/exports.ts:exportLockForMatter` + panel gating | **Real (gated on `ingestPercent` + last stage)** |
| Audit log is append-only and tamper-evident | `repo.ts:audit + hashAuditEntry + verifyAuditChain` | **Real (SHA-256 hash chain; see §4)** |
| Every mutation is logged with the actor that did it | `audit()` called from every PATCH/POST | **Real** |
| Reliability is measured, not asserted | `eval.ts` + `npm run eval` + `TrustPostureCard` | **Real (with honest failure rate; see §5)** |

---

## 2 · Two-layer citation verification (the central reliability primitive)

The single most important post-Mata reliability primitive is **entailment**,
not existence. The Stanford RegLab study ([Magesh et al., 2024](https://arxiv.org/abs/2405.20362))
that measured Lexis+ AI at ~17%, Westlaw AI-Assisted Research at ~33%, and
GPT-4 at ~43% hallucination rates defined hallucination two ways:

1. **Incorrect** — the assertion is wrong on the facts
2. **Misgrounded** — the assertion is correct, but the cited source does not
   support it

**Misgrounding was the dominant failure mode for the legal-AI tools**, not
fabrication. Existence checks alone can't catch it.

Themis implements both layers behind `assessCitation(db, matterId, bates,
page, claim)`:

- **Layer 1: existence.** Bates id must resolve to a real document in this
  matter; the cited page must fall within the document's page count.
  Deterministic, cheap. Catches the Mata failure mode where Schwartz cited
  *Varghese v. China Southern Airlines*, 925 F.3d 1339 (11th Cir. 2019) — a
  citation slot that does exist in F.3d but holds a *different, real* case
  (the D.C. Circuit's *A.D. v. Azar*).
- **Layer 2: entailment.** The cited document's body (plus its summary and
  title — what the cited "page" actually contains in our model) is scored
  against the question being asked, using:
  - distinctive-token unigram coverage
  - bigram coverage (rewards adjacency)
  - anchor matches for dates, years, dollar amounts, Bates ids
  - a penalty for unmatched distinctive question tokens
  - basic morphological stemming (so "sanctioned" ↔ "sanction")

  Output: `{existed, entailed, supportScore: 0..1, matchedKeyTerms}`. The UI
  renders three honest states for each citation:

  - **Entailed** — green check; source supports the claim
  - **Located** — amber outline; Bates resolves but support is weak ("located,
    not entailed")
  - **Unverified** — neutral grey; Bates doesn't resolve

A green check is reserved for entailed citations. The product's verification
promise is the green check, not the chip itself.

### Honest limitations of the current entailment scorer

The current scorer is a **deterministic token-overlap heuristic with basic
stemming**. It will:

- ✅ Catch obviously misgrounded citations (entirely unrelated topic)
- ✅ Catch the Mata failure mode (citations to fabricated cases)
- ✅ Refuse on out-of-corpus questions ("Mata's spouse's school")
- ⚠️ Miss synonyms it doesn't know about (the eval shows our system fails to
  entail "Which judge sanctioned the lawyers" against an opinion that says
  "attorneys" not "lawyers")
- ⚠️ Miss paraphrases that don't share surface tokens
- ⚠️ Be defeated by metadata overlap (entity names that happen to appear in
  both the question and the source)

**Upgrade path** (same `assessCitation` interface, replaceable impl):

1. Add a small synonym table for known legal-domain pairs (lawyer↔attorney,
   sanction↔fine, etc.) — half-day, modest lift.
2. Swap to a fine-tuned NLI model (e.g., a DeBERTa-MNLI or similar) — one
   class call per (claim, candidate-span). Days, large lift.
3. **LLM-as-judge with RAGAS-style decomposition** (Magesh et al. + RAGAS
   docs both recommend this): decompose the answer into atomic claims with
   pronouns resolved; for each, ask a separate judge model whether the
   retrieved context entails it; `faithfulness = supported_statements /
   total_statements`. This is the production-grade pattern Casetext/Harvey
   are reported to use (retrieve → draft → self-critique). 1-2 weeks with
   eval-driven tuning.

---

## 3 · Privilege classification

`privilegeService.scan(doc, counselTokens)` is a two-pass screen:

- Phrase signals (`attorney-client`, `work product`, `privileged`, etc.)
- Known-counsel name screening (tokens derived from entities with role
  matching `/counsel|attorney/i`)

This implements the right *contract* (system flags, human decides), but the
classifier is lexical, not learned. The asymmetry is brutal: a missed
privileged doc that gets produced = waiver, malpractice, career-ending. The
TREC Legal Track methodology treats ~75–80% recall as defensible for
responsiveness; **privilege is held to a much higher bar** (Relativity aiR
for Privilege publishes >99% recall as a design target, though they don't
publish validation methodology — Cimplifi guide, Relativity help docs).

**Honest posture:** the lexical scanner is fine as a tripwire for obvious
cases but should not be the only privilege defense. Real reliability for
this surface requires:

1. Stratified sampling with human re-review of a held-out set
2. Recall@k with Wald or Clopper-Pearson confidence intervals
3. An abstain/escalate threshold pegged below the recall lower-CI bound

The current `privilegeService.scan` returns `{flagged, basis}` with the
matched signal as the basis, so flag explanations are already there for
auditability. The classifier upgrade swaps the impl, not the interface.

---

## 4 · Tamper-evident audit log

Every mutation goes through `repo.ts:audit(db, matterId, actor, action,
detail)`. The implementation is a **SHA-256 hash chain**:

```
entry_hash = SHA-256( matter_id ‖ ts ‖ actor ‖ action ‖ detail ‖ prev_hash )
```

Each entry stores `prev_hash` and `entry_hash`. The chain is verified by
`verifyAuditChain(db, matterId)`, exposed at `GET /api/matters/:id/audit/verify`,
which walks the entries in order and confirms every entry's `prev_hash`
equals the previous `entry_hash` and every entry's `entry_hash` recomputes
correctly from its content. Any modification — even an authorized
DB-level write — breaks the chain at the point of tampering and the verify
endpoint reports the breaking record id.

This is the same pattern as Certificate Transparency (RFC 6962/9162) and
AWS QLDB.

**What's not in scope today:** publishing periodic Signed Tree Heads to an
external append-only ledger (e.g., S3 with object lock or a public CT-like
log). That's the upgrade for true non-repudiation — without it, the chain
proves internal consistency but a malicious admin who controls the DB at
rest can rewrite the entire log and re-hash it consistently. Surfacing the
chain to a third party closes that hole.

The `TrustPostureCard` on every matter shows the chain status live ("verified
· N entries" or "BROKEN at #X").

---

## 5 · Eval harness (`npm run eval`)

Reliability that isn't measured is rhetoric. `server/eval.ts` runs a
hand-curated set of test questions through the full chat pipeline and grades:

- **Citation existence** — every cited Bates must resolve
- **Citation entailment** — at least one cited body must entail the claim
- **Bates recall** — the answer must cite specific expected Bates ids
- **Substring expectations** — the answer text must contain expected phrases
- **Refusal contract** — when the case is intentionally unanswerable, the
  system must refuse rather than fabricate

### Current baseline (as of this commit)

```
Cases:               3/6 passed
Citation entailment: 28.6% (4/14)
Answerable cases:    1/4
Refusal cases:       2/2
```

**Failing cases** — surfaced, not hidden:

1. *Reyes:* "Did the negative performance review come before or after the
   wage complaint?" — system cited 3 docs but missed `NW-000847` (the wage
   complaint email itself) in the top-3 retrieval. Honest search-relevance
   gap.
2. *Mata:* "Which judge sanctioned the lawyers and how much was the sanction?"
   — refused. The opinion uses "attorneys", "fine" / "penalty"; the question
   uses "lawyers", "sanction". Honest synonym gap.
3. *Mata:* "What's the timeline between the fabricated affirmation and the
   sanctions order?" — recall hit on the sanctions order but missed the
   affirmation (`MATA-000005`) in top-3. Honest search-relevance gap.

**Passing cases** — proves the contracts:

- The Reyes "32-day" question entails cleanly (3/3 citations entailed,
  recall 2/2).
- The Mata spouse / school question correctly refuses.
- The Atlas (mid-ingest, no docs) question correctly returns no citations.

The eval is the truth. As we improve the scorer or the retriever, the score
goes up. If a regression is introduced, this number drops and the PR fails.

---

## 6 · Refusal as a feature

The `chatService.ask` flow includes an explicit `REFUSAL_THRESHOLD` (currently
0.18 best-citation supportScore). Below that, the system refuses to claim:

> "I located documents that mention your question's terms, but none of them
> actually support a specific answer. Rather than guess, I'm declining to
> claim. Review the cited Bates below directly, or rephrase the question."

The refusal still surfaces the located-but-not-entailed citations (chip in
amber, "located not entailed" tooltip), so the user can verify the refusal
themselves — refusal without grounds is just a different kind of guess.

Every refusal writes a `chat.refused` audit entry. The `TrustPostureCard`
counts refusals over time and surfaces them as a positive signal ("Themis
declined to claim N times rather than guess").

This is the direct rebuttal to the Mata failure mode: Schwartz/LoDuca
*doubled down* after the cases were challenged. A system that refuses by
default when it cannot ground out is structurally incapable of doubling
down on fabrications.

---

## 7 · Regulatory posture

Post-Mata, the legal-AI regulatory landscape is moving fast:

- **30+ federal district court standing orders** require AI-disclosure or
  AI-verification certifications (Tracelaw + Bloomberg Law trackers).
  Judge Brantley Starr's N.D. Tex. order (May 31, 2023) was the first.
- **ABA Formal Opinion 512** (July 2024) — first formal ethics opinion on
  generative AI; six duty areas including independent verification of AI
  output. Boilerplate engagement-letter consent is **not** adequate.
- **California Supreme Court** (Aug 2025) directed the State Bar to draft
  enforceable Rules of Professional Conduct amendments requiring
  independent verification — currently out for public comment.
- **Damien Charlotin's tracker** lists ~1,500 AI-related sanctions cases
  worldwide as of late 2025, growing ~5–6 per day.

Themis's verification trail (entailment scores per citation), tamper-evident
audit log, and refusal records are not just engineering hygiene — they are
the **documentary evidence** a practitioner needs to discharge their ABA
512 verification duty.

---

## 8 · What the eval proves, and what it doesn't

The eval proves:

- The system **refuses** on out-of-corpus questions (the Mata test).
- Citations that pass the entailment threshold **do** ground in their source
  pages (100% existence verification on entailed citations).
- The audit log is **cryptographically append-only**; the hash chain
  verifies after every smoke run.

The eval does not prove:

- That the scorer correctly entails every legitimately-relevant doc — the
  3/6 pass rate exposes the synonym/paraphrase gap.
- That privilege recall is at the 99%+ bar the production market expects —
  the lexical classifier has not been measured against a held-out set.
- That the system handles adversarial inputs (prompt injection,
  jailbreaking the refusal contract via creative phrasing).

This honest gap is the next reliability roadmap.

---

## 9 · Next reliability upgrades, prioritized

1. **LLM-as-judge entailment** (replace `assessCitation` impl). Same
   interface; per-citation faithfulness verdict via a separate judge model
   (different vendor than the generator, to avoid self-grading bias).
   Drives the eval score toward 5/6 → 6/6 without changing routes or types.
2. **Stratified-sample privilege eval.** Pull a held-out set, measure recall
   with a confidence interval, set an abstain/escalate threshold at the
   lower-CI bound. Real defensibility, not "we promise."
3. **External STH publication for the audit chain.** S3 object-lock or a
   CT-style log. Removes the malicious-admin threat model.
4. **Verbalized calibrated confidence** (Tian, Mitchell et al., EMNLP 2023).
   Prompt the model to emit its own confidence and calibrate it on a held-out
   set. Reduces ECE 50%+ in their experiments.
5. **Adversarial-input eval cases.** Prompt-injection attempts, contradiction
   between docs, etc.

---

## Run it

```bash
cd themis/server
npm install
npm run smoke    # 60 endpoint checks
npm run eval     # 6 chat-grounding cases (currently 3/6, surfaced honestly)
npm run dev      # API on :8787
```

```bash
cd themis
npm install
npm run dev      # UI on :5180, proxies /api → :8787
```

Open the Worktop. Look at the right rail's **Trust posture** card while you
work. The chain says verified or broken. The citations say entailed or
located-not-entailed. The refusal count climbs as you ask harder questions.
That's the discipline.

---

*Last updated: this commit. The eval result above is the current truth-of-
record. Any regression will reflect in `npm run eval` before this doc is
revised.*
