---
name: undertone
description: Sound department for animation and film work — score, effects, voice, and lip-sync treated as one timing-driven pipeline. Use when spotting a script into cues, choosing or checking a character voice, generating a mouth chart for a line, building a scene's audio, deciding how to frame a shot that has dialogue in it, or verifying that generated lip-sync actually works. Also use when planning any shot with a speaking character, because the shot-design decision comes before generation, not after.
---

# Undertone

The sound department, as one pipeline. Built for the UNDERTOW anime project but
the method is general: any animation or generated-video work with dialogue in it.

## The one idea everything follows from

Sound design at scale and character lip-sync look like two problems. They are
one, and naming it correctly makes the fix simple: **the picture and the sound
get authored independently and married at the end.** That works for a mood reel
with no talking. It collapses the moment a mouth moves, because you cannot sync a
mouth to a voice that does not exist yet.

Every animation tradition that does dialogue well solved this the same way —
**pre-scoring.** Record the voice first. Derive the mouth chart from the
recording. Animate to the chart.

> **Author the audio first, as data. Render the picture from it.**
> **Nothing is married at the end because nothing was ever separate.**

## Deciding how to shoot a line

Do this **before** generating anything. It is the cheapest decision in the
pipeline and the most expensive to reverse.

**Route A — design the shot so it needs no sync.** Target ≥60% of dialogue
delivered off-mouth. This is craft, not evasion; it is what anime actually does.
Over-the-shoulder, back of head, reaction cutaway on the key line, wide shot,
hair across the face, the character turning away. Off-screen and V.O. lines are
sync-free before anyone does any work — find them first, they are free.

**Route B — audio-driven generation.** Feed the recording to a model that accepts
an audio reference and animates to it. Works better than expected, with specific
documented limits — see `references/measured-findings.md` before relying on it.

**Route C — the fallback that always works.** Re-time the *voice* to the mouth
you got: measure the picture's open/closed envelope and shift or reword the VO so
its closures land where the picture already closes. Normal practice on real
productions.

**A before B before C.** No shot ships with a visible mouth that misses a
closure.

## The mouth set — eight shapes and a rest

| | shape |
|---|---|
| `A` | open wide — jaw down, lips relaxed and apart |
| `E` | mid open — lips slightly spread, jaw half |
| `I` | spread — corners wide, teeth nearly together |
| `O` | rounded open — lips forward in a ring |
| `U` | small round — lips pushed forward, tight aperture |
| `M` | **CLOSED** — upper and lower lip in contact |
| `F` | lower lip drawn under the upper teeth |
| `C` | narrow consonant — teeth close, lips neutral |
| `X` | rest — closed, relaxed, no articulation |

Two of the eight do nearly all the perceptual work and neither is a vowel: `M`
and `F`. Nobody consciously reads vowel shapes; everybody catches a missed
closure.

## The three chart rules, and none contains the word "or"

A rule with an "or" in it gets exploited. Each of these commits to one behaviour.

1. **Closures are absolute.** Every M, B and P closes the lips. Never merged,
   never softened, never dropped for being short.
2. **Anything under two frames is absorbed** into its neighbour. A mouth that
   hits every phoneme flaps. Rule 1 outranks this one.
3. **The mouth leads the sound by exactly one frame.** The eye forgives early and
   never forgives late.

## Casting a voice

**Measure the pitch; do not pick by name.** Median fundamental frequency is
checkable and a preset's name is not. Rough speaking-F0 bands, which overlap
heavily and are guidance rather than rules: adult male 85–155 Hz, adolescent male
130–200 Hz, adult female 165–255 Hz, child 200–300 Hz.

**Cast adolescent boys with women.** Japanese production routinely does, because a
woman working in her lower register lands where a teenage boy's voice actually
lives — around 150–170 Hz — with a lightness an adult man has to fake. When this
was measured across nine presets, the only candidate that landed in band *without
any pitch shifting* was a female voice.

**Check a voice on material like the material it will perform.** F0 rises with
vocal effort: the same voice measured 144 Hz on a calm read and 182 Hz on an
angry one. A single calm line is not a casting test.

