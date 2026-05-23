# Themis — Design Brief & Context Pack

This is the single source of truth for designing the Themis UI. It is written to
be handed to a designer or pasted into Claude (design mode) to generate screens.
Everything here is backed by a **real, running API** (see `server/`) and a real
data model — the visuals are not decoration over fake data; every node, edge,
weight, and citation can be fetched live.

---

## 1. What Themis is (the one breath version)

> Litigation teams drown in evidence. **Themis** ingests a matter's entire
> document corpus and turns it into a **living case brain** — every document,
> person, event, and claim becomes a node; every thread, relationship, and
> citation becomes a connection. As evidence is ingested, the brain *visibly
> assembles itself*. Nothing is asserted without a verified citation back to a
> source page, and privileged material is walled off, not guessed at.

Named for **Themis**, the Greek titaness of divine justice who holds the
**scales** and the **sword** — order weighed against chaos. The product makes
that metaphor literal and interactive.

**Audience:** litigation paralegals and associate attorneys. They are precise,
skeptical, and accountable. The UI must feel like a **premium instrument** —
think *Bloomberg terminal meets a finely bound case file*: dense, fast,
trustworthy, never toy-like.

**Emotional goal:** the user should feel the chaos of 84,000 pages *resolve into
order* in front of them — and trust every claim because they can click straight
through to the page it came from.

---

## 2. The signature experience — "The Case Brain"

This is the hero. Get this right and the product sells itself.

### 2.1 Concept

A **force-directed knowledge graph** that represents one matter. It is not a
static diagram — it **grows and settles in real time as ingestion runs**, then
becomes a navigable map of the case. Two complementary views share the same
underlying graph:

1. **The Brain** — the full node/edge constellation (the "what do we have").
2. **The Scales of Themis** — the same evidence re-projected as a balance that
   **tips** as verified, accepted evidence accrues to each *claim* vs each
   *defense* (the "what does it mean / who's winning").

A toggle (or a smooth camera transition) moves between them. The Brain is
exploration; the Scales are argument.

### 2.2 Nodes (what the dots are)

Every node maps to a real API record. Visual encoding:

