# Handoff: Themis — Case Brain + Worktop

This package contains the full design for the Themis evidence-intelligence app — a litigation paralegal / associate attorney tool that turns a matter's document corpus into a living, navigable case brain and a daily work surface.

The design is delivered as a working HTML/React prototype. Your job is to **recreate it inside the existing `themis/` React 19 + Vite 6 + Tailwind v4 codebase**, wiring it to the running Hono + SQLite backend at `themis/server/`. The prototype is a pixel reference, not production code to copy directly.

---

## 1 · About these design files

Everything in this bundle is a **high-fidelity design reference** — a single self-contained HTML prototype (`Themis Overview.html`) loaded with React via Babel-in-the-browser, plus modular JSX/CSS for each subsystem. The prototype uses **mock data that mirrors the real API shapes** (`themis/src/types.ts`); your task is to replace the mock data with live API calls (`themis/src/lib/api.ts`) and lift the components into proper React modules inside `themis/src/`.

The prototype already extends the existing `themis/src/index.css` design tokens. Reuse them — do not invent new colors or spacing values.

---

## 2 · Fidelity

**High-fidelity.** All colors, type, spacing, motion, copy, iconography, and component behavior are intentional. Recreate pixel-perfectly using the codebase's existing patterns (Tailwind v4 `@theme` tokens, the `lib/ui.tsx` atoms already in `themis/`). Where the prototype uses inline CSS classes that don't yet exist in the codebase, port them as Tailwind utility classes or new shared atoms.

---

## 3 · The two-mode architecture

The single biggest concept: Themis runs in **two modes**, toggled from the top bar.

### **Worktop** (default — daily use)
The work surface a paralegal lives in. Three-pane layout:

| Pane | Width | Contents |
|---|---|---|
| Left rail | 340px | Compact live brain card · Case snapshot · Cast (entity quick-list) |
| Center | flex | Tabs: **Ask Themis · Chronology · Privilege · Binder · Documents** |
| Right rail | 320px | Your Queue · Scales of Themis (mini) · Audit trail |

Ingest stages, hot docs, gap analysis, etc. surface contextually — they are not always-on chrome.

### **Case Brain** (cinematic — demo / exploration)
Full-bleed dark instrument with the force-directed graph as the centerpiece. Floating glassmorphic HUD consoles, the Causal Chain ribbon, layout switcher (force/orbital/timeline), and the "32 days" cinematic overlay. Used for partner walk-throughs, depo prep, conference-room storytelling.

Both modes share state — accepting a chronology event in Worktop tips the Scales in Brain mode, and vice versa.

---

## 4 · Files in this bundle

```
Themis Overview.html         — single-file entry; all CSS lives here; Worktop + Brain modes
Themis Logo.html             — the Tau mark studio — brass T with tilted crossbar
Themis States Icons.html     — empty/loading states, icon family, logo usage guide
data.js                      — mock data mirroring API shapes; replace with real fetches
app.jsx                      — root app, mode router, theme, keyboard handler, Tweaks
worktop.jsx                  — Worktop 3-pane layout + side-rail cards
panels.jsx                   — AskPanel · ChronologyPanel · PrivilegePanel · BinderPanel · DocumentsPanel
brain.jsx                    — Canvas force-directed graph (cinematic + compact)
inspector.jsx                — slide-in inspector for clicked nodes
scales.jsx                   — large Scales-of-Themis SVG view (used in Brain mode)
cmdk.jsx                     — Cmd+K command palette
tweaks-panel.jsx             — design-time tweaks scaffolding (skip — internal tool)
```

Plus two more design pages and the real repo contract files:
```
Themis Logo.html            — the Tau brand mark studio
Themis States Icons.html    — 24-icon family · 6 empty/loading states · logo usage guide
FILES.md                    — manifest mapping every file in this bundle
repo-reference/             — actual contract files copied from themis/src/:
  types.ts                  — authoritative data shapes
  api.ts                    — typed API client
  index.css                 — Tailwind v4 @theme tokens (do not invent new colors)
  ui.tsx                    — existing atom components to reuse
  mock.ts                   — existing mock payloads (shapes match data.js)
  BrandMark.tsx             — current brand component to replace with the Tau
```

