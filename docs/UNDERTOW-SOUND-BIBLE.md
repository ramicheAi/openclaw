# UNDERTOW — Sound Bible

How this show sounds, and how that sound gets made at scale.

[UNDERTOW-SCORE.md](/UNDERTOW-SCORE.md) is the composition: the theme, the
Fathom ladder, the five motifs, the scoring rules. This document is the
department around it — effects, voice, lip-sync, delivery — and the machinery
that lets one person produce all of it without it drifting apart.

---

## 1. The one idea everything follows from

Sound design at scale and character lip-sync look like two problems. They are
one, and naming it correctly is what makes the fix simple.

The picture and the sound were being authored independently and married at the
end. That works for a mood reel with no talking. It collapses the moment a mouth
moves, because **you cannot sync a mouth to a voice that does not exist yet.**

Every animation tradition that does dialogue well solved this the same way —
pre-scoring. Record the voice first. Derive the mouth chart from the recording.
Animate to the chart. Western animation has done it since the 1930s; anime does
it for anything sync-critical and for every theatrical feature.

> **The audio is authored first, as data. The picture renders from it.**
> **Nothing is married at the end because nothing was ever separate.**

That inversion fixes lip-sync and gives sound design the spine it needs to
scale, because now one file knows what happens when.

---

## 2. The cue sheet is the single source of truth

One machine-readable file per scene. From it, four things are generated and can
never drift apart: the mix, the mouth charts, the shot-generation prompt stubs,
and the QC expectations.

```
python3 docs/assets/undertow/audio/undertone.py spot docs/UNDERTOW-EP1-SCRIPT.md
```

That emits a draft with the mechanical work done — every spoken line found,
timed by read rate, marked sync-free where the script already says the speaker
is off screen, and given a Fathom tier guessed from the slug line. The dramatic
decisions are left `null` on purpose. A spotting sheet is a creative document;
the tool only removes the typing.

Two fields are load-bearing:

| field | what it decides |
|---|---|
| `fathom` | which acoustic space the cue lives in — see §3 |
| `calm` | 0 is panic, 1 is stillness. Drives brightness and width — see §4 |

`at` is running order, not timecode. It becomes real when the picture exists.

---

## 3. Three tiers of sound, split by ownership need

The mistake would be to keep synthesising everything, which does not scale, or
to switch wholesale to samples, which throws away the thing that makes the score
ours. Split by what actually has to be original.

| tier | what | where |
|---|---|---|
| **Signature** | the theme, the five Fathom stingers, the five motifs — anything the audience *learns to recognise*. This is the IP, and it must be original and clean. | `build-score.py`, `build-signatures.py` |
| **Texture** | water, crowd, pool ambience, cloth, starting blocks, room tone. There is no artistic argument for synthesising a block clang from scratch. | licensed, Splice |
| **Derived** | everything else — Signature or Texture through the house DSP | `mastering.py` |

And the rule that makes them cohere:

> **Every sound in UNDERTOW passes through the same water.**

A licensed field recording and a stinger written from scratch share no timbre,
no tuning and no author. Run both through `fathom_space("twilight")` and they
share a **room**, because acoustically they were recorded in the same one. That
is a house sound, and it is about twenty lines of code.

### What the texture tier cannot do, and the claim that had to be withdrawn

This document used to make a stronger boast, and it was false.

The poolside crowd was built from an **art-gallery room tone**, chosen — so the
argument went — precisely because nothing about a gallery belongs to a swimming
pool. If it read as a natatorium after treatment, the treatment was doing real
work rather than flattering material that was already close.

It did not read as a natatorium. Measured with the project's own instrument, the
shipped texture had a spectral centroid of **592 Hz**, against **2006 Hz** for
`pool-surface` — the water it has to sit beside. The deck was three times darker
than the pool.

That is not a cosmetic error, and it did not stay contained. Rendering the
Episode 1 sinking sequence, it **inverted the entire scene**: the mix got
brighter as Kai sank, because it opened on the dullest material in the library
and moved toward the brightest. The one thing that sequence has to do is get
darker.

