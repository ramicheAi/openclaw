# UNDERTOW — Art Protocol

**Why this exists.** On 2026-07-25, three consecutive attempts to enlarge Kai in the
hero poster produced a scuba tank, a cape, and a boy who wasn't Black. The creator
caught all three. Then a side-by-side audit showed the whole cast drifting — Kai's skin
lighter in the crew shot than in his own hero plate, Bo lanky in one image and heavyset
in another.

The root cause was not bad prompts. It was **generating characters from text
descriptions.** Text cannot hold a face. This document and the system around it exist so
that failure cannot recur.

Companion files:
[UNDERTOW-CHARACTER-CANON.json](UNDERTOW-CHARACTER-CANON.json) (machine-readable truth) ·
[UNDERTOW-VISDEV-BRIEFS.md](UNDERTOW-VISDEV-BRIEFS.md) (design rationale) ·
`assets/undertow/qc/` (the enforcement gate)

---

## The four laws

**1. A character is never generated from text alone.**
Every character has a locked **element ID** in the canon file. That ID goes into the
prompt as `<<<element-id>>>`. The platform injects the approved reference automatically.
For multi-character shots, use multiple placeholders — one per character.

**2. Every asset carries provenance.**
Four valid chains, strongest first:

| Provenance | Meaning | Use for |
|---|---|---|
| `element_id` | Generated with a locked element | **All new character art** |
| `derived-from-approved-plates` | Composited, zero generation | Lineup sheets, montages |
| `approved-plate-as-reference` | Plate supplied as image reference | Legacy only |
| `rejected-record` | Kept to document a rejection | Never ships |

No chain to approved identity = the commit is blocked.

**3. The creator is never the quality filter.**
Every generated asset is inspected against canon *before* it is shown. Off-model output
is discarded and regenerated — never presented as an option, never as "pick A or B."
Rejections get recorded, not hidden.

**4. An element must be built on a baseline.**
An element learns *everything* in its source plate as identity. It cannot tell a
permanent trait from a temporary one. So every character element is founded on a
**baseline reference** — flat neutral daylight, plain background, character in their
ordinary un-powered state — with atmospheric or powered plates added second.

**5. Canon changes are logged, never silent.**
Identity is checksummed. If an approved plate or baseline reference is altered or
swapped, the verifier fails loudly. Changing a character means a deliberate, recorded
amendment. Retiring an element does not orphan the art it already produced — retired
IDs stay valid for existing assets.

---

## What an element learns that you didn't ask it to

Law 4 exists because this failed twice in one day, in two different disguises.

| Character | Source plate | What the element learned | How it showed up |
|---|---|---|---|
| Luna | violet-twilight underwater | the *lighting* was her skin | blue-lavender skin on a sunlit pool deck |
| Kai | submerged pool floor | the *powered state* was his face | Undertow eye-glow on dry land |
| Ren | twilight fence, chest-up | magenta sky was his complexion; no body at all | cool violet cast, unknown build |
| Kemar | mid-race, eyes shut | a face with no eyes, permanently wet | invented eyes, glare-slick skin |
| Bo | 3D-styled harbour render | the show is rendered in 3D | wrong house style in solo shots |
| Mirei | pool deck, sunglasses on head | she doesn't wear glasses | eyewear kept migrating to her head |
| Gouda | seated, grinning, sepia room | a cheerful man with yellow eyes | contradicts his entire character |
| Nakaru | storm sea wall, face in shadow | grey weather was his skin | signature scar and streak invisible |

Kai's was the worst. The deep-blue glow is the visual tell that the Undertow is
surfacing — the whole power system reads off it. An element that thinks the glow is
just what his eyes look like will quietly break the story in every frame it touches.

Mirei's is the most instructive, though. Nobody had noticed her founding plate showed
her *bare-faced with sunglasses pushed up on her head*, when canon says glasses on the
face over narrow eyes. Every time her eyewear drifted in a group shot, the element was
being faithful — to the wrong picture. **A plate the creator approved can still be
wrong.** Approval means "I like this image," not "every pixel is canon."

None of these was a prompt problem. Every prompt said the right thing in capital letters
and lost anyway, because a reference image outranks a sentence. The only fix is to give
the element a truthful baseline to hold onto.

