# @openclaw/remotion

Render branded videos locally from the bundled [Remotion](https://www.remotion.dev) studio.

Exposes one tool, **`remotion-render`**, that the OpenClaw fleet (e.g. MAESTRO / music-ops
agents) can call to turn a registered composition + JSON props into an MP4 — no cloud, no AWS.

## Layout

- `studio/` — the self-contained Remotion project (compositions, brand presets). Its deps are
  isolated from the OpenClaw root install (it is **not** a pnpm/bun workspace member).
- `index.ts` — registers the `remotion-render` tool.
- `src/remotion-render-tool.ts` — resolves the studio, writes props to a temp file, and spawns the
  studio-local `remotion render`.

## Setup (one time)

```bash
skills/remotion/scripts/setup.sh      # installs studio deps (downloads a headless Chrome on first render)
# or:
(cd extensions/remotion/studio && npm install)
```

## Tool: `remotion-render`

| param | type | notes |
|-------|------|-------|
| `composition` | string (required) | `TitleCard`, `LowerThird`, `QuoteReel`, `CaptionedClip` |
| `props` | object | overrides the composition defaults |
| `out` | string | output path; defaults to `studio/out/<comp>-<ts>.mp4` |
| `codec` | string | `h264` (default), `h265`, `vp9`, `prores`, `gif`, … |
| `scale` | number | render scale multiplier |
| `timeoutMs` | number | default 600000 |

### Config (`openclaw.plugin.json` → config)

```json
{ "studioDir": "...", "outputDir": "...", "timeoutMs": 600000 }
```

`studioDir` also resolves from `$REMOTION_STUDIO_DIR`, else the bundled `./studio`.

## Compositions

| id | default format | props |
|----|----------------|-------|
| `TitleCard` | 1080×1350 (4:5) | `title`, `subtitle` |
| `LowerThird` | 1920×1080 | `name`, `role`, `transparent?` |
| `QuoteReel` | 1080×1920 | `quote`, `author` |
| `CaptionedClip` | 1080×1920 | `videoSrc?`, `imageSrc?`, `captions[]` |

Add new compositions in `studio/src/compositions/` and register them in `studio/src/Root.tsx`.