The deck is now a competitive indoor sports hall — hard surfaces, shouting, a
whistle over the top. A gymnasium and a natatorium are acoustic cousins. It
measures **1805 Hz** after treatment, a 1213 Hz correction, and it now sits
above every underwater texture as it must. It also sits at **`air`**, not at
`sunlit`: the deck is dry land, and it had been placed at an underwater rank.

> **`fathom_space()` places a recording at a depth. It does not change what was
> recorded.** No lowpass and no tail turns an empty gallery into a room with a
> hundred shouting kids in it. Source selection is a real decision — pick the
> right room and the right event, then let the ladder place it.

The house acoustic is still real and still measured; `verify_texture.py` grades
it as a paired comparison and it passes. What it never claimed, and what this
section wrongly did, is that treatment substitutes for choosing the right source.

### The tail cannot be brighter than the sound inside it

`stereo_reverb()` lowpassed its impulse response at a fixed 3.2 kHz. `fathom_space()`
filters the *direct* signal to the tier's corner and then hands it to the reverb —
so at hadal, an 800 Hz object was ringing in a 3.2 kHz room. The reverb was
brighter than the thing making it, which is not something water does.

It now takes `ir_cut`, and the two callers that place sounds by rank pass their
own corner. The correction is small where it applies — 15–19 Hz of centroid at
abyssal and hadal, nothing above them — and it was worth finding twice, because
the identical fault was sitting in `build-signatures.py`, where every Fathom
stinger was ringing in a room brighter than itself.

**This was not the cause of the inverted scene.** It was diagnosed as the cause,
the fix was made, and the measurement then showed it accounted for about 19 Hz
of a 212 Hz error. The real causes were the gallery source above and the scene
faults in §5a. Recorded here because a fix that lands where you did not predict
is the reason to measure after fixing rather than before.

### The Fathom ladder as an acoustic space

`mastering.fathom_space(x, tier)`. Six tiers. The five underwater rows are
numerically identical to the stinger table in `build-signatures.py`, so a
stinger sits in exactly the room its own rank describes —
`verify_acoustics.py` fails the build if the two tables ever drift apart.

| tier | lowpass | reverb | width | sub lift | measured centroid | measured tail |
|---|---|---|---|---|---|---|
| air | 20 kHz | 0.45 s | 0.25 | — | 9297 Hz | 46 ms |
| sunlit | 12 kHz | 1.20 s | 0.35 | — | 4357 Hz | 271 ms |
| twilight | 7 kHz | 2.00 s | 0.55 | +1.5 dB | 2286 Hz | 550 ms |
| midnight | 4 kHz | 3.20 s | 0.75 | +3.0 dB | 1534 Hz | 980 ms |
| abyssal | 2 kHz | 4.60 s | 0.90 | +4.5 dB | 816 Hz | 1523 ms |
| hadal | 800 Hz | 7.00 s | 1.00 | +6.0 dB | 308 Hz | 2517 ms |

Three cues move together — brightness falls, the tail lengthens, the image
widens — because all three do in real water. A listener who could not name one
of them still hears the descent. The ladder teaches itself.

`air` exists so a cut from poolside to underwater is a real acoustic transition
and not a filter sweep.

---

## 4. Two story rules made literal

### Calm is a mix control

Canon says panic is the villain and calm is the stat. That is also a description
of how the two states *sound*, so it can be automated instead of hand-mixed cue
by cue. `calm_shape(x, calm)`:

- **calm 0.0 — panic.** Bright, hard, narrow, pressed against the ear.
- **calm 1.0 — stillness.** Dark, soft, wide, open, far away.

A panicking swimmer's world is not quieter, it is *closer and sharper*: the high
end comes up and the image collapses toward the centre. That is what tunnel
vision sounds like. Calm opens both back out.

### Underwater voice, and why the film convention is backwards

The convention is a heavy lowpass plus reverb. That models water as a **barrier**
between a source and an air-filled ear canal — which is what you hear standing
beside a pool with your head dry. It is the wrong model for a head that is
actually under, and this show lives under.

