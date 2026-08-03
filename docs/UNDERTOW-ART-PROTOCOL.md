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
| Gouda **again**, v2 | the plate that *fixed* the above | he is a white European | canon says Japanese — see below |
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

### The replacement plate can be wrong too, and a targeted review will not catch it

Gouda appears in the table above twice over, and the second time is the one worth
learning from. His v1 plate was retired for a grin and yellow eyes. The v2 plate that
replaced it fixed both — and depicted **a white European man with white hair and pale
skin**, against canon that says *Japanese, former Olympic champion*.

That error then sat in the approved element registry through a canon version bump, a
full lineup sheet and every gate run since, because nothing checks a plate against
canon; the gate checks that assets *trace* to an approved element, and this asset traced
to an approved element perfectly. It was approved. It was just wrong.

It surfaced only when the element was used for a shot that mattered:

1. Prompt says "a heavy-set middle-aged Japanese man" → comes back white.
2. Rewrite: "JAPANESE, unmistakably East Asian, warm tan skin, JET-BLACK hair" → comes
   back white again.
3. Open the element's own reference plate and look at it.

> **When a prompt cannot override a reference, the reference is what is wrong.**
> Two failed rewrites is the signal to stop rewriting and go and look at the plate.

And the review lesson, which generalises past this show: **a correction invites a
narrow re-review.** The v2 plate was checked for the grin and the eyes — the two known
faults — and cleared. Nobody re-read it against the whole canon entry, because it had
just been "fixed". A regenerated asset is a *new* asset and needs a full check, not a
diff against the specific complaint.

The cheap defence is a checklist rather than a memory: for every element plate, read the
character's canon `identity` block field by field against the picture — heritage, skin,
hair, eyes, build, signature prop — and say which field you verified. Gouda's `heritage`
field was never once compared to his face.

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

**Lead with clothing and "wholesome" for Bo and Kemar.** The content filter rejects
prompts for both — Bo comes back with a bare torso, Kemar's turnaround was refused
outright — on requests that are entirely innocuous (a heavyset boy in a knit sweater; a
seventeen-year-old in a zipped tracksuit). Framing the shot as "wholesome, family-
friendly model sheet for a school sports series… fully covered, nothing bare but hands
and face" clears it. Recording the workaround because it costs a regeneration every time
it is forgotten.

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

### A correct element does not guarantee a correct face

Kemar's expression sheet reads unmistakably as a seventeen-year-old boy — square
jaw, heavy brows, strong neck. His element is sound. And a teaser shot generated
*with that element* still came back with a face soft enough that the creator asked
whether the character was a girl.

That is worth understanding rather than just patching. An element anchors identity,
but in a fast profile shot with motion blur, spray and a turned head, the model has
very few pixels to spend on a face and **simplifies toward its own defaults**. The
defaults are softer and younger and more androgynous than most character designs.
So the drift is not a failure of the element; it is the element being outvoted by
the difficulty of the frame.

Practical consequences:

- **Check the face in the hardest frame, not the easiest one.** Sample the frame
  where the head is turned, moving, or partly occluded. The clean frames will
  always pass.
- **Restate the character's age and sex in the prompt for action shots**, in
  structural terms rather than as a label — jawline, brow, neck, shoulders — because
  "he" is a pronoun the renderer can ignore and a square jaw is not.
