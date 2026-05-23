# Themis — Evidence Intelligence (V2 prototype)

A frontend prototype for **Themis**, evidence intelligence for litigation paralegals.
It turns a pile of evidence into a navigable, citable, summarized corpus organized as
an isolated **case brain** per matter.

It exists to make the V2 product shape concrete and to serve as a design reference.

## Run

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # type-check + production build
npm run preview  # serve the production build
```

Requires Node 22+.

## Backend

A local API + SQLite backend lives in [`server/`](./server). It models the full
domain (matters, documents, citations, chronology, entities, privilege, audit)
and stubs the AI pipeline (search, chat-with-citations, privilege screening)
behind clean service interfaces. See [`server/README.md`](./server/README.md).

```bash
cd server && npm install && npm run dev   # http://localhost:8787
```

The Vite dev server proxies `/api` to `http://localhost:8787` (override with
`THEMIS_API`). A typed client for every endpoint is in
[`src/lib/api.ts`](./src/lib/api.ts). The current screens render from mock data
(`src/data/mock.ts`); the API client is ready for the next iteration of the UI
to consume in place of the mocks.

## What it shows

- **Matters dashboard** — every case is an isolated brain behind a conflict wall; ingest
  progress, hot-doc and privilege counts at a glance.
- **Overview** — case theory (`context.md`), claims/defenses, ingest pipeline
  (premium OCR, dedup, email threading, citation verification), hot-doc binder,
  and gap analysis.
- **Documents** — split viewer: original page (Bates-stamped) beside the Themis
  extraction (summary, metadata, entities, OCR confidence, privilege flags, near-dup
  clustering, email thread position).
- **Ask Themis** — chat over the corpus where **every claim cites a Bates page** and
  citations are verified against the source; confidence is surfaced; an audit trail
  records every query and edit.
- **Chronology** — draft timeline with verified citations, issue tags, and
  human accept/reject per row.
- **Cast** — entity resolution across aliases with relationships and mention counts.
- **Privilege** — flag-only review queue. Themis flags potential privilege; a human
  clears or withholds every document. Decisions are logged.

## Trust thesis (encoded in the UI)

- No uncited claims; citations carry a verified badge.
- Confidence is always visible, never buried.
- The original document is one click from any summary.
- Privilege is flagged, never decided, by the system.
- Every action is logged to a per-matter, replayable audit trail.

## Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · lucide-react.

## Design language

Warm "paper + ink" palette with a brass accent (the scales-of-justice motif),
a serif display face (Fraunces) for headings over Inter for UI. Built to feel
authoritative and trustworthy without the enterprise-software heaviness of incumbents.