| Node type | Source | Size encodes | Color (from palette) | State markers |
| --- | --- | --- | --- | --- |
| **Document** | `GET /documents` | page count | ink / type-tinted | **hot** = brass glow + pulse; **privileged** = lock badge + walled (dimmed, can't expand body) |
| **Entity** (person/org) | `GET /entities` | `mentions` (1842 → big hub) | info-blue | hover reveals aliases, role, org |
| **Event** | `GET /chronology` | confidence | verify-green if accepted, neutral if pending | **dashed ring** if citation unverified |
| **Claim / Defense** | matter `caseTheory` | fixed, prominent | brass (claims) / ink (defenses) | anchor nodes; gravity wells |
| **Citation** | embedded in events/chat | small | green (verified) / amber outline (unverified) | the trust atom — see §4 |

Hubs (high-mention entities, the termination event) should naturally float to
visual centers via force layout. Hot documents should draw the eye.

### 2.3 Edges (what the lines are)

| Edge | Meaning | Source | Visual |
| --- | --- | --- | --- |
| **Thread** | emails in one conversation | `doc.threadId` | thin solid, animated draw on reveal |
| **Relationship** | "reported complaint to", "supervised" | `entity.relationships` | labeled on hover, directional |
| **Citation link** | claim ⟵ supported by ⟵ document | chat/event citations | **green = verified**, amber dashed = unverified; thickness = how many times cited |
| **Timeline** | event → next event | chronology order | faint chronological spine |

### 2.4 The "loading up" animation (the moment that wins the demo)

Drive the assembly off the **real ingest pipeline stages**
(`matter.ingestStages`): `Upload → OCR → Bates stamp → Dedup + threading →
Extraction → Privilege scan`.

Sequence as each stage completes:

1. **Upload / OCR** — raw document nodes *stream in* from the edges, scattered,
   dim, "unprocessed" (grayscale). A page counter ticks up (`84,213 pages`).
2. **Bates stamp** — nodes get their ID label; snap to a faint grid briefly.
3. **Dedup + threading** — duplicate nodes *collapse into* their canonical node
   (satisfying merge animation); thread edges **draw** between emails.
4. **Extraction** — entities *condense out* of the documents (particles fly from
   docs to form person/org hubs); relationship edges connect them; the layout
   relaxes into clusters.
5. **Privilege scan** — flagged nodes get a **lock** and visibly **retreat
   behind a wall** (a subtle frosted boundary); they stay in the graph but
   become inert/dimmed.
6. **Settle** — force simulation cools; the brain "breathes" (slow idle drift).

For a matter that's still ingesting (e.g. **Atlas, 72%**), show this *live and
partial* — a progress aura, nodes still streaming, the unfinished stages greyed.
For a finished matter (**Reyes, 100%**), play a fast assembly on first load then
rest. Respect `prefers-reduced-motion`: offer an instant-assembled state.

### 2.5 Interactions

- **Hover node** → halo + glanceable tooltip (Bates, title, date, 1-line summary).
- **Click node** → camera focuses, neighbors highlight, a **side panel** slides
  in with the real record (the document body, the entity dossier, the event +
  its citation). This is the bridge from "pretty graph" to "actual work."
- **Click a citation edge** → "show me why" — surfaces the exact source passage;
  a verified badge if it grounds out, a warning if not.
- **Filter** by issue tag (`Pretext`, `Retaliatory Motive`, `Causation`…),
  date range, entity, or doc type — non-matching nodes fade, matching paths
  brighten.
- **Search** (wired to `GET /search`) → matching nodes pulse; the rest dim;
  optionally trace the path from query → supporting docs.
- **Drag** nodes; **scroll** to zoom; **pinned** layout persists per matter.
- **"Ask the brain"** → the chat panel (`POST /chat`); when Themis answers, the
  cited nodes **light up and connect to the answer**, so the user sees the
  evidence the answer stands on.

### 2.6 The Scales of Themis (companion projection)

A second, more editorial view — literal **balance scales** (Themis' iconography):

- Left pan = **Plaintiff's claims**; right pan = **Defendant's defenses** (or
  per-claim mini-scales).
- Each **accepted + verified** chronology event / hot doc drops into the
  relevant pan as a weighted token; the **beam tilts** with accumulated weight
  and a soft physics settle.
- **Unverified or pending** evidence appears **translucent and weightless** —
  it hovers above the pan until a human accepts it and its citation verifies.
  This makes the trust thesis *visceral*: only grounded evidence moves the
  needle.
- Hovering a token highlights the same node in the Brain view (shared selection).

This is optional-but-recommended as the matter Overview hero, with the full
Brain as a dedicated expandable view. Designer's call on which leads.

### 2.7 Performance reality (so the design is buildable)

Reyes is **11,920 docs / 84,213 pages** — you cannot render 12k DOM nodes.
- Render the graph on **Canvas or WebGL**, not SVG/DOM, at full corpus scale.
- Use **level-of-detail**: at zoomed-out scale show *clusters* (by thread,
  entity, issue), expand to individual nodes as you zoom in.
- The hand-curated demo subset (the ~6 Reyes "hot" docs) can be the always-
  labeled foreground; the other ~11.9k are ambient mass that gives the brain
  its sense of scale.
- Keep the "hero, labeled" graph to ~30–80 visible nodes; everything else is
  density/atmosphere.

### 2.8 Suggested tech (the current stack is React 19 + Vite 6 + Tailwind v4)

- Graph: **`react-force-graph`** (2d canvas or `-3d` WebGL) or
  **`sigma.js` + `graphology`** (great for large graphs + clustering) or
  **`cosmograph`** (GPU, scales to 100k+). For a stylized 3d brain,
  `react-force-graph-3d` (three.js under the hood).
- Motion / micro-interactions: **`framer-motion`** (`motion`), **`react-spring`**
  for physics (scale tilt, token drop).
- Scales physics: lightweight custom spring, or `@react-spring/web`.
- Numbers/counters: `framer-motion`'s `animate` on a motion value.
- Keep it all client-side; the graph data comes from the API (§3).

---

## 3. The data & API (this is the context that makes design *real*)

A running backend (`themis/server/`) exposes everything below over REST. The
frontend dev server proxies `/api` to it. A typed client is in
`themis/src/lib/api.ts`. Full reference: `themis/server/README.md`.

**Base:** `/api`. Mutations accept optional `x-themis-actor` header (audited).

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/matters` | matter cards w/ computed `hotDocs`, `privilegeQueue` |
| GET | `/api/matters/:id` | matter detail: `caseTheory`, `ingestStages`, `gapFindings` |
| GET | `/api/matters/:id/documents` | document corpus |
| GET | `/api/matters/:id/documents/:docId` | one document (body, thread, OCR confidence) |
| GET | `/api/matters/:id/search?q=` | ranked hits + matched terms |
| GET | `/api/matters/:id/chronology` | events w/ **verified** citations, accept state |
| PATCH | `/api/matters/:id/chronology/:eventId` | accept / reject / reset an event |
| GET | `/api/matters/:id/entities` | entity cast w/ mentions + relationships |
| GET | `/api/matters/:id/privilege` | privilege review queue |
| POST | `/api/matters/:id/privilege/scan` | advisory re-scan (potential flags) |
| POST | `/api/matters/:id/privilege/:docId` | clear / withhold (human decision) |
| GET / POST | `/api/matters/:id/chat` | history / ask a grounded, cited question |
| GET | `/api/matters/:id/audit` | append-only audit trail |

### Example: a matter card (`GET /api/matters`)

```json
{
  "id": "reyes-northwind",
  "name": "Reyes v. Northwind Logistics",
  "client": "Maria Reyes",
  "matterType": "Employment — Wrongful Termination",
  "leadAttorney": "D. Okafor",
  "status": "In Review",
  "pages": 84213,
  "docs": 11920,
  "ingestPercent": 100,
  "lastActivity": "12 min ago",
  "hotDocs": 4,
  "privilegeQueue": 2
}
```

### Example: a grounded answer (`POST /api/matters/:id/chat`)

```json
{
  "role": "themis",
  "text": "4 documents in this matter bear on your question. NW-000847 (2021-02-11): Reyes reports unpaid overtime… Every citation below is verified against its source page.",
  "citations": [
    { "bates": "NW-000847", "page": 1, "verified": true },
    { "bates": "NW-000851", "page": 1, "verified": true },
    { "bates": "NW-001502", "page": 1, "verified": true }
  ],
  "confidence": "high"
}
```

### The seeded matter to design around: **Reyes v. Northwind**

A wrongful-termination retaliation case. The *story the brain should tell*:
a wage complaint (2021-02-11) → HR acknowledges → a sudden first-ever negative
review **15 days later** → an internal memo referencing "the complaint
situation" → termination **32 days after** the complaint. Two documents are
**privilege-flagged** (in-house counsel L. Stein). This causal chain is the
spine the visualization should make obvious. Entities: Maria Reyes (plaintiff,
1842 mentions), Tom Brandt (ops mgr), Greg Hollis (HR), Linda Stein (counsel).

---

## 4. Trust UX — non-negotiable patterns

These are the product's reason to exist. They must be **visible and consistent**
in every design:

1. **Verified vs unverified citations.** A claim with a *verified* citation
   (resolves to a real Bates + page) gets a solid green check + clickable Bates
   chip. *Unverified* gets an amber dashed treatment and cannot masquerade as
   fact. Never show a citation styled as trusted unless `verified: true`.
2. **Privilege wall.** Flagged/withheld docs are visually quarantined (lock,
   frosted/dimmed, body hidden). The system **flags**; a **human decides**
   (clear/withhold). Show the decision affordance and that it's logged.
3. **Confidence is honest.** `high / medium / low` shown plainly (e.g. a small
   meter), never hidden. Low-confidence extractions look provisional.
4. **Human-in-the-loop.** Chronology events are **drafts** until a human
   accepts. Accept / reject / reset must be one click and feel consequential
   (this is what moves weight onto the Scales).
5. **Audit everything.** Every mutation appears in the audit trail; surface a
   "who did what when" rail. Accountability is a feature, not fine print.

---

## 5. Screen inventory

Built today as a mock-data prototype (to be redesigned). Map of intent:

| Screen | File | Role in the redesign |
| --- | --- | --- |
| **Matters dashboard** | `src/screens/MattersDashboard.tsx` | portfolio of cases; each card a *miniature brain* preview + status |
| **Matter overview** | `src/screens/matter/Overview.tsx` | **HERO** — the Case Brain / Scales live here; case theory, ingest pipeline, gaps |
| **Documents** | `src/screens/matter/Documents.tsx` | corpus list ↔ split source viewer; thread navigation |
| **Chat** | `src/screens/matter/Chat.tsx` | ask the brain; answers light up cited nodes; audit rail |
| **Chronology** | `src/screens/matter/Chronology.tsx` | draft timeline; accept/reject; feeds the Scales |
| **Entities** | `src/screens/matter/Entities.tsx` | the cast; relationship sub-graph per entity |
| **Privilege** | `src/screens/matter/Privilege.tsx` | flag-only review queue; clear/withhold |
| **Shell / nav** | `src/screens/matter/MatterShell.tsx` | per-matter frame + tabs |

A **dedicated full-screen "Case Brain" view** is recommended in addition to the
Overview embed.

---

## 6. Visual system (extend, don't replace)

A starting system already exists in `src/index.css` (Tailwind v4 `@theme`).
Direction: **warm paper + ink** (a finely bound case file) with a **brass**
scales-of-justice accent. Consider an optional **dark "terminal" mode** for the
Brain view (deep ink background makes nodes/edges glow).

```
Fonts   Display/serif: Fraunces   ·   UI/sans: Inter
Paper   #f7f4ee   Surface #ffffff   Sunken #f1ece3
Ink     #18222e   soft #56636f   faint #8a93a0
Brass   #a67c3a   deep #845f27   soft #ddc79a   wash #f3ead8
Verify  #2f7a57 (+wash #e3f1ea)   Flag #b06a12 (+wash #f7ecd9)
Danger  #b3261e (+wash #f8e4e2)   Info #2f5fa6 (+wash #e6edf7)
```

Mapping to the graph: **verify-green = verified/accepted**, **brass = hot /
claims / the "weight" of justice**, **flag-amber = privilege/pending/unverified**,
**info-blue = entities**, **ink = structure**. Keep brass *sparing* — it's the
gold leaf, not the wallpaper.

Tone: generous whitespace around dense data, hairline rules, restrained motion
(0.2s ease), serif for headlines/the brand, mono for Bates IDs and counters.

---

## 7. Ready-to-paste prompts for Claude (design mode)

**Master prompt:**

> Design a litigation "evidence intelligence" web app called **Themis** for
> paralegals. The hero is a **living knowledge graph ("the case brain")** that
> assembles in real time as a document corpus is ingested — documents, people,
> events, and legal claims are nodes; email threads, relationships, and
> **verified citations** are edges. A companion view re-projects the same
> evidence as the **Scales of Themis**, tipping as verified, human-accepted
> evidence accrues to each claim vs defense; unverified evidence is translucent
> and weightless. Aesthetic: premium legal instrument — warm paper + ink with a
> sparing **brass** accent and an optional dark "terminal" mode for the graph.
> Fonts: Fraunces (display) + Inter (UI). Must make these trust patterns
> obvious: verified vs unverified citations, a privilege wall (system flags,
> human decides), honest confidence meters, draft-until-accepted chronology, and
> an audit trail. Design the **matter overview** screen first, with the case
> brain as the centerpiece. Use the case "Reyes v. Northwind" (wrongful-
> termination retaliation; a wage complaint → negative review 15 days later →
> termination 32 days later).

**Per-screen follow-ups:** "Now the full-screen Case Brain view with the side
inspector panel." · "Now the Scales of Themis view." · "Now the documents split
viewer with thread navigation." · "Now the grounded chat where cited nodes light
up." Pull real field names/values from §3 so generated UI matches the API.

---

## 8. Repo & run

```bash
git clone <repo-url>
cd <repo>/themis

# Frontend (React 19 + Vite 6 + Tailwind v4)
npm install
npm run dev        # http://localhost:5180  (proxies /api → :8787)

# Backend (Hono + SQLite; stubbed AI pipeline behind clean interfaces)
cd server
npm install
npm run dev        # http://localhost:8787
npm run smoke      # 31 endpoint checks, all green
```

Branch: `claude/themis-paralegal-automation-risUw` · PR: openclaw#2.
Self-contained under `themis/`; outside the host repo's build.

**Key files to read first:** this brief · `themis/server/README.md` (API +
trust primitives) · `themis/src/lib/api.ts` (typed client) ·
`themis/src/types.ts` (every data shape) · `themis/src/index.css` (design tokens).
