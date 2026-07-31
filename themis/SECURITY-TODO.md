# Themis — Security & Correctness TODO

Findings from a full server-side audit (auth, ownership, billing, public
routes, webhooks, migrations). Status as of the multi-tenant build.

**Context:** These are **latent** while Themis runs single-operator on one
box. They become live the moment a **second firm shares the same instance**
(multi-tenant production). Fix #1–#3 before onboarding customer #2 onto a
shared deployment.

Key files: `server/src/index.ts`, `server/src/repo.ts`,
`server/src/routes/auth.ts`, `server/src/routes/matters.ts`,
`server/src/routes/billing.ts`, `server/src/routes/teams.ts`,
`server/src/db.ts`.

---

## CRITICAL — fix before customer #2 shares the instance

### 1. Cross-tenant matter read (IDOR) on the bare path — ❌ NOT REPRODUCIBLE (re-verified 2026-06-10)
- **Where:** `index.ts` — ownership middleware is `app.use("/api/matters/:id/*", …)`.
- **Original claim:** Hono's `/*` wildcard requires a trailing segment, so the
  bare `GET /api/matters/:id` is ungated.
- **Re-verification:** Empirically false on Hono 4.x as shipped. A router
  probe shows `app.use("/api/matters/:id/*")` DOES fire for the bare
  `/api/matters/:id` path, and the smoke test "Bob forbidden from Jane's
  matter (403)" exercises exactly this and passes. The bare path was never
  exposed.
- **Hardening shipped anyway (2026-06-10):** the gate is now registered on
  BOTH `"/api/matters/:id"` and `"/api/matters/:id/*"` so a future router
  behavior change can't silently un-gate the bare path.
- **NEW bug found during re-verification (fixed 2026-06-10):** because the
  wildcard matches the bare path, the gate also fired for
  `GET /api/matters/archived` (`:id = "archived"`, no such matter → 403).
  The Archive surface was broken for every signed-in user in multi-tenant
  mode. Fixed with an explicit carve-out + smoke regression test
  ("multi-tenant /matters/archived not shadowed by matter gate").

### 2. Invited collaborators are locked out; the comment lies — ✅ FIXED 2026-06-10
- **Where:** `repo.ts` `canAccessMatter()` + `index.ts` middleware comment.
- **Problem:** `canAccessMatter` only checked `owner_email === '' ||
  owner_email === ownerEmail` and never consulted the `matter_access` grants
  table — every invited teammate got 403 on every route. The paid "invite
  collaborator" feature was non-functional.
- **Fix shipped:** `canAccessMatter` now returns true when
  `getRoleForUser(db, matterId, ownerEmail)` is non-null. `listMatters`,
  `listFirmAudit`, and the firm upcoming-deadlines query include granted
  matters via the same `matter_access` EXISTS clause, so shared matters
  appear in the collaborator's dashboard, firm audit, and deadline digest.
  Smoke tests cover invite → read (bare + sub-route) → list → revoke → 403.
- **Not yet done (follow-up):** per-ROLE enforcement. Any granted role
  (including `readonly`) currently gets the same access as the owner on all
  matter routes — write routes don't check the role. Fine for trusted teams,
  wrong for `readonly`/`paralegal` semantics.

### 3. Seed/legacy matters (`owner_email = ''`) are world-readable/writable — ✅ FIXED 2026-06-10
- **Where:** `repo.ts` `listMatters` + `canAccessMatter`; `db.ts` migration
  backfills all pre-existing matters to `owner_email = ''`.
- **Problem:** Both treated `owner_email = ''` as visible/accessible to
  everyone. In multi-tenant mode, all seed/demo matters and any matter created
  before the migration were readable AND mutable by every signed-in user.
- **Fix shipped:** in multi-tenant mode `''` matters are visible to NOBODY
  (list + direct access + firm audit + deadlines). New env var
  `THEMIS_OPERATOR_EMAIL` assigns all orphan matters to the operator's
  account at boot (idempotent, logged). Set on the production box for
  ramon.waltonmusic@gmail.com before deploy so the 5 existing matters
  (incl. Oliveira) stay owned. Single-user mode unchanged.
- **Side effect to know about:** once the operator owns the seed matters they
  count against the plan's active-matter cap (solo = 5, and the operator
  account is at exactly 5/5). Archive a demo matter or bump the operator's
  plan before creating matter #6.

---

## HIGH

### 4. CORS reflects any origin with credentials — ✅ FIXED 2026-06-11
- **Where:** `index.ts` — `cors({ origin: (o) => o ?? "*", credentials: true })`.
- **Problem:** Reflecting the caller's Origin while `credentials:true` lets any
  website make authenticated cross-origin requests and read responses. With
  `SameSite=Lax` cookies this defeats same-origin protection for the whole API.
- **Fix shipped:** in multi-tenant mode the origin function returns a match
  ONLY for `THEMIS_PUBLIC_URL` or the local dev hosts; any other Origin gets
  no allow-origin header. Single-user mode still reflects (no cookies to
  steal locally). Smoke: "CORS does not reflect foreign origin".

### 5. Webhook SSRF — ✅ FIXED 2026-06-11
- **Where:** `routes/teams.ts` `POST /api/webhooks`; fired from `repo.ts` audit().
- **Problem:** Accepts any `https?://` URL with no guard; server-side POSTs
  audit events to it, enabling internal-network probing/exfil
  (`http://169.254.169.254/...`, `http://localhost:...`).
