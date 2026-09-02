# UNDERTOW — Release Kit

The distribution tail, treated as pipeline. Studying how commercial AI-film
products (SuperCool Film Maker et al.) package their output made one thing
clear: their generation layer offers this project nothing, but their insistence
that **poster, teaser, and release metadata are production steps — not
afterthoughts** — is correct, and worth stealing. This document is that tail,
built the way everything else here is built: from the same cue sheets, under
the same gates.

## The assets

| asset | file | source of truth |
|---|---|---|
| 30s teaser | `docs/assets/undertow/sequence-ep1-teaser.mp4` | `audio/scene-ep1-teaser.json` |
| EP1 sinking sequence (72s) | `docs/assets/undertow/sequence-ep1-the-sinking.mp4` | `audio/scene-ep1-the-sinking.json` |
| Key art poster | `docs/assets/undertow/poster-deep-calls-to-deep.png` (+ alt, + 4K) | element registry |
| Theme | `docs/assets/undertow/undertow-theme.wav` | `build-score.py` |
| Title cards | `sequence/ep1-teaser/card-*.png` | teaser cue sheet `cards` |

The teaser cost **zero generation credits**: every frame is an existing
episode plate or a locally rendered card, cut to a 30-second compression of
the sinking scene's own arc. That is the doctrine paying rent — because the
scene is a document, a second cut of it is a second document, not a second
production.

## Metadata (copy-paste tier)

**Title:** UNDERTOW (逆流 / Gyakuryū)

**Logline:** The boy who cannot swim is the one the water wants.

**Synopsis (short):** Kai Nakamura is the only student at Seiran High who
cannot swim — until the day he sinks to the bottom of the school pool and the
water refuses to let him drown. A sports anime where the martial art is
depth, the arena is the open sea, and the thing calling from below knows his
name.

**Tags:** anime, original anime, sports anime, swimming, supernatural,
shounen, ocean, freediving, AI-assisted animation

**Platform notes:**
- YouTube / X: 16:9 master as-is; title card carries the wordmark, no
  end-card needed under 60s.
- TikTok / Reels / Shorts: reframe to 9:16 via `reframe` on the master
  (center-weighted; shots 06/09/12 of the teaser are card/center-composed and
  survive the crop). Do not letterbox.
- Thumbnail: the eyes-open frame (teaser 23s) or the poster crop — never the
  fall; the hook is the calm, not the slapstick.

**Cadence (from the roadmap):** teaser now, then chapter/teaser drops on a
fixed cadence per Phase 2/3 of `UNDERTOW-ROADMAP.md` once the manga pipeline
is rolling.

## What the score adds (and where it lives)

The teaser and the sinking sequence now carry actual music, three tiers:

1. **The composed cue** (`build-score.py --cue <scene>` → `scores/<scene>.wav`)
   — the CALL/ANSWER grammar scored to the scene's own shot boundaries; its
   own mix bus (D/M/E separation holds).
2. **Licensed musical beds** — three Splice sources pitched into D minor and
   run through the texture tier (`panic-strings`, `midnight-shimmer`,
   `deep-drone`), fathom-placed so the music descends with Kai. Licences in
   `textures/SAMPLES-MANIFEST.md`.
3. **The ANSWER tone** — already in the scene; the cue hands off to it at the
   abyssal floor rather than doubling it.

Every mix change re-ran the gates: descent trend, brightness range, width,
reversed + stationary negative controls, and the per-event onset gate.

## The rule this file exists to remember

> Distribution assets are cut from cue sheets, not from leftovers. If a
> teaser needs a shot the episode does not have, that is a note on the
> episode, not a side-quest for the teaser.