- **This applies to every character, not just this one.** The narrower the design
  (Mirei's narrow eyes, Bo's heavyset build, Nakaru's grey streak and throat scar),
  the more it costs when a frame simplifies.

### Two ways a frame-sampling check lies about a cut that is fine

Sampling frames out of a finished cut and laying them against the shot list is
the cheapest way to grade an edit, and it fabricated a fault twice in one pass —
both times in the instrument, never in the picture.

**1. `ffmpeg` eats stdin.** A `while read ... done < list.txt` loop that calls
ffmpeg inside it loses rows, because ffmpeg consumes the remaining lines of the
loop's own input. Fewer iterations than rows means labels drift against frames
and the sheet shows an off-by-N that does not exist in the file. Pass
`-nostdin`, and assert that the number of frames written equals the number of
rows read *and* that their ids line up.

**2. `-ss` before `-i` is a keyframe seek, not a frame seek.** On a concatenated
cut the keyframes sit at segment boundaries, so an approximate seek lands in the
neighbouring shot — which reads exactly like the edit being out of order. Put
`-ss` after `-i` for grading. It is slower and it is correct.

The tell that it was the instrument, not the cut: the concat list and the cue
sheet were both in the right order, and pulling a frame straight out of each
source clip showed every clip holding the right picture. **When the parts are
right and the assembly is right, stop suspecting the material.**

### A clip can drift inside itself, and that is a different check

The contact sheet has always been read as "is this shot right?" It also has to be
read as **"is this the same person doing the same thing for the whole clip?"** —
which is not the same question, and the second one was never being asked.

Kemar's shot passed on its opening frames and broke at four seconds: the camera
lifted above the waterline, the body started riding on top with a shadow beneath
it, and the face changed enough that the creator's note was *"looks like two
different people."* That note and *"sitting too high"* were the same defect, not
two.

So, on every clip:

1. **Sample densely enough to see a mid-clip change** — 8 to 12 frames on a six
   second shot, not 5.
2. **Read the sheet twice.** Once asking whether each frame is correct. Once
   asking whether frame 1 and frame 12 could be the same person in the same
   moment of the same shot.
3. **When it drifts, trim rather than regenerate.** Bracket the break with a
   couple of extra frames, cut at the last verified-good one, and re-verify the
   trimmed clip on its own. A six second generation yielding four usable seconds
   is completely normal in real production, and a trim is deterministic where a
   regeneration is a fresh roll of the dice.

The cut absorbs this for free, because the score measures the edit rather than
assuming it — trimming a shot moves every downstream cut point and the cue
re-syncs itself on the next build.

### Pushing hard on one fault will often break another

Fixing Kemar's face produced two takes from the same prompt. Both got the face
right — square jaw, heavy brow, unmistakably a teenage boy. One of them also
**over-rotated his head** so that both goggles cleared the water, which is the
exact head-position error that had just been fixed, and gave his hair wrap a
flag-like graphic that canon rules out for this character.

Emphasis is a budget. Loading a prompt heavily toward one attribute pulls
attention off the others, and the ones that quietly regress are usually the ones
fixed most recently — they are held by a single line each while the new problem
is being shouted at in capitals.

So when a prompt is rewritten to fix a specific fault:

- **Re-check the previously fixed faults, not just the new one.** Keep a short
  list of what this shot has already been corrected for and walk it every time.
- **Generate at least two takes and compare them against each other**, not just
  against canon. Two takes from one prompt can fail in completely different
  places, and the comparison finds regressions faster than reading either alone.
- **Prefer the take that is merely good everywhere** over the one that is
  excellent at the thing you were fixing and wrong somewhere you had already won.

### Swimming shots have a second checklist, and it is not optional

Identity is not the only thing that can be off-model. On a show whose entire
differentiator is *real competitive swimming*, the swimming being wrong is a worse
failure than a wardrobe error, because a swimmer disbelieves the whole series the moment
they catch one.

This was learned the expensive way. Two teaser shots shipped with swimmers doing a
**freestyle arm recovery underwater** — a thing that does not happen, because recovery
over the water only exists since air is eight hundred times less dense than water — and
with their **heads up**, which drops the hips and is how you draw a beginner. The gate
caught neither, because the gate only ever checked skin, hair, build and wardrobe. The
swim codex had the correct material the whole time; nothing carried it into a prompt.

So, before any shot with a person in water:

1. **What is this body doing, in one named technique?** Streamline plus dolphin kick, a
   breaststroke pullout, dynamic apnea, surface freestyle, sinking, reaching, drowning.
   If it cannot be named, it will be drawn as a generic swim and a generic swim is wrong.
2. **Say it in the prompt.** Name the technique, the head position, and the arms
   explicitly. "Head neutral, eyes down, waterline at the crown, arms locked in
   streamline, hands stacked" is a sentence that has to be written, every time.
3. **If underwater: is there an arm recovery in frame?** If yes, the shot is wrong. Kill
   it. There is no underwater recovery in any stroke.
4. **Is the head in line with the spine?** Almost every bad swimming drawing has the head
   up and the eyes forward. Almost every good one has the eyes down.
5. **Is the kit legal for where they are?** Textile jammers waist-to-knee for men on the
   surface; House second-skins only in the deep. A sleeved bodysuit in a lane-lined pool
   is a costume error.
6. **Toes pointed, lane lines above them, bubbles only if they are exhaling on purpose.**

Full reference, written for artists rather than writers:
[UNDERTOW-SWIM-CODEX.md](UNDERTOW-SWIM-CODEX.md) §6 "Drawing it right".

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

**Verify what the asset claims, not just that the file is clean.** Loudness and true peak
cannot tell you whether the Fathom ladder is audibly a ladder, so `qc/verify_signatures.py`
measures the design intent directly and fails if it is absent. Every tool in `qc/` that was
written to check the work found a bug in itself or in an assumption before it found one in
an asset — three signature checks were measuring pitch with a brightness meter, and one of
them "passed" a two-octave glissando at 309→323 Hz. When a check passes suspiciously
narrowly, doubt the instrument before you accept the result. Calibrate detectors against a
deliberately planted defect rather than a guessed threshold.

---

## Environments and background figures

Environment art carries no element lock — no character is in frame, so identity cannot
drift. That makes it feel low-risk, and it is not. Two failure modes recur:

**1. Background figures wearing scuba gear.** Three separate environment renders put tiny
divers with tanks and fins in the middle distance. The entire premise of the show is that
these people *breath-hold*; a single air tank in a background plate contradicts the series'
central rule more completely than any wardrobe error. **Zoom into every human silhouette in
an environment plate, however small.** They are usually 20 pixels tall and always drawn
from the model's idea of "underwater person", which is a scuba diver.

**2. Researched heritage flattened into generic pastiche.** The first Port Royal render was
a lovely drowned town with classical colonnades and an Italian campanile. Port Royal is a
documented English colonial Caribbean port that the sea took in 1692, and the bible commits
to real cultural grounding "researched, credited, consulted — not costume-shop pastiche".
A generic Mediterranean city standing in for it is exactly that failure, and it is worse for
Freewater than for any other House, because Freewater's whole story is a real lineage being
refused recognition.

So: **name the period, the region and the building types in the prompt, and name what to
exclude.** The corrected brief asked for brick-and-timber merchant houses, sash windows, a
squat square church tower with a weathervane, waterfront warehouses, timber wharves and a
bastioned brick fort — and explicitly forbade campaniles, spires, colonnades and domes.
Then verify the named features are actually present at zoom before registering.

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
  is a stronger reference. Rebuilding Kai's element on a turnaround would tighten his
  identity to match.
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