**Two tiers, and the split is what keeps the plan reversible.** Tier A is a real
human for anything an audience or a buyer hears — synthetic voice reads as cheap
and discounts the whole package. Tier B is synthetic, previz only, marked in the
filename, used purely to derive timing so picture can be built before casting.
Because the pipeline is timing-driven, swapping B for A later needs no
re-animation — that is just ADR.

**Pitch settles nothing about casting.** Timbre, weight, accent and performance
decide it, and none of them is measurable. Send candidates to a human to listen.

## Sound design at scale: three tiers by ownership need

- **Signature — synthesised, owned.** Themes, stingers, motifs. Anything the
  audience *learns to recognise*. This is the IP; it must be original.
- **Texture — licensed.** Water, crowd, room tone, cloth, impacts. There is no
  artistic argument for synthesising a door slam. This is where scale comes from.
- **Derived — processed.** Everything else is one of the above through the house
  DSP.

And the rule that makes them cohere: **every sound passes through the same
acoustic space.** A licensed field recording and a cue written from scratch share
no timbre, tuning or authorship — but run both through one room and they were
recorded in the same place, because acoustically they now were. That is a house
sound, and it is about twenty lines of code.

## Verification, which is most of the value

Everything here is built on one standard:

> **A detector that has never been shown a real fault is not a detector.**

- **Plant a defect on purpose and require the check to find it** before you
  believe anything else it says. An uncalibrated sync detector clears
  everything, which looks exactly like success.
- **Every test gets a negative control** — run it on material where it should
  FAIL. A test that passes on treated and untreated alike is measuring nothing.
- **A self-test on synthetic material proves the arithmetic, not the method.**
  This one cost three separate bugs. Clean tones do not exercise what breaks on
  real signal.
- **Check the distribution, not just the summary statistic.** A median hides a
  bimodal failure completely — in one case 48% of frames pinned against a search
  boundary while the median still looked plausible.
- **Grade a shot against the recording, not against the chart.** The chart is an
  intermediate; the audience hears the recording. Grading against an intermediate
  is how a good take gets rejected.

## Housekeeping that gets expensive if skipped

- **Keep D/M/E stems separate from day one** — Dialogue, Music, Effects on
  independent tracks. Every distributor requires it and international dubbing is
  impossible without an M&E track.
- **Keep a per-sample licence manifest** for anything from a sample library.
  Cheap now, painful during a rights review. Do not commit the source samples
  themselves — commit the derived, processed asset, which is a work made with the
  sample rather than a copy of it.
- **Silence is a resource.** Full silence is the loudest tool available, and only
  lands if the rest of the mix is disciplined enough to earn it.

## What this pipeline cannot do

State these rather than discovering them:

- **It cannot hear.** Every audio claim is a measurement, not a listen. Attach a
  number and a reproducible script to each one, and send a human to spot-listen
  at the two places measurement is weakest: *does it sound like the character*
  and *does the mix feel good.* Those are taste.
- **The chart only covers the mouth.** Blinks, head bobs and breath-holds are
  sequence properties with no instrument. Human eyes, or the same treatment —
  author the timing first.

## Tooling

The reference implementation lives in the **openclaw** repo under
`docs/assets/undertow/`:

| | |
|---|---|
| `audio/dialogue.py` | pull spoken lines out of a teleplay, marking off-screen lines |
| `audio/visemes.py` | phonemes → the eight mouths, and the per-frame chart |
| `audio/align.py` | energy-envelope alignment by dynamic programming |
| `audio/undertone.py` | CLI: `spot` a script, `chart` a line, `lines` a script |
| `audio/cmudict.dict` | CMUdict vendored whole, so nothing needs the network |
| `mastering.py` | the mastering chain and the acoustic-space function |
| `qc/verify_lipsync.py` | calibrates the sync instrument against a planted defect |
| `qc/measure_lipsync.py` | points that instrument at a real shot |
| `qc/verify_voice.py` | pitch measurement, self-testing against known tones |
| `qc/verify_acoustics.py` | proves the acoustic ladder, with negative controls |

**If that repo is not in the session**, the doctrine above still applies in full
and is the part that matters — the scripts are one implementation of it. Say so
rather than pretending the tools are present.

Full findings, with numbers and the mistakes behind them, are in
`references/measured-findings.md`. Read it before relying on Route B.
