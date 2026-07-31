# Themis Server

Local backend for the Themis prototype: a TypeScript REST API over SQLite. The
AI pipeline (OCR, retrieval, chat synthesis, privilege screening) lives behind
clean service interfaces with deterministic, corpus-grounded stub
implementations — no external models or API keys required.

## Run

```bash
npm install
npm run seed       # create + seed ./data/themis.db (add --reset to rebuild)
npm run dev        # tsx watch, http://localhost:8787
npm run start      # run once (also auto-seeds if the DB is empty)
npm run smoke      # in-process test of every endpoint (in-memory DB)
npm run typecheck  # tsc --noEmit
```

Node 22+. The DB path is `./data/themis.db`; override with `THEMIS_DB`
(`THEMIS_DB=:memory:` for an ephemeral DB). Port via `PORT` (default 8787).

## Design

- **`schema.ts`** — SQLite DDL kept Postgres-compatible (notes inline) so it
  lifts to Supabase with minimal edits. JSON-bearing columns are prefixed
  `json_`.
- **`repo.ts`** — queries + row→API serializers. The API returns the camelCase
  shapes the frontend already expects, so there is no translation layer in the UI.
- **`services.ts`** — the AI-pipeline seam: `SearchService`, `ChatService`,
  `PrivilegeService`, and `verifyCitation`. Replace the stub impls with real
  providers (Azure Document Intelligence, an embedding model, Claude) without
  touching routes or the data model.
- **`routes/`** — Hono handlers grouped by concern (matters, corpus, workspace).
- Every mutation writes to an append-only **audit log** scoped to the matter.

### Trust primitives (enforced server-side, not just in the UI)

- **Citation verification** — a citation is `verified` only when its Bates id
  resolves to a real document in the matter and the page exists. Computed at
  seed time for chronology/seed-chat and at answer time for chat.
- **Privilege is flagged, never decided** — `scan` is advisory (phrase + known
  counsel name screening); a human `decide`s `cleared`/`withheld`, and the
  decision is audited.
- **Chat respects privilege** — flagged/withheld documents are excluded from
  retrieval so privileged content never surfaces in answers.

## API

Base: `/api`. Mutations accept an optional `x-themis-actor` header (default
`D. Okafor`) recorded in the audit log.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness. |
| GET | `/api/matters` | All matters with computed `hotDocs` / `privilegeQueue`. |
| GET | `/api/matters/:id` | Matter detail: case theory, ingest stages, gap findings. |
| GET | `/api/matters/:id/audit?limit=` | Audit trail (newest first). |
| GET | `/api/matters/:id/documents` | Documents in the matter. |
| GET | `/api/matters/:id/documents/:docId` | Single document. |
| GET | `/api/matters/:id/search?q=&limit=` | Lexical search; ranked hits + matched terms. |
| GET | `/api/matters/:id/chronology` | Chronology events with verified citations. |
| PATCH | `/api/matters/:id/chronology/:eventId` | Body `{ accepted: true \| false \| null }`. |
| GET | `/api/matters/:id/entities` | Resolved entity cast. |
| GET | `/api/matters/:id/privilege` | Privilege review queue. |
| POST | `/api/matters/:id/privilege/scan` | Advisory re-scan; returns potential flags. |
| POST | `/api/matters/:id/privilege/:docId` | Body `{ decision: "cleared" \| "withheld" }`. |
| GET | `/api/matters/:id/chat` | Chat history. |
| POST | `/api/matters/:id/chat` | Body `{ question }`; returns a grounded, cited answer. |

Errors are JSON `{ error, hint? }` with appropriate status codes (`400`
validation, `404` not found, `500` unexpected).

## Lifting to Supabase / Postgres later

The schema is written against Postgres semantics (see `schema.ts` notes:
`INTEGER 0/1 → BOOLEAN`, `json_* TEXT → JSONB`, ISO `TEXT → TIMESTAMPTZ`). The
repo/service split means the migration is: port the DDL, swap the
`better-sqlite3` calls in `repo.ts` for a Postgres client, and add RLS policies
keyed on `matter_id` to enforce the per-matter conflict wall.