Submerged, the ear canal floods and the impedance mismatch the middle ear exists
to solve largely disappears. Sound reaches the cochlea mostly by conduction
through the skull. Two consequences drive `submerged_voice()`:

- **Direction dies.** Sound moves roughly four times faster in water, so the
  interaural time difference between the ears shrinks by about the same factor
  and falls below what the auditory system can resolve. A submerged listener
  genuinely cannot tell where a sound came from. The treatment collapses to
  mono — not as a width choice, but because a stereo image would be a lie.
- **It is the bottom that goes, not the top.** Bone conduction is a poor path
  for low frequencies. The instinct to reach for a lowpass is backwards; what
  leaves is weight and proximity, and what remains sits inside the skull.

Measured on the shipped implementation, relative to the 700–2200 Hz band:
**low (20–300 Hz) −31.3 dB, high (4–9 kHz) −3.4 dB.** The verifier is built
specifically so that a plain lowpass cannot pass it.

Getting this right is cheap, and it reads as authority to anyone who has ever
swum.

---

## 5a. Building a whole scene, and why a scene needs its own gate

`build-scene.py` renders the Episode 1 sinking sequence — 72 seconds, no
dialogue, carried entirely by depth, tempo and silence. It is the first thing
that uses the whole department at once, and it is where four separate faults
surfaced that **no existing gate could have caught**.

That is the lesson worth keeping. `verify_mastering` checks the chain.
`verify_texture` checks each texture alone. `verify_acoustics` checks that the
ladder is monotonic. All three passed, on every render, while the scene ran
backwards. The faults were in how a scene **used** correct parts, which is a
property only the scene has.

### The four faults

**1. The deck was darker than the pool.** The art-gallery source, above. 592 Hz
against 2006 Hz.

**2. `pool-surface` ramped in and never ramped out.** The brightest texture in
the library — 2009 Hz — sat at full level for 56 of the scene's 72 seconds,
underneath the part where a boy is motionless on the floor of a pool. Water is
now three layers that hand off: surface → submerged → deep, each arriving while
the last is still going, so there is never a cut, but the surface is *gone* by
the time he is past twilight, because by then he cannot hear it.

**3. A cue named in the beat sheet was never in the mix.** The sheet says
"the muffled roar" at 16 s. `crowd-submerged` existed, was built, was verified —
and was never referenced. It now follows him under for six seconds and loses him.

**4. The heartbeat was fighting the arc, and the comment already knew.** The
code said *"louder when fast: a racing heart is heard, a slow one is felt."*
Only the gain was implemented. Measured, the heart's spectral centroid was a
dead-flat **73 Hz** end to end while its level tracked panic — loudest exactly
when the mix should be brightest, quietest exactly when it should be darkest.
A constant 73 Hz object holding 28% of the energy pins a power-weighted centroid
and the water's 965–1484 Hz variation cannot move it.

> "Heard" versus "felt" is a statement about **spectrum**. If the code only
> changes gain, the code does not say what the comment says.

The sweep start, the skin transient's level *and* its corner frequency now all
ride the panic value. Racing, the thump has bite up in the throat; settled, it
is pure sub through the ribs.

### The paired measurement that found it

Guessing was wrong twice here — first blaming the reverb tail (worth ~19 Hz of a
212 Hz error), then the double-treatment. What settled it was measuring the stems
separately against the same depth curve:

| stem | depth → brightness, rank correlation |
|---|---|
| world | **−0.82** — descends properly |
| heart | **+0.16**, centroid flat at 73 Hz |
| *finished mix* | *+0.07 — no arc at all* |

A stem that descends cleanly and a mix that does not is not an ambiguous result.

### `qc/verify_scene.py`

Reads the depth curve from the cue sheet and measures the **rendered WAV**
against it — intent versus output. The circular version, which would prove
nothing, measures the rank weights instead and confirms only that interpolation
works.

It found two bugs in itself before it found any in the scene, which is by now
the expected sequence:

- **Spearman with `argsort(argsort(x))` gives tied values arbitrary distinct
  ranks in input order.** The depth curve is full of ties — seven of seventeen
  windows sit at the abyssal floor — so it was ranking those seven by the order
  they happened to appear, which is to say by time, which is to say it was
  inventing a trend out of nothing. Ties must get **average** ranks.
- **The "pink noise" negative control was a cumulative sum of white noise**,
  which is Brownian, not pink. It random-walks, so it drifts, so it has a slow
  trend in it by construction. It scored −0.52 against a −0.55 threshold: a
  control one hundredth of a point away from certifying that noise descends.
  Shaped in the frequency domain instead, it reads −0.24.

Both bugs were invisible against the scene alone and obvious against the
controls. That is what controls are for.

---

## 5. Lip-sync

### Design the shot before you chart the line

**Route A — shots that do not need sync. Target ≥60% of dialogue off-mouth.**
This is craft, not evasion; it is what anime actually does. Over-the-shoulder,
back of head, reaction cutaway on the key line, wide shot, hair across the face,
turning away. This show gets it nearly free: **underwater nobody talks**, above
water they are behind caps and goggles, and the canon already makes internal
monologue unspoken.

> **Measured, Episode 1 as written is 7% sync-free.** 26 of its 28 spoken lines
> are on-mouth. That gap between 7% and 60% is not a script problem — it is a
> boarding decision that has not been made yet, and it is far cheaper to make it
> now than to solve it 26 times in generation.

**Route B — dedicated sync pass. Tested, and the answer is a qualified no.**
Generate the shot mouth-closed and neutral, then drive the mouth from the audio.

This has now been run end to end on one line — Kai's *"You took him. You took my
dad."* — and measured rather than eyeballed. Evidence is in
`docs/assets/undertow/lipsync-test/`, and the measurement reproduces with
`qc/measure_lipsync.py`.

First, the tool inventory, because the obvious candidate is the wrong one:
**`dubbing` is a translation tool**, not a sync tool. It needs speech already in
the picture and replaces the language. What actually accepts an arbitrary audio
track and animates to it is **`wan2_7`**, which takes a start image plus an
`audio_references` input.

| measurement | with audio reference | control: same prompt, no audio |
|---|---|---|
| articulation | 0.206 | 0.219 |
| sync offset vs the recording | **+0 frames** (r = +0.61) | −12 frames (r = −0.24) |
| lip closures achieved | **0 of 5** | 0 of 5 |
| minimum aperture across the clip | 0.40 | 0.36 |
| aperture during the line's 1.6 s pause | 0.40–0.50 | 0.52–0.77 |

Read those two columns together, because neither is meaningful alone.

**The audio reference genuinely works.** Against its own control the difference
is unambiguous: +0 frames and r = +0.61 with the audio, −12 frames and *negative*
correlation without it. It is not guessing; it is listening.

**And it never closes the lips.** Minimum aperture over the whole clip is 0.40 —
the mouth has no closed position at all, and it does not even come to rest during
the 1.6 second pause in the middle of the line. Frame-by-frame inspection across
both closure windows confirms the measurement: the lips never meet.

So what `wan2_7` produces is **envelope sync, not articulation**. It opens and
closes the jaw in time with how loud the audio is, which is genuinely the hard
half of the problem and is worth having. It does not form phonemes, and *closures
are the one thing an audience reliably catches.*

### The shot-scale rule below is WRONG. Read this first.

Both readings above were built on one take per framing, and a five-point ladder
run afterwards — close-up ×2, medium close-up, medium, wide, same line, same
recording, same model — showed that take-to-take variance is larger than
anything shot scale does.

| take | sync offset | r | closures landed |
|---|---|---|---|
| close-up, take 1 | +0 | 0.61 | **0 of 5** |
| close-up, take 2 | +2 | 0.87 | **3 of 5** |
| medium close-up | +1 | 0.79 | 0 of 5 |
| medium | +0 | 0.76 | 0 of 5 |
| wide / full | +4 | 0.31 | 5 of 5 |