**So: before creating any element, ask what is in this plate that is true only right
now.** Weather, depth, time of day, an active power, wet hair, a blink, a camera tilt,
a colour grade. Whatever the answer is, generate a plate without it first.

**And ask a second question: does this plate contradict canon anywhere?** If it does,
it does not go into the element at all — not even as a second reference. Mirei, Gouda
and Bo are built on their baseline alone for exactly this reason. Their founding plates
remain canon for provenance and history; they are simply too wrong to teach from.

---

## Doing the work

**Solo character shot**
```
model: nano_banana_pro
prompt: "<<<4ee10302-b895-45ab-9680-426cb23ac03a>>> swimming down into violet
         twilight, plain dark jammers, bare arms, breath held…"
```

**Multi-character shot** — one placeholder per character, and the manifest entry
declares `element_ids` (a list). The verifier fails if a frame has more characters than
locks:
```
prompt: "<<<kai-id>>> on the pool deck with <<<bo-id>>>'s arm around his
         shoulders, <<<mirei-id>>> holding a stopwatch beside them…"
```

**State the un-powered state out loud.** Even on a baseline-founded element, say it:
"he is dry and out of the water, so his eyes are ordinary dark brown." The element
carries the likeness; the prompt carries the moment.

**Lead Bo's clause with clothing** — "wholesome and fully clothed in a cream cable-knit
sweater…". The content filter trips on him otherwise and returns a bare torso.

**Never**: "a 15-year-old mixed Black boy with deep brown skin…". That sentence is what
erased him. The element ID is not optional.

**Video** takes elements too — confirmed on Seedance 2.0, which accepts `<<<id>>>` in
the prompt alongside a `start_image`. That is strictly better than an image-to-video
from a plate: the plate only fixed frame 0, the element holds identity for the whole
clip.

### Before showing anything to the creator
1. Download the render.
2. **Open it and look at it** against the canon entry — skin, hair, build, wardrobe,
   forbidden list.
3. For a clip, sample frames across it — one frame is not a check:
   ```bash
   python3 docs/assets/undertow/qc/sample_frames.py <video.mp4> 8
   ```
   Then read the contact sheet the same way you would read a plate. Timestamps are
   printed under each frame so a defect can be reported as "drifts at 5.2s".
4. Discard anything off-model. Regenerate.
5. Register the survivor in `qc/asset-manifest.json` with provenance + sign-off.
6. Run `python3 docs/assets/undertow/qc/verify_assets.py`.
7. Only now show it.

**Sound is verified, not avoided.** An earlier version of this document said generated
audio could not be verified and therefore would not ship. That was wrong — it confused
*eyes* with *verification*. Sound has objective properties and a spectrogram is something
you can literally look at:

```bash
python3 docs/assets/undertow/qc/verify_audio.py <media> [--compare-video <silent-cut.mp4>]
```

It reports EBU R128 integrated loudness and true peak, computes a speech-band energy
ratio, renders a spectrogram into `qc/` for you to read, and — when muxing sound onto an
already-verified cut — hashes both raw h264 bitstreams to prove no frame changed.

That last check is not theoretical. The first time the teaser was scored, `-shortest`
silently trimmed **4 frames** off the end to match the audio length. Nothing in the
picture-side QC would have caught it. Use `-af apad` and an explicit `-t`, never
`-shortest`, when adding sound to a locked cut.

**Prefer real recordings to generated audio.** The teaser bed is four licensed Splice
field recordings — two of them hydrophone captures of actual underwater sound. Provenance
beats generation for sound the same way an approved plate beats a text prompt.

---

## The gate

```bash
# status of every asset
python3 docs/assets/undertow/qc/verify_assets.py --report

# install the pre-commit block (once per clone)
ln -sf ../../docs/assets/undertow/qc/pre-commit-undertow.sh .git/hooks/pre-commit
chmod +x docs/assets/undertow/qc/pre-commit-undertow.sh
```

The hook blocks any commit touching UNDERTOW art that fails verification.

---

## What this system does and does not guarantee

Being precise, because a check that *looks* rigorous but isn't is worse than none.

