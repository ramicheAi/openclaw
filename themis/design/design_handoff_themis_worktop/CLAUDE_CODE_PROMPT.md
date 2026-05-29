# Claude Code starter prompt

Paste this into Claude Code (in the `openclaw` repo, on branch `claude/themis-paralegal-automation-risUw`) to begin implementation.

---

You are implementing a redesign of the Themis app at `themis/`. A complete design package is in the `design_handoff_themis_worktop/` folder at the repo root — start by reading `design_handoff_themis_worktop/README.md` in full.

The design is a working HTML/React prototype. Recreate it in the existing `themis/` codebase (React 19 + Vite 6 + Tailwind v4 + Hono backend) using the codebase's established patterns. The prototype is a pixel reference, not production code to copy.

## Phase 1 — Foundation (do these first, in order)

1. **Read** `design_handoff_themis_worktop/README.md` end-to-end.
2. **Inspect** `Themis Overview.html` in a browser to see the design live. Click around — Worktop mode, all 5 tabs, then switch to Case Brain mode, hover the causal chain ribbon, open Cmd+K.
3. **Map the existing code**: `themis/src/screens/matter/MatterShell.tsx` is the current shell. The redesign replaces its tab content with the Worktop layout and adds Case Brain as a sibling mode.
4. **Set up the mode toggle** in `MatterShell.tsx`:
   - Add a `mode: "worktop" | "brain"` URL parameter (e.g., `?mode=brain`) so it's bookmarkable
   - Build the top-bar segmented control per §5.1 of the README
   - Render either `<Worktop matterId={id} />` or `<CaseBrain matterId={id} />`

## Phase 2 — Worktop shell

5. Create `themis/src/screens/matter/Worktop/Worktop.tsx` with the 3-pane grid (340 / flex / 320). See §5.2–5.4.
6. Move existing `Overview.tsx` content into a `CaseSnapshotCard` in the left rail.
7. Build the `TaskQueue`, `ScalesMini`, and `AuditTrailCard` (all derived selectors from existing API data) in the right rail.

## Phase 3 — Work panels (one per sprint)

For each, follow the existing patterns in `themis/src/screens/matter/`:
- `AskPanel.tsx` — wire to `POST /api/matters/:id/chat`; uses `ChatTurn` type. Citation chips clickable.
- `ChronologyPanel.tsx` — wire to existing `GET /chronology` + `PATCH /chronology/:eventId`. Includes the timeline-spine visualization (use CSS, not a library).
- `PrivilegePanel.tsx` — wire to existing `GET /privilege` + `POST /privilege/:docId`. Side-panel reviewer.
- `BinderPanel.tsx` — **new endpoints required**; see §10 of README. Implement backend Binder CRUD in `themis/server/` first.
- `DocumentsPanel.tsx` — wire to existing endpoints; implement Shift+click side-by-side compare.

## Phase 4 — Brain mode + outputs

8. Port the canvas-based force-directed graph (`brain.jsx`) using **`cosmograph`** for production scale (11.9K docs). Keep the three layouts (force/orbital/timeline).
9. Build the cinematic chrome: telemetry ribbon, causal-chain ribbon, time scrubber, layout switcher, "32 days" overlay.
10. Implement export endpoints (server-side PDF rendering): chronology, privilege log, binder.

## Phase 5 — Cross-cutting

11. Command palette (`cmdk.tsx`) — global Cmd+K. Use `cmdk` npm library for fuzzy filtering.
12. Global keyboard shortcuts hook — see §6 of README.
13. Light theme — add `[data-theme="light"]` overrides at the `index.css` `@theme` layer.
14. Cinematic overlay — auto-dismiss after 1.5s.

## Phase 6 — Brand, icons & states (read `Themis Logo.html` + `Themis States Icons.html`)

15. **Tau mark** — implement `<BrandMark>` from the authoritative SVG in README §12. Three color contracts (paper / ink / brass), three size reductions (≥40 / 24–40 / 16px), `breathe` animation for the splash. Export `logo.svg`, `logo-dark.svg`, `favicon.ico`.
16. **Icon family** — build the 24-icon set (README §13) as inline SVG React components under `themis/src/icons/`. Replace every emoji / unicode glyph currently in the prototype (🔒 ⚠ ✓ ★ etc.) with these. Wire accessible names. 24×24, 1.6 stroke, brass default, semantic color only when the icon IS the meaning.
17. **Empty / loading states** — build all six from README §14 as dedicated, Storybook-testable components: first-run splash, dashboard-no-matters, mid-ingest (with the `DRAFT · INGEST INCOMPLETE` watermark + the export-lock contract), empty-queue, empty-binder, chat-thinking.
18. **Logo usage guard** — enforce clearspace + minimum sizes in `<BrandMark>` (it should refuse to render below 16px and warn in dev). Ship the do/don't guide into the team's design docs.

## Constraints

- **Do NOT introduce new colors or fonts** — use the existing `@theme` tokens in `themis/src/index.css`.
- **Do NOT copy the prototype's CSS verbatim** — port to Tailwind utility classes or shared atoms in `lib/ui.tsx`.
- **Do NOT skip TypeScript** — every prop should be typed against the existing shapes in `themis/src/types.ts`.
- **DO preserve the audit trail** — every mutation should write to `/audit` via the existing pattern.
- **DO match the trust UX patterns** exactly (§4 of `themis/DESIGN_BRIEF.md`): verified vs unverified, privilege wall, confidence visibility, draft-until-accepted.
- **DO honor the ingest-incomplete contract** — a matter below 100% ingest shows the DRAFT watermark and CANNOT export a chronology or privilege log until the privilege scan completes.
- **DO use the Tau and icon family everywhere** — no emoji, no icon fonts, no off-palette color. Never correct the −7° tilt of the mark.

## Open product questions to surface to the team (don't guess)

See §16 of the README — six questions about causal chains, binder labels, privilege log format, OCR confidence visibility, light-theme scope for the brain canvas, and icon delivery format. Pause and ask before committing decisions on those.

## When done

Confirm against the running prototypes:
- `open design_handoff_themis_worktop/Themis Overview.html` — Worktop + Brain modes
- `open design_handoff_themis_worktop/Themis Logo.html` — the Tau mark
- `open design_handoff_themis_worktop/Themis States Icons.html` — states, icons, logo usage

Every visible element should have a real-data counterpart in production.