Two close-ups with **identical** start plate, prompt and audio scored 0 of 5 and
3 of 5. That single row invalidates "close-ups fail, wides work": the first
close-up's failure was the take, not the scale, and I had generalised from n=1
twice in a row.

**What is actually consistent, across every take at every scale**, from
magnified frame-by-frame inspection rather than from the aperture numbers:

- **The mouth closes and comes to rest through the long silence.** Four of five
  takes hold a clean closed lip line across the line's 1.6 second mid-sentence
  pause. That is reliable.
- **The short consonant closure inside running speech does not land.** The *m*
  of "my dad" — chart frame 72 — is open in **all five takes**, checked ±6
  frames. Not late, absent.

So the limitation is not distance, it is duration. `wan2_7` performs
envelope-driven jaw motion with a genuine rest state: it hears silence and
closes, it hears loudness and opens. It does not form a two-frame bilabial stop
in the middle of a word, at any framing.

That also explains the wide take's flattering 5 of 5 — its +4 frame offset
shifts the sampled frames into the pause, where every take is closed anyway.

**The operative rule, replacing the scale rule:** Route B is usable wherever the
performance is carried by opens, closes and rests — which is most dialogue — and
it will not deliver a specific consonant closure on a specific frame at any
shot size. Where one particular closure has to read, that is a Route A shot.
Check every take; do not assume the last one's behaviour. And retrying **does**
help, contrary to what the close-up section below claims.

### How short can a pause be and still read as a rest? About 400 ms.

The rest behaviour was only ever demonstrated on one very long silence — 1.6
seconds — which is not what dialogue is made of. If rests needed that much room,
"carried by opens, closes and rests" would cover almost nothing real.

Tested by building one audio file containing **three gaps of different lengths**
and generating a single shot from it, so gap length is the only variable and
take-to-take variance cannot reach the comparison:

Run three times — two voices, and the second voice twice — because the first
run's shortest result did not survive the second:

| gap | duration | Callum | Onyx t1 | Onyx t2 | reliable? |
|---|---|---|---|---|---|
| 4 frames | 167 ms | 4 of 4 | **0 of 4** | **2 of 4** | **no** |
| 10 frames | 417 ms | 10 of 10 | 8 of 10 | 9 of 10 | yes — 90% |
| 24 frames | 1000 ms | 23 of 24 | 20 of 24 | 23 of 24 | yes — 92% |

**Global sync is repeatable; local rest placement is what jitters.** Both Onyx
takes came back at exactly +1 frame with r = +0.67 and +0.64 — the overall
alignment to the recording is stable run to run. What moves between takes is
where each individual rest lands inside its gap. That is worth separating,
because it means a sync offset measured once can be trusted, while a single
closure landing correctly once cannot.

**The mechanism, from magnified frames rather than from the table.** In the take
that "failed", the mouth *does* close near that gap — frames 14 to 17 are shut —
but the silence is frames 17 to 21, so the rest lands three to four frames early
and the lips are open again before the gap ends. The rest is not missing. It is
**mistimed**.

That explains both columns at once, and it is a more useful fact than either
result alone: **rest placement carries roughly ±4 frames of jitter.** A gap has
to be longer than that jitter to reliably contain a rest. At 10 and 24 frames
the jitter is absorbed; at 4 frames it is the same size as the gap.

So the working floor is **about 10 frames, 400 ms** — a beat, not a breath. That
still covers sentence breaks, comma pauses and every dramatic silence, which is
most of what dialogue is built from. It does not cover the very short junctures
inside a fast exchange, and those should be treated as continuous speech rather
than as gaps the mouth will honour.

*(An earlier version of this section claimed 167 ms on the strength of one take.
It did not replicate. The number above is the one that did.)*

What still fails is unchanged and it is the other end of the scale: a consonant
closure lasting one or two frames *inside* a word. Rests are a duration
phenomenon and the floor is low; phoneme closures are not reached at all.

The rest of this section is kept as written because the measurements in it are
sound and the reasoning built on them is instructive about how not to generalise.

### Then the same line again at wide shot, which reversed the conclusion