**Guaranteed (deterministic):**
- An approved plate or baseline reference cannot be silently altered — checksums catch it.
- Untracked art cannot ship — every file must be registered.
- No character asset ships without a traceable chain to approved identity.
- A multi-character frame cannot ship with fewer element locks than characters.
- No asset ships without a recorded visual sign-off.

**Strongly improved, not mathematically guaranteed:**
- *Visual* likeness across images. Elements bind identity far tighter than text, but
  generative models still vary pose, lighting, and rendering. The final guarantee at
  production scale is a human character designer working from the lineup sheet.

**Deliberately rejected:**
- Automated skin-tone pixel sampling. It was built, tested, and **failed** — probes
  landed on water, robes, and coats rather than skin. Shipping it would have created
  false confidence. Mandatory visual review replaces it.

**Known open items** (tracked honestly in the manifest, not buried):
- Luna's v2 element currently holds only her baseline plate — the violet underwater
  reference did not attach on creation. Renders are correct, but her underwater
  signature look is carried by prompt text until a second reference is added.
- Kai's baseline plate is a single front view. Ren's is a three-view turnaround, which
  is a stronger reference. Turnarounds for the rest would tighten identity further.
- The three posters predate elements. They are creator-verified correct, but new
  versions should use element IDs.
- Character **heights** were not in the source bible. A lineup cannot be drawn without
  them, so they were derived from each character's existing build description and
  recorded in canon (`identity.height_cm`). They are a proposal open to revision — if
  any change, rerun `build-lineup.py`.
- Kemar's cultural specifics still want a tradition-keeper pass before public release.

**Resolved:** `cast-key-visual.png` and `cast-key-visual-alt.png` were off-model
(Kai's skin light; Bo lanky). Both are superseded by `crew-key-visual.png`, generated
with four locked elements. Removed from the shipping set and recorded under
`superseded` in the manifest; recoverable from git history.

**Resolved:** `cast-lineup-sheet.png` inherited the three canon violations from the
founding plates. Rebuilt from the baseline plates as a true height chart — see below.

**Resolved:** `teaser-sinking-01.mp4` was flagged for unverified drift. Sampling its
frames showed the flag was wrong — Kai was on-model for all five seconds. The actual
defect was a push-in so aggressive that by 2.9s the surface and the pool floor were both
out of frame and the shot became a generic chest-up view; the idea of it, *a boy alone at
the bottom while the world walks past above*, was gone by the halfway mark. Redone with
the locked element and a camera that holds the full vertical depth. **Worth remembering:
the flag named the wrong problem, and only looking at the frames found the right one.**

**A note on that redo:** all four takes came back 3:4 regardless of the `aspect_ratio`
passed, because the portrait start frame overrides it. If a shot needs a specific format,
the start frame has to be in that format.

---

## The lineup sheet

`build-lineup.py` composites the eight baseline plates onto one ground line. Zero
generation: every pixel is cut from an approved plate.

Two things in it are worth knowing before editing:

**Cutting figures off their backdrop uses the ink outline, not brightness.** Bo's cream
sweater and Luna's white robe sit within ~20 levels of their grey backdrop, so a
brightness threshold punches holes straight through them. A PIL flood fill fails
differently — it compares each pixel to the *seed*, so the dark core of Luna's contact
shadow blocks it and the shadow survives whole. What works is taking the connected
light-neutral region that touches the frame edge: cel-shaded art draws a dark outline
around every figure, and that outline is the boundary. The art form hands you the mask
for free.

**Figures scale crown-to-feet, not by bounding box.** Scaling by bounding box lets
styled hair eat real height — it cost Gouda 13cm to his topknot and Luna 6cm to her
floating hair. Measuring to the crown puts each character's skull on their mark and lets
hair overshoot it, which is what a height chart means and what a model sheet should show.

Verify it rather than trusting it:
```bash
QC=1 python3 docs/assets/undertow/build-lineup.py   # also writes qc/_lineup-background.png
```
Diffing the finished sheet against that figure-free render isolates figure pixels
exactly, so each character's crown can be measured against the sheet's own grid. Last
run: worst error 0.5cm, all eight feet on the same row. Delete the QC file afterwards —
it is a scratch artifact, not an asset.
