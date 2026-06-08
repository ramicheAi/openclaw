# Themis — Deploy & Operate

End-to-end guide for shipping Themis to real users. Covers the two deploy
shapes we support (single-machine via Tailscale, multi-tenant on Fly.io)
plus auth, backups, secrets, and the env-var matrix.

## Modes at a glance

| Mode | Auth | Who can use it | When |
|---|---|---|---|
| **Single-user** (default) | None — every request is "the operator" | Anyone with the URL | Local dev, your own iMac on Tailscale Funnel |
| **Multi-tenant** (`THEMIS_AUTH_REQUIRED=1`) | Magic-link email | Anyone who can receive email at a verified address | Production, when more than one human uses it |

Flip the mode by setting one env var. Nothing else changes — the API and
UI behave identically in both, the only difference is whether the
middleware demands a session cookie.

---

## Env-var matrix

| Var | What | Default |
|---|---|---|
| `THEMIS_AUTH_REQUIRED` | `1` enables magic-link auth + per-user matter ownership | unset (single-user) |
| `THEMIS_SECURE_COOKIES` | `1` sets the `Secure` flag on session cookies (https only) | unset |
| `THEMIS_PUBLIC_URL` | Full URL the magic-link emails point at, e.g. `https://themis.law` | inferred from request |
| `THEMIS_EMAIL_FROM` | RFC-5322 from header, e.g. `Themis <login@themis.law>` | `Themis <login@themis.law>` |
| `RESEND_API_KEY` | Resend API key for outbound email | unset (logs link to console instead) |
| `THEMIS_DB` | SQLite file path | `./data/themis.db` |
| `ANTHROPIC_API_KEY` | Claude API key for chat/analyze/synthesis | unset (deterministic fallback) |
| `THEMIS_LLM_PROVIDER` | Set to `claude-code` to use the local CLI's Max-plan billing instead of the API | unset (API) |
| `THEMIS_LLM_MODEL` | Override the default Claude model id | `claude-sonnet-4-5` |
| `COURTLISTENER_API_TOKEN` | Raises the Cite Check authority-lookup rate limit | unset (anonymous, throttled) |
| `ASSEMBLYAI_API_KEY` | Required for video/audio transcription | unset (transcription disabled) |
| `THEMIS_BACKUP_DIR` | Where the backup script writes tarballs | `~/.themis/backups` |
| `THEMIS_BACKUP_KEEP` | Retention window in days | `30` |

---

## Deploy shape A — single iMac via Tailscale

Already covered by `themis/scripts/themis-watch.sh` (auto-pulls on every
push and restarts both server + Vite). To enable auth on the iMac:

```bash
# On the iMac
cat >> ~/.themis-env <<'EOF'
THEMIS_AUTH_REQUIRED=1
THEMIS_PUBLIC_URL=https://ramons-macbook-pro.tail59e3bd.ts.net
# Get a free key at https://resend.com/api-keys
RESEND_API_KEY=re_xxx_yyyyyyyyyyyyyyyyyyyyyyyy
THEMIS_EMAIL_FROM="Themis <login@yourdomain.com>"
EOF

# Watcher already sources ~/.themis-env on restart
launchctl unload ~/Library/LaunchAgents/com.themis.watcher.plist
launchctl load   ~/Library/LaunchAgents/com.themis.watcher.plist
```

Without `RESEND_API_KEY` the server logs the magic link to the console
(`tail -f /tmp/themis-server.log`) so dev still works.

Backups (recommended even for single-machine):

```bash
bash themis/scripts/install-backup.sh
```

Daily snapshot at 03:30 → `~/.themis/backups/themis-YYYYMMDD-HHMMSS.tar.gz`,
30-day rolling retention. SQLite-safe — uses `sqlite3 .backup` for a
consistent snapshot, not a raw copy.

To restore:

```bash
mkdir /tmp/restore && tar xzf ~/.themis/backups/themis-<ts>.tar.gz -C /tmp/restore
# Stop the server, copy the DB back, restart.
launchctl unload ~/Library/LaunchAgents/com.themis.watcher.plist
cp /tmp/restore/.../themis.db   themis/server/data/themis.db
cp -R /tmp/restore/.../media    ~/.themis/media
launchctl load   ~/Library/LaunchAgents/com.themis.watcher.plist
```

---

## Deploy shape B — Fly.io (multi-tenant production)

```bash
# One-time
brew install flyctl
fly auth login

cd themis/server
fly launch --no-deploy             # creates the app; decline Postgres
fly volumes create themis_data --size 3 --region iad
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-...    \
  RESEND_API_KEY=re_...           \
  COURTLISTENER_API_TOKEN=...     \
  ASSEMBLYAI_API_KEY=...          \
  THEMIS_PUBLIC_URL=https://themis-api.fly.dev \
  THEMIS_EMAIL_FROM="Themis <login@themis.law>"
fly deploy

fly open                            # open in browser
fly logs --tail                     # live logs
```

The Dockerfile sets sensible production defaults (`THEMIS_AUTH_REQUIRED=1`,
`THEMIS_SECURE_COOKIES=1`, `THEMIS_DB=/data/themis.db`). Per-deploy
secrets live in fly secrets (encrypted, not in the image).

### Cost
~$5-10/month for a single shared-cpu-1x machine + a 3GB volume. Email
delivery via Resend free tier (3,000/mo).

### Postgres migration (when SQLite isn't enough)
The schema is already Postgres-compatible — JSON columns use `TEXT`
prefixed `json_*` which become `JSONB` in PG, `INTEGER 0/1` becomes
`BOOLEAN`. Migration path:
1. Add `pg` dep and a `db-pg.ts` that mirrors `db.ts`'s `getDb()` API.
2. Switch the import in `repo.ts` based on `process.env.THEMIS_PG_URL`.
3. Run schema.ts SQL through `psql` after substituting types.
No model code changes.

---

## Frontend deploy

The SPA is static — `npm run build` then host on Vercel / Netlify / Fly
Static. Set `VITE_THEMIS_API=https://themis-api.fly.dev` at build time
so the client points at the Fly API.

For the iMac flow the Vite dev server is already exposed via Tailscale;
no separate frontend deploy needed.

---

## Operations

- **Health check**: `GET /api/health` → `{ok: true}`.
- **Engine readiness**: `GET /api/engine/test` runs a one-shot LLM probe
  and returns ok/error + model + last error.
- **Audit chain integrity**: `GET /api/matters/:id/audit/verify` returns
  `{ broken: false, entries: N }` when the hash chain is intact; if
  someone tampered with the DB, this surfaces it with the broken row id.
- **Smoke test**: `npm run smoke` in `themis/server/` runs 119 in-process
  tests against a fresh in-memory DB — runs in ~5s.
