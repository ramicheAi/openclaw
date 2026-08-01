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

**Route B — dedicated sync pass.** Generate the shot mouth-closed and neutral,
then drive the mouth from the audio. Verify what the available tooling actually
does on one line before claiming it works for the show.

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
