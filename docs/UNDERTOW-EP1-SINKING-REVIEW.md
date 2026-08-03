# EP1 Sinking Sequence — Frame-by-Frame Review and Fix Plan

A shot-by-shot audit of `sequence-ep1-the-sinking.mp4`, done the hard way: one
frame extracted per second across all 72 seconds
(`qc/sequence-ep1-review-frames.jpg`), plus dense walks of the suspect shots and
measured audio checks against every sync point the picture offers. Verdict up
front: **the cut works as a scene — the descent reads, the reveal lands — and
almost nothing in it survives contact with a continuity checklist.** The gap
between "passes the gates" and "great" is enumerated below, and most of it
traces to two root causes.

---

## The two root causes

**1. There is no environment element.** Every shot was prompted independently,
so every shot invented its own natatorium. The art protocol solved exactly this
problem for faces — a character is never generated from text alone, because text
cannot hold a face. **Text cannot hold a building either.** The pool needs what
the cast already has: a locked reference element (deck wide, water-level,
underwater — one venue, one time of day), cited in every shot prompt.

**2. The mix has no events, only states.** The audio is beds + heart + tone —
beautiful as atmosphere, and it never *touches* the picture. The script names
five hard sync moments (buzzer, body hitting water, the scream that costs him
his air, Bo's dive, the smash cut) and the mix marks none of them. A scene
where sound and picture never collide feels pre-scored in the bad sense:
authored apart, married politely, never in the same room.

---

## Visual findings, by shot

| # | t | finding | severity |
|---|---|---|---|
| V1 | 0–5s | **Lane numbers are wrong**: two blocks both read LANE 4, flanking a LANE 5. Real pools number sequentially. | medium |
| V2 | 6–9s | **Caustics render as glowing teal veins** on his face and throat — reads as a power tell on dry land, which the eye rule spends the whole sequence protecting. Should be soft rippling light, not emissive lines. | high |
| V3 | 10–11.5s | **The Eye plays at 3.3× speed.** The 5s clip was crushed into 1.5s, so a beat scripted as "held, nearly frozen" visibly churns. A flash-frame should also be *shorter* — 0.5–0.75s. | medium |
| V4 | 12s | **Time of day jumps.** Shot 04 is bright daylight with a scoreboard; shots 01–02 are moody late afternoon. Two adjacent blocks both read LANE 4 again. | high |
| V5 | 13–16s | **The block is now LANE 3.** He climbed lane 4/5 and fell off lane 3. Roof becomes a metal shed; a chain-link fence appears. | high |
| V6 | 16–24s | **Red/white lane ropes from nowhere** (they were blue/white at the surface); triangular skylights that no other shot has; and the **bracelet appears on both wrists** in several frames. Panic thrash also plays at 0.63× (5s stretched to 8s), which softens the violence the beat needs. | high |
| V7 | 24–30s | Featureless void — acceptable as the transformed space, but the cut from 06's bright chlorine daylight to near-black one cut later is a grade cliff. | low |
| V8 | 30–38s | **Shot 08 is a sunken ruin, not a pool**: stone steps, arches, algae, coral — and **fish** swim through the god-rays. Identical fault to the one already re-shot on 12, missed because the midpoint QC frame looked painterly. Fish in a chlorinated school pool breaks the subjective-transformation rule outright: the light may become ocean; the room must stay a pool. | **critical** |
| V9 | 38–44s | **The hands are monstrous** — long dark talon-nails, scaly forearm texture. Canon keeps every human grounded; these are creature hands. Worse, **the fingers never uncurl**: the entire story beat of the shot (fear physically leaving the body) does not occur. Six seconds of clawed hands staying clawed. | **critical** |
| V10 | 44–49s | **Tears roll down his cheeks underwater.** Tears cannot bead or roll in water — there is no interface. The reveal itself is otherwise the best shot in the piece. | medium |
| V11 | 50–60s | **The clip drifts internally**: framing jumps wide → chest-up → mid, the tiled floor turns into a violet grid, the walls become abstract chevrons, the starting blocks vanish — inside one "camera does not move" shot. Also 5s stretched to 10s = effective 12 fps. | high |
| V12 | 60–69s | Re-shot wide holds, but **Bo's rescue dive is missing** — the script has the surface shiver as he hits the water, and the surface stays glass. The gallery crowd also doesn't match shot 05's fence-level crowd. | medium |
| V13 | 69–72s | Gouda good (v3). Ribbon reads new-blue, canon says faded. Push-in acceptable. | low |
| V14 | throughout | **The scripted on-screen heart numbers are absent.** Canon puts 90 / 110 / 130 / 150→140 / 90–60–40 / **34** on screen; it is the show's stat-sheet motif, and the mix's heartbeat gives it a free sync anchor. Omitted entirely. | high |

**Physics summary:** underwater tears (V10); fish in chlorine (V8); retimed
water (slow-motion splash droplets in 06, strobing heel-slip in 04) — water
motion is the giveaway of retiming, and the fix is native-length clips, not
setpts. Bubble behaviour, buoyancy logic (he sinks *because* the scream cost
him his air), and the light-for-depth grammar all hold.

## Audio findings

Measured, with a chastened instrument: the first transient detector reported
every event PRESENT — and reported the same +5–12 dB "events" in four windows
where nothing happens. It was counting heartbeats. Band-limited spectral
checking against no-event controls tells the truth:

| # | t | finding | severity |
|---|---|---|---|
| A1 | 11.5s | **No buzzer.** The BZZZT is a *named beat in the cue sheet* — the flinch that causes the fall — and the mix contains nothing. 2–8 kHz shows no burst. | **critical** |
| A2 | 13.0s | **No splash.** At the instant of impact the HF band is *quieter* than the frames around it. The most physical moment of the scene is silent. | **critical** |
| A3 | 16s | **No scream/air burst.** "His scream costs him his air" is the mechanism of the whole sinking — unmarked. | high |
| A4 | 9.5–11.5s | **"SOUND drops away" never happens.** Script: the world goes silent inside his head before the buzzer. Measured: −22.8 dB before, −22.7 dB during. The doctrine's own line — *silence is a resource* — goes unspent at the one place the script asks for it. | high |
| A5 | ~66.5s | **No entry for Bo** (pairs with V12): a muffled splash heard *from below*, fathom-treated, would sell both the rescue and the POV. | medium |
| A6 | — | **Dialogue opportunities, all Route A (sync-free):** Bo's "Hey. Kai. Look at me, not the water." off-screen at ~9s while we are on Kai's face; Mirei's rising stopwatch count, heavily fathom-treated, heard from under during the held wide; Gouda's whisper "…No. Not that. Not *him*." riding the smash cut and the tail. Tier-B previz voices, filename-marked, timing-only. | medium |

## Instrument findings (the QC that let these through)

- One midpoint frame per shot cannot see **drift within a shot** (V11) or
  **off-midpoint content**. Upgrade: sample 10% / 50% / 90% of every shot.
- Nothing checks **across** shots. Upgrade: a continuity checklist per air-shot
  — lane number, rope colour, light direction, roofline, bracelet wrist — the
  same field-by-field discipline the element plates now get.
- A transient detector must pass **no-event negative controls** before its
  verdicts count. Mine didn't, and cheerfully found a splash that isn't there.

---

## The fix plan

**Phase 1 — the world and the score touch (audio, no generation cost).**
Add an `events` layer to the cue-sheet schema: `{t, sound, gain_db, fathom}`.
Buzzer (synthesized — a school buzzer is signature-tier, 20 lines), splash and
water-thrash (Splice, licensed into the manifest), scream-air burst, Bo's
muffled entry at 66.5. Add a `duck` automation block: world bus → near-silence
9.5–11.5s so the buzzer detonates out of quiet. Extend `verify_scene.py` with
an events check — transient within ±150 ms of each declared event, validated
against no-event control windows. Re-render, re-gate. *This is the largest
quality jump per credit spent: zero credits.*

**Phase 2 — the environment element (root cause 1).**
Generate the venue once: "Seiran natatorium" — deck wide, water-level, and
underwater-tiles plates, late afternoon, blue/white ropes, LANE 4, one
roofline. Lock as a reference element alongside the cast. Then regenerate the
five air/surface shots (01, 02, 04, 05, 06) against it, with V1/V2/V4/V5/V6
corrections in the prompts. ~15 credits stills + ~40 clips.

**Phase 3 — the two critical underwater shots.**
Re-shoot 08 (pool floor: tiles, lane stripe, drain covers — *no ruins, no
fish*; the ocean arrives as light and scale only) and 09 (a boy's hands,
short clean nails, one bracelet, and the fingers **actually open** across the
shot — generate with start *and* end framing so the beat completes). Fix V10
by trimming the reveal before the tear frames. ~25 credits.

**Phase 4 — native-length clips for the long windows.**
Shots 06, 08, 11, 12 get 10s generations instead of 5s-stretched — kills the
12 fps judder and the slow-motion water. Re-pin 11 with stronger static-camera
language and the same still as start frame. ~45 credits.

**Phase 5 — the scripted screen elements.**
The heart numerals (90→130 on the block; 90/60/40 settling; **34** held),
rendered as restrained diegetic UI keyed to the cue sheet's bpm curve and
pulsing with the heartbeat stem — canon device, free sync. The Eye tightened to
0.75s (beat change in the cue sheet, so mix and cut move together). Bo's entry
added to 12's tail. Dialogue passes from A6 if wanted.

Estimated generation spend: ~125 credits against a current balance of ~165.
Phases are independent and ordered by quality-per-credit; Phase 1 costs
nothing and should happen regardless.

---

*Evidence: `qc/sequence-ep1-review-frames.jpg` (72 frames, 1/s, labeled).
Audio measurements reproducible from the checks in this document's history;
the corrected detector methodology is required for the Phase 1 gate.*
