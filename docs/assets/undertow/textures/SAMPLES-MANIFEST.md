# UNDERTOW — sample licence manifest

Every third-party recording used anywhere in this show's sound, with the licence
it came under and what was made from it.

This exists now rather than later because it is cheap now and expensive later. A
rights review that arrives after two seasons of sound design and asks where a
crowd came from is not a review anybody wins from memory.

## Rule

**The source files are not committed.** Splice's licence permits use of the
material in derivative works; it does not permit redistributing the samples
themselves, and a public repository is redistribution. What is committed is the
*derived* texture — the source put through this show's acoustic — which is a
work made with the sample rather than a copy of it.

Anyone rebuilding from scratch downloads the sources with their own Splice
account using the asset UUIDs below and runs:

```
python3 build-textures.py --src <dir holding the source wavs>
```

## Sources

| local name | pack | Splice asset UUID | used for |
|---|---|---|---|
| `underwater.wav` | Field & Foley — `FF_AW_field_rec_underwater_alt.wav` | `208079a2-e5b2-4982-9b23-f7ce7db3523e` | `pool-surface`, `pool-submerged`, `pool-deep` |
| `hall.wav` | Field & Foley — `FF_IG_ambience_basketball_competitive.wav` | `07a0eccb-f0db-4fbd-8dfe-ffb2a15fd769` | `crowd-poolside`, `crowd-submerged` |
| `splash-dive.wav` | Big Room Sound — `BRS_Water_Splash_Dive_5.wav` | `c6ad6fc3-a27a-4259-aa38-e12f91c7a127` | `spots/splash-impact`, `spots/splash-entry` |
| `uw-bubbles.wav` | Blastwave FX — `UnderwaterBubbles_SFXB.4873.wav` | `c3f6b8c8-7207-45d1-ab82-415850cd95fa` | `spots/air-burst`, `spots/water-thrash` |
| `classroom.wav` | Big Room Sound — `BRS_Crowd_Highschool_Class_Awwh_Big.wav` | `3912b192-5ca9-4993-8fcd-7679af9d3c0e` | `class-laugh`, `class-laugh-memory` |

## Derived textures

All 24-bit stereo, 48 kHz, delivered at −20 LUFS with true peak at or under
−1.0 dBTP. Four LU under the score because a bed is not a cue — see the header
of `build-textures.py`.

| texture | rank | from | what it is for |
|---|---|---|---|
| `pool-surface` | sunlit | `underwater.wav` | water at the surface; the bed under any poolside scene |
| `pool-submerged` | twilight | `underwater.wav` | the same water from under it |
| `pool-deep` | abyssal | `underwater.wav` | water with nothing bounding it; past the sealed door |
| `crowd-poolside` | air | `hall.wav` | a meet, heard from the deck |
| `crowd-submerged` | midnight | `hall.wav` | the same crowd with your head under |
| `class-laugh` | air | `classroom.wav` | the classroom laughing at the Anchor, Ep 1 — pointedly dry |
| `class-laugh-memory` | abyssal | `classroom.wav` | the same laugh as Kai hears it on the pool floor |

Three of those pairs are the same recording at two different ranks. That is the
argument for the house acoustic in one line: cutting between `pool-surface` and
`pool-submerged` is the show's basic gesture, and it costs one function call
rather than a second recording session.

## The one that disproved it

`crowd-poolside` used to be built from an **art-gallery room tone**, and this
section used to argue that was the point: nothing about a gallery belongs to a
swimming pool, so if it read as a natatorium after treatment, the treatment was
doing real work rather than flattering material that was already close.

**It did not read as a natatorium, and the claim was false.** Measured against
the project's own instrument, the shipped texture had a spectral centroid of
**592 Hz** — while `pool-surface`, the water it has to sit next to, is
**2006 Hz**. The deck was three times darker than the pool.

That is not a cosmetic error. Rendering the Episode 1 sinking sequence, it
inverted the entire scene: the mix got *brighter* as Kai sank, because it opened
on the dullest material in the library and moved toward the brightest. The
sequence's one job is to get darker.

The deck is now `FF_IG_ambience_basketball_competitive` — a competitive indoor
sports hall, hard surfaces, shouting, a whistle. A gymnasium and a natatorium
are acoustic cousins. It measures **1805 Hz** after treatment, a 1213 Hz
correction, and it now sits above every underwater texture as it must.

**The doctrine that replaces the boast**, and it is the more useful of the two:

> `fathom_space()` places a recording at a depth. It does not change what was
> recorded. Source selection is a real decision — pick the right room and the
> right event, then let the ladder place it.

The house acoustic is still real and still measured. `qc/verify_texture.py`
checks it as a paired comparison — the same corner frequency, on the same
recording, before against after — and that test passes. What it never claimed,
and what this section wrongly did, is that the treatment can substitute for
choosing the right source.