The first reading of the close-up result was that Route B would be fine at a
distance *because the failure would be too small to resolve*. That reasoning was
wrong, and the wide test says so twice over: the mouth at full shot is still
about 22px of lip line at 1080p delivery — plainly visible, not unresolvable —
and it does not fail there in the first place.

Same line, same recording, same model. Only the framing changed.

| | close-up | wide / full shot |
|---|---|---|
| sync offset vs the recording | **+0 frames** (r = +0.61) | +4 frames (r = +0.31) |
| **lip closures landed** | **0 of 5** | **4 of 5** |
| does the mouth ever reach a closed position | **never** | yes |
| aperture at 1080p | 83–113px | ~22px lip line |

**At wide the generator articulates properly and syncs loosely. At close-up it
syncs perfectly and never articulates.** Magnified frame-by-frame inspection
agrees with both measurements: at wide the lips genuinely meet during the line's
pause and on the *m* of "him"; at close-up they never meet anywhere.

The likely reason is that at small scale the model draws a simple stylised mouth
that has a real closed state, and at close-up it renders a detailed mouth with
teeth and keeps it alive, never fully shutting. That is a guess about the cause;
the measurements are not.

What this means in practice:

- **Route B is usable at mid and wide** — and for the opposite reason to the one
  first assumed. It is not that the fault hides at distance; it is that the fault
  is not there. Budget for the looser sync: +4 frames is over the standing
  allowance, and at that scale the sync estimate is itself noisier because the
  mouth contributes less of the measured signal.
- **Route B is not usable for a close-up on a line containing m, b or p**, which
  is most dramatic close-ups. That is a Route A shot, and this is the measurement
  that says so rather than a preference.
- **Retrying does not help at close-up.** It is a property of what the generator
  does, not a bad take.

One methodological note worth keeping, because it nearly produced the wrong
answer. The relative shut test — "closed means under a fraction of this clip's
own widest frame" — fails at distance. The mouth box unavoidably contains the
nostril shadow and the chin line, and those never go away, so the measured area
never drops far even when the lips do meet. It reported 0 of 5 on a shot where
magnified inspection plainly shows closures. Calibrating "shut" against a still
of the same framing with the mouth known closed fixes it, and the corrected
numbers then agree with direct inspection at both scales. Pass
`--closed-reference` with the neutral start plate.

`qc/measure_lipsync.py` reports these as separate verdicts for exactly this
reason — "out of sync" and "in time but never closes" fail for opposite causes
and have different fixes.

**Route C — the fallback that always works.** Re-time the *voice* to the mouth
you got: measure the picture's open/closed envelope, then shift or reword the VO
so its closures land where the picture already closes. Cheap, invisible, and
normal practice on real productions.

**A before B before C. No shot ships with a visible mouth that misses a
closure.**

### The mouth set — eight shapes and a rest

Preston Blair's Western chart uses ten. Japanese animation traditionally uses
far fewer, essentially five vowels plus a closed mouth, which is part of why
anime mouths read as stylised rather than rotoscoped. Eight plus rest sits
deliberately between them.

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

Two of the eight do almost all the perceptual work and neither is a vowel: `M`
and `F`. Nobody consciously reads vowel shapes. Everybody catches a missed
closure.

### The three rules, and none of them contains the word "or"

A rule with an "or" in it gets exploited. That is not a theory — "eyes down, or
down-and-slightly-forward" in the swim codex permitted a craned neck twice
before it was tightened. Each of these commits to one behaviour.

1. **Closures are absolute.** Every M, B and P closes the lips. Never merged,
   never softened, never dropped for being short.
2. **Anything under two frames is absorbed** into its neighbour. A mouth that
   hits every phoneme flaps. Rule 1 outranks this one.
3. **The mouth leads the sound by exactly one frame.** The eye forgives a mouth
   that is early and never forgives one that is late.

### Why the chart is the whole point

The standing limitation on this project is that poses can be checked and
movement cannot. Every swimming fault caught from a contact sheet was visible in
a single frame; the two that were missed — the dolphin kick initiating at the
legs, the shot drifting inside itself — were properties of a *sequence*.

