# @openclaw/conductor — the fleet's orchestration brain

Turns the fleet's already-multi-lab model access (Anthropic via the Claude Max proxy,
Google Gemini, Alibaba Qwen, GitHub/OpenAI Copilot) into **one system that produces a
measurably better, lower-hallucination answer than any single model** — and does it
**securely**, so sensitive data never silently leaks to a lab we don't trust.

This is the in-house, $0-marginal, fully-auditable answer to rented orchestrators
(Sakana Fugu, shipped 2026-06-22). Grounding reality check from Fugu's own launch
numbers: orchestration beats the best *accessible* single model, but a true frontier
single model (Fable 5, 80.0 SWE-bench Pro) still beat Fugu Ultra (73.7). So Conductor's
router **uses the best single model when it suffices** and only spins up the heavy
machinery on genuinely hard work — where the lift is real.

## Why a separate brain (not just prompts)

The fleet already has the *primitives*: multi-lab auth, `@openclaw/llm-task`
(provider/model routing + allowlist), `@openclaw/agent-eval` (deterministic + LLM-judge
scoring), `@openclaw/knowledge` (RAG retrieval), and the `Workflow` parallel/pipeline
engine. What was missing is the thin layer that **composes** them with a difficulty
router and two safety guards. Conductor is that layer.

## Sequenced roadmap (gap-closure order = importance order)

Each phase is independently shippable. Security gates the rest by construction.

- **Phase 1 — Data-egress trust guard ✅ (this release).** `model-trust.ts`. Bright-line
  gate: secrets never egress to *any* model; financial/identity/pii only to allowlisted
  vendors (default: Anthropic only). Pure/offline, 15 tests green. Tool:
  `conductor_egress_check`. **Prerequisite for everything multi-lab below.**
- **Phase 2 — Inter-model injection firewall ✅ (this release).** `injection-firewall.ts`.
  Treats every draft, lens-critique, and retrieved-evidence span as *untrusted content,
  not instructions*: detects the classic injections (override / role-reassign / system-spoof
  / prompt-leak / exfiltration / tool-invoke / delimiter-breakout) and **structurally
  contains** them in a guard envelope that defangs breakout attempts — so even an unknown
  injection can't hijack the synthesizer/judge. Pure/offline, 13 tests green. Tool:
  `conductor_fortify`. (Extends the fleet's channel-boundary rule inward to the pipeline.)
- **Phase 3 — Difficulty router + modes ✅ (this release).** `router.ts` + `executor.ts`.
  A planner classifies each task → `SOLO` / `RELAY` (author→refiner→judge on real code) /
  `PANEL` (cross-lab breadth) / `TRINITY` (thinker→worker→verifier depth loop). Routes by
  benchmarked strength across a diverse roster; the reliable lead is always the floor so a
  run never comes back empty. **The Phase-1 egress guard and Phase-2 firewall are bound to
  every hop by construction** (`guardOutbound`/`guardInbound`). The live model call is
  injected, so the whole brain is unit-tested offline (21 router+executor tests). Remaining:
  bind the real `callModel` to `llm-task`/the embedded runner (the live-integration checkpoint).
- **Phase 4 — Live quality floor ✅ (this release).** `floor.ts`. Blind-scores the merged
  answer against the raw drafts (anonymized ids) and reverts to the best draft if the merge
  regressed — a merge can never make the answer worse. Runs before the judge; `floorReverted`
  is surfaced on the result. 5 tests.
- **Phase 5 — Evidence fact-check ✅ (this release).** `evidence.ts`. The one axis cross-model
  agreement can't give: verdict each checkable claim supported/unsupported/unverifiable against
  supplied evidence, strip the unsupported, and surface a *measured* `hallucinationCount`. 5 tests.
- **Phase 6 — Learning loop ✅ (this release).** `learning.ts`. Records which mode wins which
  task-kind, routes future tasks of that kind to the proven winner (still exploring ~20% to
  re-discover a newly-better mode), and distils failure lessons for prompt-injection-back.
  File-backed persistence. 6 tests. (Phase 2's firewall guards this store from poisoning.)

### Gaps beyond the source doc (ours to add)
- **Cost-DoS budgets:** hard per-task token/loop ceilings + wall-timeouts so a pathological
  task can't fan out unbounded.
- **Provenance on the learning store:** signed/validated lessons so a bad run can't poison
  all future routing.
- **The floor is enforced, never prompted:** Phase 4 is a mechanism, not a clause in a
  judge prompt.

## How this serves the wider Parallax goal

Conductor is the substrate the "elite fleet" sits on. The money/marketing/social layers
are *wirings on top of it*: the Pantheon creative disciplines, the Business Bible doctrine,
the autonomous-revenue loop, and Parallax publish-to-post all become routed, verified,
floor-guarded work — with the egress guard ensuring nothing sensitive leaves the stack.
Autonomy and "always finds a way" come from the router + trinity loop; the ruthlessness on
security comes from Phase 1/2 being non-negotiable gates, not options.

## Config

```json
{
  "plugins": { "entries": { "conductor": { "enabled": true } } },
  "conductor": {
    "policy": { "allow": { "pii": ["anthropic", "google"] } }
  }
}
```

Omit `policy` for the conservative default (sensitive → Anthropic only; secrets → nowhere).
Allowlist the tool per agent: `"tools": { "allow": ["conductor_egress_check"] }`.