---

## 5 · Screen-by-screen specification

### 5.1 · Top bar (cross-mode)
Fixed 56px-tall header on every screen.

**Layout:** `grid-template-columns: minmax(360px, 1fr) auto minmax(260px, 1fr)`

**Left (matter context):**
- Back chevron (`‹`) — 30×30px icon button
- Brandmark: dark glyph (`<Scale>` icon) + "Themis" (Fraunces 17px/600) + "EVIDENCE INTELLIGENCE" (Inter 8.5px tracking 0.22em, brass)
- Matter title (Fraunces 17px/600, truncated to one line)
- Sub-line: `STATUS_PIP · matterType · Lead D. Okafor`
- `STATUS_PIP`: verify-green pill with pulsing dot, "BRAIN READY"

**Center (mode toggle):**
Segmented control with two options. Active state has brass background + 1px inset border.
- **Worktop** (`□` glyph) — sub-label "daily"
- **Case Brain** (`◉` glyph) — sub-label "demo"

**Right:**
- `topbar-cmdk` search-shaped pill: "Ask anything · jump · run" + `⌘K` kbd. Click → opens command palette.
- Theme toggle (`◐`/`◑`) — 32×32px icon button

A 1px brass→transparent gradient runs along the bottom edge.

---

### 5.2 · Worktop — Left rail