Lip-sync is entirely a sequence property. A mouth chart converts it back into a
sequence of **poses at known frame indices**, which means it can be checked:
sample the frames at the chart's own timestamps and read them off.

That is not a workaround. It is the instrument that did not exist for the
dolphin kick.

---

## 6. Voice identity

Every character has a locked visual Reference Element. They need a locked
**voice** registered the same way, with the same **baseline-state warning**:
whatever is in the source recording becomes identity, *including room tone, mic
distance and accent*. Record references clean, close, dry, unprocessed.

Two tiers, and the split is what makes the whole plan reversible:

- **Tier A — anything a producer hears: a real human voice.** A producer hears
  TTS and discounts the entire package. This is not a quality judgement about
  synthesis; it is a fact about how pitch material is received.
- **Tier B — previz only, never leaves the repo.** Synthetic, marked in the
  filename, used purely to derive timing so picture can be built before casting.

Because the pipeline is timing-driven, **swapping B for A later requires no
re-animation** — you direct the real actor to the previz timing, which is just
ADR, and is how every dubbed production on earth works. Casting never blocks
building.

For the teaser specifically: one great voice on the protagonist beats eight
mediocre ones. The recommendation is exactly one human line, with the rest
carried by score and text cards.

### Cast the boys female, the way anime actually does

Kai's first previz voice was an adult male preset picked off a name. It measured
**109 Hz** — squarely adult male, 21 Hz below where a fifteen-year-old sits — and
it was wrong on the ear before it was wrong on the meter.

Pitching it up to 133 Hz put it in band and introduced the obvious risk: push a
voice far enough and it stops sounding like a voice and starts sounding like a
process. So the next step was to find one that is natively in band instead.

Measured at neutral pitch, no shifting:

| voice | median F0 | |
|---|---|---|
| Caspian | 79 Hz | far too low |
| Callum, as first shipped | 104 Hz | adult male, the original error |
| Cillian | 123 Hz | just under |
| Kevin | 127 Hz | just under |
| Callum pitched up +4 | 131 Hz | in band, but processed |
| Hugo | 136 Hz | in band |
| **Onyx** | **144 Hz** | **in band, unprocessed — selected** |
| Bram | 162 Hz | in band, top of range |

Onyx measured again on a longer, angrier read: **182 Hz**, still in band. Pitch
rises with vocal effort, so a voice has to be checked on material like the
material it will actually perform — a single calm line is not a casting test.

**Onyx is a female preset, and that is the point rather than an accident.**
Japanese production routinely casts adolescent boys with female seiyuu — Naruto,
Edward Elric, Gon, Luffy as a child — because a woman working in her lower
register lands the exact place a fifteen-year-old boy's voice lives: around
150-170 Hz, with a lightness an adult man has to fake. The measurement agrees
with the tradition: Onyx sits at 156 Hz **with no processing at all**, where the
male presets needed either a pitch shift or a compromise.

So the standing note for casting Kai, Ren, Bo and any of the younger cast: audition
women in their lower register alongside men. It is not a workaround, it is how
the medium has always done it, and here it is also the only option that needed no
pitch shift.

The original is kept in `lipsync-test/` as the before-case.

**A warning about the instrument, because it bit three times.** `verify_voice.py`
verifies itself against six synthetic tones on every run and matches them to
0.1% — and that was still not enough. Clean harmonic tones do not exercise what
breaks on real speech. The tracker had an octave error that only appeared on
voices: frames it could not resolve piled up against the top of its search range,
and on one take **48% of frames sat at the 400 Hz ceiling**, dragging that take's
median from the 180s to 264 Hz. The giveaway was a histogram with a second peak
at the boundary and nothing at all between 300 and 350 Hz, which is not a shape
any voice has.

Frames that land on the search boundary are now discarded as failures rather
than counted as measurements. Every figure in the table above is post-fix; the
figures quoted before it were up to 80 Hz high.

