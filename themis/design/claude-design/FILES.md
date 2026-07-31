# Themis — Design Source Bundle · File Manifest

Everything Claude Code needs to implement Themis, in one folder. Start with **CLAUDE_CODE_PROMPT.md**, then **README.md**.

## Read first
| File | What it is |
|---|---|
| `CLAUDE_CODE_PROMPT.md` | Paste-ready prompt for Claude Code. 6 implementation phases + constraints. |
| `README.md` | The full spec: 18 sections — two-mode architecture, screen-by-screen, API map, tokens, brand, icons, states, sprint plan. |
| `FILES.md` | This manifest. |

## Live prototypes (open in a browser — no install)
| File | What it shows |
|---|---|
| `Themis Overview.html` | The product. Worktop mode (Ask · Chronology · Privilege · Binder · Documents) + Case Brain cinematic mode. Cmd+K, themes, all interactions live. |
| `Themis Logo.html` | The Tau brand mark — construction, color contracts, size reductions, lockups, letterhead. |
| `Themis States Icons.html` | 24-icon family, six empty/loading states, logo usage guide (clearspace, minimums, do/don't). |

## Prototype source (loaded by `Themis Overview.html`)
| File | Role |
|---|---|
| `data.js` | Mock data mirroring the real API shapes. **Replace with `api.ts` calls.** |
| `app.jsx` | Root: mode router, theme, global keyboard shortcuts, Tweaks, Brain-mode chrome. |
| `worktop.jsx` | Worktop 3-pane layout + side-rail cards (brain, snapshot, cast, queue, scales-mini, audit). |
| `panels.jsx` | The five work panels: AskPanel · ChronologyPanel · PrivilegePanel · BinderPanel · DocumentsPanel. |
| `brain.jsx` | Canvas force-directed graph — cinematic + compact. Force/orbital/timeline layouts, particle flow, causal spine, ingest assembly. |
| `inspector.jsx` | Slide-in node inspector (doc / entity / event / claim / defense). |
| `scales.jsx` | Large Scales-of-Themis SVG (Brain-mode companion). |
| `cmdk.jsx` | Cmd+K command palette with fuzzy matching. |
| `tweaks-panel.jsx` | Design-time tweak scaffolding — **internal tool, do not port to production.** |

## Repo reference (actual contract files from `themis/src/`)
| File | Use |
|---|---|
| `repo-reference/types.ts` | Authoritative data shapes. Type every prop against these. |
| `repo-reference/api.ts` | Typed API client. Wire panels to these endpoints. |
| `repo-reference/index.css` | Tailwind v4 `@theme` tokens. **Do not invent new colors.** |
| `repo-reference/ui.tsx` | Existing atom components to reuse. |
| `repo-reference/mock.ts` | Existing mock payloads (shapes match `data.js`). |
| `repo-reference/BrandMark.tsx` | Current brand component to replace with the Tau mark. |

## Target codebase
`ramicheAi/openclaw` → `themis/` · branch `claude/themis-paralegal-automation-risUw` · PR #2
React 19 + Vite 6 + Tailwind v4 + Hono/SQLite backend at `themis/server/`.

## The non-negotiables
1. Use existing `@theme` tokens — no new colors or fonts.
2. No emoji, no icon fonts — use the 24-icon SVG family.
3. Never correct the Tau's −7° crossbar tilt.
4. A matter below 100% ingest shows the DRAFT watermark and **cannot** export a chronology or privilege log until the privilege scan completes.
5. Every mutation writes to the audit trail.
6. Match the trust UX exactly: verified vs unverified, privilege wall, confidence visibility, draft-until-accepted.
