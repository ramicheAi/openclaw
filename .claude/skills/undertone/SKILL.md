---
name: undertone
description: The UNDERTOW sound department — score, effects, voice and lip-sync as one timing-driven pipeline. Use for any audio work on UNDERTOW: spotting a script into cues, registering a character voice, generating a mouth chart for a line, building a scene's mix, or checking sync. Also use when planning a shot that has dialogue in it, because the shot design decision comes before the generation.
---

# /undertone

UNDERTOW → UNDERTONE. The sound beneath the thing: score, effects and voice at
once, and the audio sibling of the show's own name.

## The one idea everything here follows from

Sound design at scale and lip-sync look like two problems. They are one, and
naming it correctly is what makes the fix simple: **the picture and the sound
were being authored independently and married at the end.** That works for a
mood reel with no talking. It collapses the moment a mouth moves, because you
cannot sync a mouth to a voice that does not exist yet.

Every animation tradition that does dialogue well solved this the same way —
**pre-scoring.** Record the voice first. Derive the mouth chart from the
recording. Animate to the chart.

> **The audio is authored first, as data. The picture renders from it.**
> **Nothing is married at the end because nothing was ever separate.**

## Modes

| | |
|---|---|
| `/undertone spot <script>` | teleplay → machine-readable cue sheet |
| `/undertone voice <character>` | record / register / lock a voice into the bank |
| `/undertone chart "<line>" <seconds>` | phonemes → per-frame mouth chart |
| `/undertone build <scene>` | cue sheet → mix + charts + prompt stubs |
| `/undertone check` | run every audio gate |
| `/undertone` | continue whatever sound work is in flight |

Everything lives in `docs/assets/undertow/audio/` with gates in
`docs/assets/undertow/qc/`. The full doctrine is `docs/UNDERTOW-SOUND-BIBLE.md`
— read it before making a decision this file does not cover.

## Sound design: three tiers by ownership need

Do not synthesise everything (does not scale) and do not switch wholesale to
samples (throws away the thing that makes the score ours). Split by what
actually has to be original:

- **Signature — synthesised, owned.** The theme, the five Fathom stingers, the
  five motifs. Anything the audience *learns to recognise*. This is the IP.
  Stays in `build-score.py` / `build-signatures.py`.
- **Texture — licensed, Splice.** Water, crowd, pool ambience, cloth, blocks,
  room tone. There is no artistic argument for synthesising a starting-block
  clang. This is where scale comes from.
- **Derived — processed.** Everything else is one of the above run through the
  house DSP.

And the rule that makes those cohere:

> **Every sound in UNDERTOW passes through the same water.**

`mastering.fathom_space(x, tier)` — six tiers, `air` through `hadal`. A licensed
crowd sample at `twilight` stops sounding like a library and starts sounding
like it was recorded in your pool, because acoustically it was. The five
underwater rows are numerically identical to the stinger table, so a stinger
sits in exactly the room its own rank describes.

Two more that are story rules made literal:

- `calm_shape(x, calm)` — "panic is the villain, calm is the stat" as
  automation. Panic is bright, hard and narrow; tunnel vision has a sound.
- `submerged_voice(x)` — and it is **not** a muffle. Muffle-plus-reverb models
  water as a barrier between a source and a dry ear. A flooded ear canal hears
  by bone conduction: direction dies (sound moves ~4× faster in water, so the
  interaural time difference collapses below what the ear can resolve), and it
  is the **bottom** that goes, not the top. Getting this right is cheap and
  reads as authority to anyone who has ever swum.

## Lip-sync: design the shot first, chart second

**Route A — shots that do not need sync. Aim for ≥60% of dialogue off-mouth.**
This is craft, not evasion; it is what anime actually does. Over-the-shoulder,
back of head, reaction cutaway on the key line, wide shot, hair across the face,
turning away. This show gets it nearly free: **underwater nobody talks**, and
above water they are behind caps and goggles, and the canon already makes
internal monologue unspoken. `dialogue.py` marks V.O. and O.S. lines
automatically — those are sync-free before anyone does any work.

**Route B — dedicated sync pass.** Generate the shot mouth-closed and neutral,
then drive the mouth from the audio. Verify what the available tooling actually
does on one line before claiming it works.

**Route C — the fallback that always works.** Re-time the *voice* to the mouth
you got. Measure the picture's open/closed envelope, then shift or reword the VO
so its closures land where the picture already closes. Normal practice.

**A before B before C, and no shot ships with a visible mouth that misses a
closure.**

## The three chart rules, and none of them contains the word "or"

A rule with an "or" in it gets exploited — that is why the swim codex let a
craned neck through twice. Each of these commits to one behaviour.

1. **Closures are absolute.** M, B and P shut the lips. Never merged, never
   softened, never dropped for being short. Nobody consciously reads vowels;
   everybody catches a missed closure.
2. **Anything under two frames is absorbed.** A mouth that hits every phoneme
   flaps. Rule 1 outranks this one.
3. **The mouth leads the sound by exactly one frame.** The eye forgives early
   and never forgives late.

## Voice identity gets the same doctrine as visual identity

Every character has a locked Reference Element. They need a locked **voice** the
same way, with the same **baseline-state warning**: whatever is in the source
recording becomes identity, *including room tone, mic distance and accent*.
Record references clean, close, dry, unprocessed.

Two tiers, and the split is what makes the whole plan reversible:

- **Tier A — anything a producer hears: a real human voice.** A producer hears
  TTS and discounts the whole package.
- **Tier B — previz only, never leaves the repo:** synthetic, marked in the
  filename, used purely to derive timing so picture can be built before casting.

Because the pipeline is timing-driven, **swapping B for A later needs no
re-animation** — you direct the real actor to the previz timing, which is just
ADR. So casting never blocks building.

## Verification

Run `/undertone check` — or `python3 qc/verify_acoustics.py` and
`python3 qc/verify_lipsync.py` directly. Both are in the pre-commit gate.

The standard these hold themselves to, which is the standard for anything added
here:

- **A detector that has never been shown a real fault is not a detector.**
  `verify_lipsync.py` plants a 5-frame offset and requires the detector to find
  it, with the correct sign, in both directions, before any of its other results
  are allowed to mean anything.
- **Every test gets a negative control.** `verify_acoustics.py` runs each
  monotonicity test a second time against untreated signal and requires it to
  FAIL there. The submerged-voice test is built specifically so a plain lowpass
  cannot pass it.

## What this pipeline cannot do, stated plainly

- **It cannot hear.** Every audio claim is a measurement, not a listen. Attach a
  number and a reproducible script to each one, and send the user to spot-listen
  at the two places measurement is weakest: *does it sound like the character*,
  and *does the mix feel good*. Those are taste.
- **The chart only covers the mouth.** Blinks, head bobs and breath-holds are
  sequence properties with no instrument yet. They need human eyes, or the same
  treatment: author the timing first.

## Housekeeping that gets expensive if skipped

- **Keep D/M/E stems separate from day one.** Dialogue, Music, Effects on
  independent tracks. Every distributor requires it and international dubbing is
  impossible without an M&E track.
- **`SAMPLES-MANIFEST.md`** — per-sample licence record for anything from
  Splice. Cheap now, painful during a rights review.
- **Silence is a resource.** The breath limit is an audio rule too. Full silence
  underwater is the loudest tool in the kit, and only lands if the rest of the
  mix is disciplined enough to earn it.
