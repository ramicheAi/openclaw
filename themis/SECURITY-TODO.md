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

### 1. Cross-tenant matter read (IDOR) on the bare path
- **Where:** `index.ts` — ownership middleware is `app.use("/api/matters/:id/*", …)`.
- **Problem:** Hono's `/*` wildcard requires a trailing segment, so it gates
  `/api/matters/abc/audit` but NOT the bare `GET /api/matters/:id` handler in
  `matters.ts`. Matter IDs are deterministic, guessable slugs (`name-client`),
  so any signed-in user can read another tenant's full matter detail (case
  theory, claims, gaps, posture) by guessing the URL.
- **Fix:** Add a second matcher `app.use("/api/matters/:id", …)` (no trailing
  slash) running the same `canAccessMatter` check, OR add an explicit
  `canAccessMatter` call inside `GET /api/matters/:id`. Do both for
  defense-in-depth.

### 2. Invited collaborators are locked out; the comment lies
- **Where:** `repo.ts` `canAccessMatter()` + `index.ts` middleware comment.
- **Problem:** `canAccessMatter` only checks `owner_email === '' ||
  owner_email === ownerEmail`. It never consults the `matter_access` grants
  table (which exists, with `getRoleForUser`/`listMattersForEmail` in
  `teams.ts`). The middleware comment claims it allows "granted access" users
  but that path doesn't exist — every invited teammate gets 403 on every
  sub-route. The paid "invite collaborator" feature is non-functional.
- **Fix:** In `canAccessMatter`, also return true when
  `getRoleForUser(db, matterId, ownerEmail)` is non-null.

### 3. Seed/legacy matters (`owner_email = ''`) are world-readable/writable
- **Where:** `repo.ts` `listMatters` + `canAccessMatter`; `db.ts` migration
  backfills all pre-existing matters to `owner_email = ''`.
- **Problem:** Both treat `owner_email = ''` as visible/accessible to
  everyone. In multi-tenant mode, all seed/demo matters and any matter created
  before the migration are readable AND mutable (add docs, verify, share,
  archive) by every signed-in user.
- **Fix:** In multi-tenant mode, stop treating `''` as world-accessible for
  write routes. Either run a one-time assignment of orphan matters to a
  designated operator account, or gate `''` to single-user mode only.

---

## HIGH

### 4. CORS reflects any origin with credentials
- **Where:** `index.ts` — `cors({ origin: (o) => o ?? "*", credentials: true })`.
- **Problem:** Reflecting the caller's Origin while `credentials:true` lets any
  website make authenticated cross-origin requests and read responses. With
  `SameSite=Lax` cookies this defeats same-origin protection for the whole API.
- **Fix:** Allowlist origins (e.g. `THEMIS_PUBLIC_URL`) when
  `THEMIS_AUTH_REQUIRED=1`. Never reflect arbitrary origins with credentials.

### 5. Webhook SSRF
- **Where:** `routes/teams.ts` `POST /api/webhooks`; fired from `repo.ts` audit().
- **Problem:** Accepts any `https?://` URL with no guard; server-side POSTs
  audit events to it, enabling internal-network probing/exfil
  (`http://169.254.169.254/...`, `http://localhost:...`).
- **Fix:** Block private/loopback/link-local targets; require `https` in
  production. Keep create/delete auth symmetric.

### 6. Plan caps evadable + billing count inconsistency
- **Where:** `matters.ts` cap checks vs `billing.ts` status.
- **Problem:** Cap enforcement counts `owner_email = ? AND archived = 0`;
  billing status counts all `owner_email = ?` (incl. archived) → UI and
  enforcement disagree. Also, because of #2/#3, a user can add docs/pages to a
  shared/other matter and dodge their own quota.
- **Fix:** Single definition (archived excluded), used in both places. Tie
  quota to the acting user and forbid writes to matters they don't own (#3).

---

## MEDIUM / LOW

### 7. `isPublic` prefix match too loose
- **Where:** `routes/auth.ts` `isPublic()`.
- **Problem:** `startsWith` on non-slash entries makes
  `/api/verify/status-secret`, `/api/healthcheck-internal`,
  `/api/billing/webhook-admin` all public.
- **Fix:** Exact-match the non-slash entries; `startsWith` only for the
  directory-style prefixes ending in `/`.

### 8. Stripe `current_period_end` fragile cast (SDK v22)
- **Where:** `routes/billing.ts`.
- **Problem:** Read via `as unknown as {...}` because the field moved off the
  top-level `Stripe.Subscription` type in v22 (now on items). If Stripe omits
  it top-level, `activeUntil` becomes undefined and the plan never expires
  locally. Also `sub.metadata.themis_plan` is trusted unvalidated.
- **Fix:** Read from `sub.items.data[0].current_period_end`; validate
  `themis_plan` against `PLANS` before persisting.

### 9. Defense-in-depth: matter sub-routes don't re-check ownership
- All matter sub-routes rely solely on the `/*` middleware + `matterExists`.
  After #1 is fixed, add `canAccessMatter` inside the handlers (or a shared
  helper) so a single middleware mismatch can't silently unprotect writes.

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

## Operational reminders
- Rotate API keys that leaked into chat: Anthropic, AssemblyAI, Resend.
- Verify a Resend sending domain so magic links email properly.