#### 5.2a · Compact case brain card
- Card background: linear-gradient(to bottom, #0c1622, #070b13), 1px brass border, 14px radius
- Header strip: "CASE BRAIN" eyebrow (mono 9.5px brass) + "open ›" link (opens Brain mode)
- Canvas: 220px tall, runs the same `<Brain>` component used in cinematic mode with `showLabels={false}` and `paused={false}`. Click any node → opens that node in the Documents/Inspector panel.
- Foot: `11,920 docs · 84,213 pg · ingest 100%`

#### 5.2b · Case snapshot card
- Eyebrow "CASE" + status meta
- Matter name in Fraunces 16px/600
- Posture paragraph (Inter 12px, ink-soft, line-height 1.5)
- "PLAINTIFF THEORY" mono sub-eyebrow
- Key dates list: mono date + label, separated by hairline rules

#### 5.2c · Cast (entities) card
- Eyebrow "CAST" + entity count
- Row per entity: name (Inter 12.5px/500) above `role · mentions-count` (10.5px, brass mentions)
- Hover row → brass-wash background, 6px radius
- Click → opens entity dossier (route to Documents tab filtered by entity for now; future: dedicated dossier panel)

---

### 5.3 · Worktop — Center (tabs + panel)

#### 5.3a · Tab bar
56px high, lives at top of the center column. Inline-block tabs:
- Mono numeric `wt-tab-num` (1–5) preceding each label — keyboard shortcut hint
- Active tab: brass underline 2px + brass-light label color
- Pending/queue tabs show badge pip in flag-amber

Right edge of tab bar: hint text "`⌘K` commands · `⌘1-5` tabs"

#### 5.3b · Ask Themis panel (tab 1)

Three-section vertical stack:
1. **Panel head** (`PanelHead` atom)
   - Eyebrow "ASK THEMIS · GROUNDED CHAT"
   - Title: "Ask the brain" (Fraunces 22px/600)
   - Sub: "Every answer is grounded in verified citations. Click any Bates chip to open the source."
   - Right action: `⌘K` kbd hint
2. **Scrollable message list**
   - User messages: right-aligned, neutral surface bubble, max-width 680px
   - Themis messages: 28px brand-glyph avatar (`<Scale>`) + bubble with brass left-border, header strip `THEMIS · high confidence` (with conf-dot), body text, **grounded-in section**:
     - "grounded in" mono header
     - Verified citation chips (`bates-chip-btn.v`, ✓ + green) — clickable to open source
   - Action row under Themis bubble: `⎘ Copy with citations` · `＋ Add cited docs to binder` · `⤓ Save to brief`
   - Thinking state: 3 pulsing brass dots + "Resolving across 11,920 documents…"
3. **Suggestion chips** (first turn only): "Show me everything about the privilege flags" / "What did Tom Brandt write about Reyes?" etc.
4. **Input bar** (sticky bottom):
   - Mono `›` prompt
   - Text input (radius 7, brass focus ring)
   - Hint pills: `↵ send` · `/ commands`
   - Brass send button "Ask →"

Wire to: `POST /api/matters/:id/chat` — see §7 below.

#### 5.3c · Chronology panel (tab 2)

- **Panel head** with two output actions: `⤓ Word` (secondary) and `⤓ Court PDF` (primary brass)
- **Summary strip**: 4 cells in a row — accepted count, pending (flag-amber background), rejected, "100% citations verified" (brass-light num)
- **Vertical timeline list** with a brass spine running through Bates-stamp dot markers
  - Each row: brass pin (or flag-amber if pending), date column, status chip (`on timeline` / `draft` / `excluded`), description, issue tags + cite chip + confidence dot
  - Right-side actions: ✓ Accept (verify-green) · ↺ Reopen · ✕ Reject (icon)
  - Inter-event "+ N days" delta callout floats to the left of the spine
- **Export modal** ("Court PDF · PREVIEW"):
  - Renders an actual court-style document preview (Georgia serif on warm paper) inside the modal
  - Table: Date | Event | Source (Bates · page)
  - Footer: "Every citation in this chronology has been verified..."
  - Modal foot: Close · ⤓ Download PDF / .docx

Wire to:
- `GET /api/matters/:id/chronology` to load
- `PATCH /api/matters/:id/chronology/:eventId` for accept/reject/reset
- New endpoint suggestion: `POST /api/matters/:id/chronology/export?format=pdf|docx` returning the file (or generate client-side)

#### 5.3d · Privilege panel (tab 3)

Two-column split:
- **Left (320px) — Review queue**
  - "REVIEW QUEUE" mono header → flagged docs as cards (Bates chip + date + title + basis italic)
  - Active card: flag-amber background + 1px outset border
  - "DECIDED · APPEND-ONLY" section below — shows cleared (verify-green) and withheld (flag-amber) decisions
- **Right — Reviewer**
  - Header: Bates chip + "🔒 PRIVILEGE FLAG" pill + date
  - Title (Fraunces 22)
  - Meta card: FROM / TO / TYPE / BASIS in 80px-label grid
  - Source viewer: flag-amber left-border, monospace body
  - Action row: `✓ Clear — not privileged` (verify) · `🔒 Withhold — log as privileged` (flag) · right-aligned "decided by D. Okafor · logged to audit"
- **Generate privilege log modal**: same modal pattern as chronology, table with #, Bates, Date, Type, Author, Recipients, Basis, Decision. Foot cites FRCP 26(b)(5)(A).

Wire to:
- `GET /api/matters/:id/privilege` for queue
- `POST /api/matters/:id/privilege/:docId` with `{decision: "clear"|"withhold"}` (per existing API)
- New endpoint suggestion: `POST /api/matters/:id/privilege/log?format=pdf|xlsx`

#### 5.3e · Binder panel (tab 4)

- **Panel head**: `＋ New binder` and `⤓ Export binder (N)` (only when a binder is active)
- **Left list (260px)**: stack of binders. Active = brass background; each row shows name + exhibit count
- **Right work area**: editable binder name (inline Fraunces input), exhibit stack:
  - Draggable items (HTML5 drag/drop) with `⋮⋮` grip column, mono 2-digit numerator, label (editable inline input), meta line `bates · type · date` + `open ›` micro button, remove (×) button on the right
- Empty state: dashed-border placeholder "Empty binder. Drag documents here from the Documents tab, or use Cmd+K → 'add to binder'."

This is **new functionality** not yet in the backend. Suggested schema:
```ts
interface Binder {
  id: string;
  matterId: string;
  name: string;
  items: { docId: string; label: string; order: number }[];
  createdAt: string;
  createdBy: string;
}
```
New endpoints needed:
- `GET /api/matters/:id/binders`
- `POST /api/matters/:id/binders` `{name}`
- `PATCH /api/matters/:id/binders/:binderId` `{name?, items?}`
- `POST /api/matters/:id/binders/:binderId/export?format=pdf` (returns labeled exhibit set)

#### 5.3f · Documents panel (tab 5)

- **Filter bar** (top of left column): mono `⌕` icon + filter input + result count
- **Left list (280px)**: scrollable doc list with Bates chip + HOT/priv tag-mini + date + title + author. Selected A → brass background, Selected B (compare mode) → info-blue background.
- **Right viewer area**: 1 or 2 columns
  - Shift-click another row → opens side-by-side. Each `DocView` shows a 28px colored side badge (A=brass, B=info), full meta card (FROM/TO/THREAD/OCR), the source body (mono 12px on paper) with brass left-border, and the thread pin list at bottom.
  - Action row under each: `⎘ Copy Bates cite` · `＋ Add to binder` · `⌬ Mark hot` · `↺ Reviewed`
- Privileged doc view shows a wall card instead of body (diagonal hatched flag-amber background)

Wire to:
- `GET /api/matters/:id/documents` for list
- `GET /api/matters/:id/documents/:docId` for body
- `GET /api/matters/:id/search?q=` for the filter input
- `POST /api/matters/:id/documents/:docId/review` for "Reviewed" / "Mark hot" toggles

---

### 5.4 · Worktop — Right rail

#### 5.4a · Your Queue card
- Eyebrow "YOUR QUEUE" (brass-light) + count
- Tasks built from `chronology.accepted === null` (3) + `privilege === "flagged"` (3)
- Each row: glyph (✦ or 🔒) + label + sub (1-line truncated) + `›` go arrow
- Urgent (privilege) rows: flag-amber tinted background
- Foot: keyboard hint "A accept · R reject · J/K step"

#### 5.4b · Scales of Themis (mini)
- Compact SVG scales (180×100 viewBox)
- Beam tilts with 800ms cubic-bezier spring as `(plaintiff_weight - defense_weight) / total` changes
- Readout below: `▲ PLAINTIFF` + grounded number (Fraunces 26px) · mini progress bar · `▽ DEFENSE`
- Weights computed from `support` edges where target is `accepted === true`; weight = 3/2/1 by confidence

#### 5.4c · Audit trail card
- Eyebrow "AUDIT TRAIL · APPEND-ONLY"
- Entries: mono action (uppercase brass) · detail · actor · ts
- 4 most recent entries; clicking opens full audit view

Wire to: `GET /api/matters/:id/audit` for actual entries.

---

### 5.5 · Brain mode (cinematic)

Full-bleed dark canvas (`<Brain>`) with three floating overlays:

1. **Left console** (332px, top-left, glassmorphic): Case Theory · Ingest Pipeline · Gaps
2. **Telemetry ribbon** (top, between consoles): PAGES · DOCUMENTS · ENTITIES · HOT · PRIV. QUEUE — five mono numeric cells, 18px count, 9px sub
3. **Right console** (356px, top-right, glassmorphic): Scales meter · Hot documents · Chronology · Audit

Bottom strata (full width, glass):
- **Causal-chain ribbon** with the cinematic "32" Fraunces numeral, the 5-node retaliation arc as cards with `+15 days` deltas, "5/5 links verified" verify-green stat. On hover → ribbon turns brass-active; the brain spine glows.
- **Filter ribbon**: layout segmented (Force/Orbital/Timeline) · `⟗ HIGHLIGHT CAUSAL CHAIN` button · filter chips · stage readout · pause · replay
- **Time scrubber** (only in Timeline layout): drag thumb across 2019–2021; canvas nodes appear/disappear by date

#### 5.5a · The brain rendering (brain.jsx)

Canvas force-directed graph at ~80 visible foreground nodes + ambient mass. Key implementation notes for production:

- **Render layer**: Canvas2D + manual force simulation (in prototype). For production at full 11,920-doc scale, switch to **`cosmograph`** (GPU, scales to 100k+) or **`sigma.js` + `graphology`** with level-of-detail clustering.
- **Three layouts**:
  - `force`: gravitational center + edge springs + elliptical bounds + privilege "wall" attractor pulling flagged docs to lower-left
  - `orbital`: concentric rings — center (Maria Reyes), inner (entities), middle (events), outer (docs), halo (ambient + claims/defenses at extremes)
  - `time`: X = position on timeline (2019-2021), Y = kind band; ambient/non-temporal nodes hidden
- **Particle flow**: photons travel along verified-citation edges (~one per 1500ms per edge) — both visual delight and cognitive payoff (grounded = animated)
- **Causal chain spine**: a quadratic-curve arc through the 5 retaliation nodes; pulses brass when `causalHighlight=true`
- **Ingest assembly animation**: replay drives sequential reveal — docs stream in, entities condense out, privileged nodes retreat to the wall, brain settles and breathes. Stage progression: 0→1800ms upload, →2800 OCR, →3600 Bates, →4600 dedup, →6800 extract, →8200 privilege, →∞ settled.

---

### 5.6 · Command palette (Cmd+K)

Modal overlay; shroud + glass panel positioned 14vh from top.

- **Input row**: `⌘K` mono brass prompt-pill + 16px input + `esc` chip
- **List** grouped by section: NAVIGATE / MODE / ACTIONS / ACTIONS · OUTPUT / OPEN DOCUMENT / ENTITIES / ASK THEMIS
- Each row: glyph + label + (optional) detail + (optional) shortcut chip
- Selected row: brass-wash background, brass-light label color
- Fuzzy filter (BM25-ish): match against label + section + keywords
- **Footer**: `↑↓ navigate` · `↵ run` · `esc close`

Keyboard:
- ↑/↓ to move, ↵ to run, ⎋ to close
- Auto-focus on input when opened

Built-in commands include:
- Go to each tab (`⌘1`–`⌘5`)
- Switch mode (Brain / Worktop)
- Toggle theme (`⌘D`)
- Replay ingest
- Generate privilege log / chronology / binder
- Accept next pending chronology event (`A`)
- "Open document" for every Bates ID in the corpus
- "Show [Name]'s dossier" for every entity
- Quick canned questions

---

## 6 · Global keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` or `/` | Open command palette |
| `⌘D` | Toggle light/dark theme |
| `⌘1` … `⌘5` | Jump to Ask · Chronology · Privilege · Binder · Documents |
| `A` (not in field) | Accept next pending chronology event |
| `R` (not in field) | Reject next pending chronology event |
| `J` / `K` (in Documents) | Next/prev document |
| `Shift+click` (in Documents list) | Open second pane for side-by-side compare |
| `↵` (in chat) | Send question |
| `?` | Open shortcut help (TODO) |

Implementation pattern in prototype: `useShortcuts({...handlers})` hook in `app.jsx`. Lift to a `useGlobalShortcuts` hook + a `ShortcutHelpOverlay` component.

---

## 7 · State management

Use the existing typed `api.ts` client. Suggested store layout (Zustand or TanStack Query):

```ts
// Per-matter slice (one instance per route /matters/:id)
{
  matter: MatterDetail,
  documents: DocItem[],
  chronology: ChronEvent[],
  entities: Entity[],
  privilegeQueue: PrivilegeFlag[],
  binders: Binder[],
  chatHistory: ChatTurn[],
  audit: AuditEntry[],
  // UI state
  mode: "worktop" | "brain",
  theme: "dark" | "light",
  activeTab: "ask" | "chronology" | "privilege" | "binder" | "documents",
  selectedDocId: string | null,
  compareDocId: string | null,
  cmdkOpen: boolean,
  brainLayout: "force" | "orbital" | "time",
  brainFilter: "all" | "hot" | "privileged" | "unverified" | string,
  brainTimeAt: string,
  causalHighlight: boolean,
}

// Derived selectors:
// - scales: plaintiff/defense weights from chronology + supports edges
// - taskQueue: pending chronology events + flagged docs
// - hotDocs: documents.filter(d => d.hot)
```

Use TanStack Query for server state; mutations call PATCH/POST endpoints and invalidate caches.

---

## 8 · Design tokens (already in `themis/src/index.css`)

Tailwind v4 `@theme` block. Do not introduce new colors — use these.

```
PAPER     #f7f4ee   SURFACE #ffffff   SURFACE-SUNKEN #f1ece3
INK       #18222e   INK-SOFT #56636f  INK-FAINT #8a93a0
LINE      #e6dfd2   LINE-STRONG #d8cfbd

BRASS     #a67c3a   DEEP #845f27   SOFT #ddc79a   WASH #f3ead8
VERIFY    #2f7a57   WASH #e3f1ea
FLAG      #b06a12   WASH #f7ecd9
DANGER    #b3261e   WASH #f8e4e2
INFO      #2f5fa6   WASH #e6edf7

FONTS     Fraunces (display)   Inter (UI)   JetBrains Mono (Bates, telemetry)
RADII     7px (controls) · 9-12px (cards) · 14px (modals) · 999px (pills)
MOTION    150ms ease (micro), 200-300ms ease-out (panels), 800ms cubic-bezier(.4,1.6,.4,1) (scales beam)
```

**Dark-mode tokens** (used by Brain canvas always, by Worktop when `data-theme="dark"`):
```
BG-0 #070b13   BG-1 #0c1622   BG-2 #131e2c   BG-3 #1a2535
INK  #e4eaf1   INK-SOFT #9aa6b3   INK-FAINT #5f6973
GLASS-BG  rgba(13,22,34,0.66) with backdrop-filter: blur(18px) saturate(140%)
```

---

## 9 · API integration map

| UI element | Endpoint | Notes |
|---|---|---|
| Worktop left rail · compact brain | `GET /matters/:id/documents` + `entities` + `chronology` + `caseTheory` | All sources for the graph |
| Worktop left · Case snapshot | `GET /matters/:id` → `caseTheory`, `keyDates` | |
| Worktop left · Cast | `GET /matters/:id/entities` | |
| Worktop center · AskPanel | `POST /matters/:id/chat` | Replace `setTimeout` stub with real call; render `ChatTurn` |
| Worktop center · ChronologyPanel | `GET /matters/:id/chronology` + `PATCH .../:eventId` | |
| Worktop center · PrivilegePanel | `GET /matters/:id/privilege` + `POST .../:docId` | Existing endpoints |
| Worktop center · BinderPanel | **NEW** `/matters/:id/binders` CRUD | See §5.3e schema |
| Worktop center · DocumentsPanel | `GET /documents`, `GET /documents/:docId`, `GET /search?q=` | |
| Worktop right · Your queue | derived from chronology + privilege | client-side selector |
| Worktop right · Scales mini | derived from chronology + edges | client-side selector |
| Worktop right · Audit | `GET /matters/:id/audit` | |
| Brain mode · Telemetry ribbon | `GET /matters/:id` aggregates | Live counters during ingest |
| Brain mode · Causal chain ribbon | derived | The "32-day" arc is hardcoded for Reyes; abstract as **named causal chains** stored per matter |
| CommandPalette · doc / entity jumps | local index | Build a search index of bates + titles + entity names |
| Export buttons (chronology / privilege log / binder) | **NEW** `POST .../export?format=` | Server-side render PDF (e.g. via Puppeteer or a Word-doc generator) |

---

## 10 · New backend work suggested

1. **Binders** — full CRUD per matter (see §5.3e schema and endpoints)
2. **Export endpoints** — PDF/DOCX for chronology, privilege log, binder
3. **Causal chains** — store named arcs per matter:
   ```ts
   interface CausalChain {
     id: string;
     matterId: string;
     name: string;        // "Retaliation timeline", "Pretext sequence"
     nodes: { kind: "event" | "doc", id: string }[];
     verifiedCount: number; // computed
     createdAt: string;
   }
   ```
4. **Review state per doc** — `reviewed: boolean`, `reviewedBy`, `reviewedAt`, `markedHotBy`, etc.
5. **Saved searches / smart folders** (future)
6. **Time tracking** — auto-track time per matter, billable 6-min increments

---

## 11 · Recommended implementation order

A pragmatic 2-sprint plan:

### Sprint 1 — Worktop foundation
1. Set up the Worktop 3-pane layout in `src/screens/matter/MatterShell.tsx` (replace current tab shell)
2. Port the existing `Overview.tsx` content into the **left rail snapshot card**
3. Build **AskPanel** wired to `POST /chat` (already exists in backend)
4. Build **ChronologyPanel** with accept/reject — uses existing `PATCH /chronology/:eventId`
5. Build **PrivilegePanel** with clear/withhold
6. Build the **right rail** (Queue + Scales mini + Audit) — all derived from existing data
7. Port the compact brain (use `react-force-graph` or `cosmograph` for production-scale rendering)
8. Add keyboard shortcuts hook + Cmd+K palette

### Sprint 2 — Outputs + Brain mode
1. **Binder** CRUD (new endpoints + UI)
2. **Documents** split + side-by-side compare
3. **Export** chronology / privilege log / binder as PDF (server-side render)
4. **Brain mode** (cinematic) — port the full canvas with three layouts + causal chain ribbon + time scrubber
5. **Inspector** as a shared component used in both modes
6. **Light theme** (data-theme="light" overrides) + theme persistence in localStorage

### Sprint 3 — Polish + new surfaces
1. **Causal chains** (multi-arc support, save/name/load)
2. Entity dossier panel
3. Cite-check tool (paste a draft, verify all Bates citations)
4. Onboarding tour
5. Per-doc review state + assignment surface

---

## 12 · Brand identity — the Tau mark

See `Themis Logo.html` for the studio reference.

The brand mark is a brass capital **T** (the Tau) with a deliberately tilted crossbar. The entire product thesis is compressed into one shape:

- **Vertical stem** = the plumb. Truth is fixed.
- **Crossbar tilted exactly −7°** = weight is being applied; the case is never neutral.
- **Left end of crossbar** = a solid filled block — grounded, verified evidence.
- **Right end** = a dashed outline — floating, pending evidence.
- **Small ink dot at the join** = the fulcrum, the decision point.

### Color contracts
- On paper → brass + ink fulcrum (default)
- On ink → brass-light + paper fulcrum (instrument mode; matches Brain canvas)
- On brass → ink (ceremonial, single color)
- Mono → all brass or all ink (never half-and-half)

### Authoritative geometry (do not fork) — viewBox `400×400`
```svg
<!-- Stem (plumb) -->
<rect x="186" y="110" width="28" height="210" rx="3"/>
<!-- Stem base -->
<rect x="156" y="310" width="88" height="14" rx="3"/>
<!-- Crossbar group, rotated about stem-top center -->
<g transform="rotate(-7 200 110)">
  <rect x="68" y="92" width="264" height="28" rx="4"/>          <!-- beam -->
  <rect x="48" y="84" width="32"  height="44" rx="4"/>          <!-- left weight (grounded) -->
  <rect x="324" y="92" width="22" height="28" rx="3"
        fill="none" stroke-width="4" stroke-dasharray="3 4"/>      <!-- right weight (pending) -->
</g>
<!-- Fulcrum -->
<circle cx="200" cy="110" r="6" fill="#070b13" stroke="#e9cf95" stroke-width="1"/>
```

### Size reductions (built-in, not optional)
- **≥40px:** full mark with dashed right weight
- **24–40px:** drop the dashed weight; thicken the solid block; keep the tilt
- **16px favicon:** just the T with tilted crossbar (single fill), no fulcrum

### Clearspace + minimums
- Half the mark's height of clearspace on all four sides
- Never below 16px on screen / 6mm in print — below that, use the wordmark

### The one rule
**Never correct the tilt.** Do not skew, 3D-transform, drop-shadow, emboss, recolor outside the palette, or place the mark on a busy / low-contrast background.

### Wordmark
Fraunces 600 (opsz 144), default tracking. Standalone where the mark is too small to read; paired with the mark in app chrome, business cards, letterhead.

---

## 13 · The icon family

See `Themis States Icons.html` §1 for the full grid. A custom 24×24 line set that **replaces every emoji / unicode glyph** used during prototyping (🔒 ⚠ ✓ ★ etc.).

### Construction rules
- **24×24 viewBox** · 1.6px stroke · rounded caps + joins
- Two angle conventions: strict **90°** for stable elements, **−7°** for anything communicating weight/imbalance (matches the Tau crossbar)
- Geometric primitives only — no decorative flourishes

### Color rules
- Default `brass` (#a67c3a) for navigation + primary actions
- Semantic only when the icon **is** the meaning: `verify-green` (#2f7a57) for verified/check · `flag-amber` (#b06a12) for pending/lock/privilege · `danger` (#b3261e) for hot
- **Never** colorize a navigation icon — the semantic palette is reserved for state

### Roster (24 in the kit)
`doc · brain · scales · verified · pending · privileged · search · chron · entity · binder · cite · copy · export · hot · audit · replay · pause · arrow · close · add · cmdk · filter · ask · arc`

### Implementation
Inline SVG React components under `themis/src/icons/` (one per file) or a single sprite. **Never load an icon font** — semantic SVG only, with accessible names for screen readers. Extension rule: any new icon must match the conventions above; reject gradients, multi-stroke widths, or shadows.

---

## 14 · States — empty, loading, watermarked

See `Themis States Icons.html` §2. Six states the product must ship explicitly:

1. **First-run splash** (cold start, 0 matters) — dark ground, the Tau breathing on a 4s loop, single "Create your first matter" CTA. Nothing else moves.
2. **Dashboard · no matters** — dashed-border empty card, "New matter" + "Import from Relativity", no urgency.
3. **Mid-ingest (e.g. Atlas 72%)** — partial brain (only settled nodes rendered, streaming nodes animate in), live counters (OCR / entities / hot-so-far / stage), progress rail, and a **`DRAFT · INGEST INCOMPLETE` watermark** across the canvas. **Contract:** nothing from an incomplete brain can be exported into a chronology or privilege log until the privilege scan finishes.
4. **Empty queue (earned)** — verify-green check in a dashed concentric ring, plus a stat pill (`6 on timeline · 2 decided · 0 open`). Celebrated, not bare.
5. **Empty binder** — diagonal-hatched dropzone, "Drag documents here" + `⌘K → add to binder` hint.
6. **Chat thinking** — Themis bubble with three pulsing dots, "Resolving across 11,920 documents…", sub-line "verifying citations · checking privilege wall" (the brand promise restated under load).

Every state reuses the existing tokens and the Tau; none introduces new color. Build each as a dedicated component so it is testable in isolation (Storybook-friendly).

---

## 15 · What's intentionally NOT in this design

So Claude Code doesn't need to guess:
- **Authentication** — assume the existing repo pattern; matter access checks already implied by `x-themis-actor` header
- **Multi-matter dashboard** — the `MattersDashboard.tsx` already exists; the Worktop is per-matter
- **Mobile** — desktop-first, ≥1100px. The prototype collapses rails below 1100px but the experience is meant for desks
- **Settings / preferences** — beyond theme, none yet
- **Real-time collaboration** — future
- **Print stylesheet** — exports go via the modal preview → server-side PDF route, not browser print

---

## 16 · Open product questions

These should be answered before Sprint 1:
1. **Causal chains** — one per matter (Reyes hardcoded) or user-saved arcs from day one?
2. **Binder labels** — paralegal-named (free text, current design) or template-driven ("Exhibit A, B, C…")?
3. **Privilege log format** — single FRCP 26(b)(5)(A) format, or jurisdiction-aware (e.g. CA Civ. Proc.)?
4. **OCR confidence** — surfaced everywhere or hidden until a threshold breach?
5. **Light theme** — should the brain canvas also flip to light, or stay dark always (current design)?
6. **Icon delivery** — inline SVG components or a sprite sheet? (Affects tree-shaking + accessibility wiring.)

---

## 17 · Running the prototype

```bash
# In this handoff folder, just open Themis Overview.html in a browser.
# All deps are CDN-loaded; no install required.

open "Themis Overview.html"
```

To run alongside the real backend, the production app already proxies `/api` → `:8787`. Wire the components by replacing `data.js` imports with `api.ts` calls.

---

## 18 · Contact

This design was produced for the `ramicheAi/openclaw` repo, branch `claude/themis-paralegal-automation-risUw`, PR #2. Refer to `themis/DESIGN_BRIEF.md` in that branch for the original product brief and the API contract.
