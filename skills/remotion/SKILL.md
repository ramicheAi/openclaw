---
name: remotion
description: Create and render branded videos programmatically with Remotion (React to MP4), rendered locally. Use for title cards, lower thirds, captioned vertical clips, and quote reels for content/music-ops at volume.
homepage: https://www.remotion.dev
metadata: {"openclaw":{"emoji":"🎬","requires":{"bins":["node","npm"]}}}
---

# Remotion (programmatic video)

Render branded MP4s from React components. Built for **content/music-ops volume** — generate many
on-brand clips from props instead of editing each by hand. Rendering is **local** (no cloud cost).

## First time only

```bash
scripts/setup.sh        # installs studio deps; first render also pulls a headless Chrome (~150MB)
```

## Everyday use

List what can be rendered:

```bash
scripts/list.sh
```

Render a composition with props (props override the composition defaults):

```bash
scripts/render.sh QuoteReel --props '{"quote":"More beats better.","author":"Hormozi"}'
scripts/render.sh TitleCard --props '{"title":"GALACTIK ANTICS","subtitle":"Open the box."}'
scripts/render.sh CaptionedClip --props '{"videoSrc":"clip.mp4","captions":[{"text":"Hook","from":0,"to":40}]}'
```

Output lands in `<studio>/out/<Composition>-<timestamp>.mp4` unless you pass `--out`.

Interactive editor (live preview while you tweak):

```bash
scripts/preview.sh      # opens Remotion Studio in the browser (Ctrl+C to stop)
```

Add a new composition:

```bash
scripts/new-composition.sh MyTemplate   # then register it in studio/src/Root.tsx
```

## Batch (the volume engine)

Render many videos from one file — unattended. This is the point: volume, not per-clip hand work.

From a CSV (one composition, flat props; header row = prop names):

```bash
scripts/batch.sh examples/quotes.csv --composition QuoteReel --out-dir /tmp/reels --jobs 2
```

From a JSON jobs file (mixed compositions, custom filenames, nested props like captions):

```bash
scripts/batch.sh examples/jobs.json --out-dir /tmp/drop01
```

CSV special columns: `__out` (output filename per row), `__composition` (override per row).
Flags: `--jobs <n>` concurrency · `--out-dir <d>` · `--prefix <name>` · `--codec <c>` · `--scale <n>`.
Use JSON for `CaptionedClip` (captions are nested). ~6-7s per clip; renders run in parallel.

## Built-in compositions

| id | format | props |
|----|--------|-------|
| `TitleCard` | 1080×1350 (4:5) | `title`, `subtitle` |
| `LowerThird` | 1920×1080 | `name`, `role`, `transparent?` |
| `QuoteReel` | 1080×1920 (9:16) | `quote`, `author` |
| `CaptionedClip` | 1080×1920 (9:16) | `videoSrc?`, `imageSrc?`, `captions[]` (`{text,from,to}` in frames) |

Background media for `CaptionedClip`: a URL, or a file dropped in `studio/public/` referenced by name.

## Brand

Colors, fonts and aspect presets live in `studio/src/brand.ts`. 4:5 (`square45`) is the primary
aspect per Output Standards. Drop the exact Galactik hex/font there — every composition reads from
that one file.

## render.sh flags

`--props '<json>'` · `--props-file <f>` · `--out <path>` · `--codec h264|h265|vp9|prores|gif` · `--scale <n>`

## For the fleet (OpenClaw)

The `@openclaw/remotion` extension exposes a **`remotion-render`** tool so agents (e.g. MAESTRO)
can render in a flow: `{ composition, props, out?, codec?, scale? }`. Same engine as these scripts.

## Notes

- The studio is a self-contained Remotion project; its deps are isolated from the OpenClaw root
  install. Default location: `extensions/remotion/studio` (override with `$REMOTION_STUDIO_DIR`).
- A long clip = many frames; keep `durationInFrames` sane. Renders take tens of seconds to minutes.