The general lesson, which applies past this file: **a self-test on synthetic
material proves the arithmetic, not the method.** Check the distribution, not
just the summary statistic — a median hides a bimodal failure completely.

### The pronunciation lexicon

`audio/cmudict.dict` is CMUdict vendored whole with its licence, so nothing here
ever touches the network — containers get reclaimed, the repo does not.
`audio/lexicon.json` is the override layer: 47 entries, short enough that
somebody will actually read it, which matters because it is where the names
live.

The names are the point of that layer. No general dictionary contains Isozaki,
Kurose, Gyakuryū or Riddim, and those are exactly the words a Japanese-Jamaican
cast says most often. Japanese names are transcribed with the short pure vowels
Japanese actually has rather than the diphthongs an English speaker defaults to
— Isozaki is *ee-so-ZAH-kee*, not *eye-so-ZACK-ee*. A wrong vowel in a
character's own name survives all the way into a recording session.

CMUdict does contain GOUDA, as a cheese. The show layer wins, so he stays a
coach.

---

## 7. Verification

Two gates, both in the pre-commit hook, both runnable with no assets and no
network because they generate their own material.

```
python3 docs/assets/undertow/qc/verify_acoustics.py
python3 docs/assets/undertow/qc/verify_lipsync.py
```

The standard they hold themselves to — and the standard for anything added here:

**A detector that has never been shown a real fault is not a detector.**
`verify_lipsync.py` plants a five-frame offset and requires the detector to find
it, with the correct sign, in both directions, before any of its other results
are allowed to mean anything. Current results:

| check | result |
|---|---|
| round trip | alignment recovered to 0.33 frames mean error |
| planted 5-frame defect | detected as exactly +5, sign correct both ways |
| closure accuracy | 2/2 required closures read shut from rendered pictures |
| can it say no? | 8 wide-open frames correctly *not* reported as shut |
| negative control | unrelated noise correlates at r = +0.18 against a 0.45 limit |

**Every test gets a negative control.** `verify_acoustics.py` runs each
monotonicity test a second time against untreated signal and requires it to FAIL
there. A test that passes on the treated and the untreated case alike is
measuring nothing — this project has already shipped two of those.

---

## 8. What this pipeline cannot do

Stated plainly, because a limitation you have written down is a limitation
somebody can work around.

- **It cannot hear.** Every audio claim in this document is a measurement, not a
  listen. Each is attached to a number and a script that reproduces it. Spot-
  listening is required at the two places measurement is weakest: *does it sound
  like the character*, and *does the mix feel good.* Those are taste.
- **The chart only covers the mouth.** Blinks, head bobs and breath-holds are
  sequence properties with no instrument yet. They need human eyes, or the same
  treatment — author the timing first.
- **The aligner is not a trained acoustic model.** It follows energy, which is
  good to a frame or two, which is the tolerance the eye has. It is not going to
  resolve two adjacent unvoiced stops, and it does not claim to.

---

## 9. Housekeeping that gets expensive if skipped

- **Keep D/M/E stems separate from day one.** Dialogue, Music and Effects on
  independent tracks. Every distributor requires it, and international dubbing
  is impossible without an M&E track. It costs nothing now and costs a re-mix
  later.
- **Keep a per-sample licence manifest** for anything drawn from Splice. Cheap
  today, painful during a rights review.
- **Silence is a resource.** The fifteen-metre rule and the breath limit are
  audio rules too. Full silence underwater will be the loudest tool in the kit —
  but only if the rest of the mix is disciplined enough to earn it.
- **The missing-fundamental treatment applies to voice as well as score.** Male
  voices lose their fundamental on a phone speaker; `bass_harmonics()`, built
  for the ANSWER line, fixes dialogue the same way.

---

*Referenced from: [UNDERTOW-SCORE.md](/UNDERTOW-SCORE.md) ·
[UNDERTOW-ART-PROTOCOL.md](/UNDERTOW-ART-PROTOCOL.md) ·
[UNDERTOW-SWIM-CODEX.md](/UNDERTOW-SWIM-CODEX.md)*