- **Fix shipped:** new `webhookTargetError()` in `teams.ts` rejects, in
  multi-tenant mode, non-https URLs and any loopback / RFC-1918 / link-local
  (169.254.x = cloud metadata) / `localhost|.local|.internal` / IPv6 private
  target. Enforced at BOTH create time and fire time (rows predating the
  guard get re-checked before any POST). Single-user mode still allows
  localhost (legit local SIEM). Smoke: 5 SSRF cases.
- **Residual (documented, not fixed):** DNS rebinding — a public hostname
  resolving to a private IP — is not caught (we don't resolve before fetch).
  Acceptable for now; revisit if webhooks become a funded attack surface.

### 6. Plan caps evadable + billing count inconsistency — ✅ FIXED 2026-06-11
- **Where:** `matters.ts` cap checks vs `billing.ts` status.
- **Problem:** Cap enforcement counts `owner_email = ? AND archived = 0`;
  billing status counts all `owner_email = ?` (incl. archived) → UI and
  enforcement disagree.
- **Fix shipped:** billing-status matter count now also excludes archived, so
  the meter and the gate use the identical definition. The cross-matter quota-
  dodge vector closed transitively when #2/#3 stopped `''`/other-tenant
  matters from being writable. NOTE: the operator (Ramon) is now at exactly
  5/5 on Solo because the orphan-claim assigned all 5 seed matters — archive
  one or bump the plan before creating #6.

---

## MEDIUM / LOW

### 7. `isPublic` prefix match too loose — ✅ FIXED 2026-06-11
- **Where:** `routes/auth.ts` `isPublic()`.
- **Problem:** `startsWith` on non-slash entries made
  `/api/verify/status-secret`, `/api/healthcheck-internal`,
  `/api/billing/webhook-admin` all public.
- **Fix shipped:** entries ending in `/` stay prefix-matched; all others are
  exact-match only. Verified the real public badge (`/api/public/verify/:hash`,
  under the `/api/public/` prefix) stays reachable. Smoke: 2 lookalike-gated
  cases + 1 badge-stays-public case.

### 8. Stripe `current_period_end` fragile cast (SDK v22) — ✅ FIXED 2026-06-11
- **Where:** `routes/billing.ts`.
- **Problem:** Read via `as unknown as {...}` because the field moved off the
  top-level `Stripe.Subscription` type in v22 (now on items). If Stripe omits
  it top-level, `activeUntil` becomes undefined and the plan never expires
  locally. Also `sub.metadata.themis_plan` was trusted unvalidated.
- **Fix shipped:** `subPeriodEnd()` reads `items.data[0].current_period_end`
  first, falls back to the legacy top-level field. `validPlan()` rejects any
  `themis_plan` not in `PLANS` (a typo can't grant a free upgrade). Both used
  in all three webhook branches. NOTE: needs a live Stripe test event before
  trusting in production — smoke can't exercise the signed webhook path.

### 9. Defense-in-depth: matter sub-routes don't re-check ownership
- All matter sub-routes rely solely on the gate middleware + `matterExists`.
  Partially mitigated 2026-06-10: the gate is registered on two independent
  matchers (bare + wildcard). Remaining: add `canAccessMatter` inside the
  handlers (or a shared helper) so a middleware registration mistake can't
  silently unprotect writes.

---

## Already fixed this session
- `migrate()` now only swallows "duplicate column name" and logs any other
  failure (was a bare `catch {}` that silently hid the `archived`-column
  migration failure → empty-dashboard outage).
- `listMatters` falls back gracefully if the `archived` column is missing.
- Watcher runs `npm install` when `package.json` changes (was the cause of the
  stripe `ERR_MODULE_NOT_FOUND` boot crash).
- Magic-link URL is surfaced in the API response when email delivery isn't
  confirmed (Resend domain not yet verified).

## Confirmed sound (no action)
- No SQL injection — all queries parameter-bound (incl. dynamic `IN (...)`).
- Magic-link token consumption is atomic + single-use; cookies are
  httpOnly/SameSite=Lax/Secure-gated; good entropy.
- Stripe webhook signature verification is correct (raw body, rejects missing
  sig/secret).
- Privilege wall holds — shared views strip flagged/withheld docs + PII.

## Status summary (2026-06-11)
All audit findings #1–#8 are now fixed; only #9 (defense-in-depth re-check
inside handlers) remains, and it is mitigated by the dual-matcher gate.
Smoke 178 → 198, all passing; typecheck clean. **Before a shared production
deploy still required (NOT code):** move the LLM off Ramon's personal Claude
Max onto a commercial Anthropic API key; verify a Resend sending domain;
rotate the leaked keys; live-test the Stripe webhook path (#8).

## Operational reminders
- Rotate API keys that leaked into chat: Anthropic, AssemblyAI, Resend.
  Tooling shipped: `themis/scripts/rotate-key.sh` (one command, probes the
  new key before restart). Standalone copy on the live box at `~/bin/`.
- Verify a Resend sending domain so magic links email properly.
- Move LLM provider from personal Claude Max (claude-code CLI) to a
  commercial Anthropic API key before customer #2 (ToS + per-tenant
  rate-limit isolation).
