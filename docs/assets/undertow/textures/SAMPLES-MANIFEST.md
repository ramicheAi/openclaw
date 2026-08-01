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
| `roomtone.wav` | Epic Stock Media — `ESM_PSCWEA_Cinematic_FX_ambience_interior_roomtone_art_gallery_voice_rumble_big_room_busy_crowd.wav` | `0c6a09cc-4350-4539-911e-41d70cd68202` | `crowd-poolside`, `crowd-submerged` |
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
| `crowd-poolside` | sunlit | `roomtone.wav` | a meet, heard from the deck |
| `crowd-submerged` | midnight | `roomtone.wav` | the same crowd with your head under |
| `class-laugh` | air | `classroom.wav` | the classroom laughing at the Anchor, Ep 1 — pointedly dry |
| `class-laugh-memory` | abyssal | `classroom.wav` | the same laugh as Kai hears it on the pool floor |

Three of those pairs are the same recording at two different ranks. That is the
argument for the house acoustic in one line: cutting between `pool-surface` and
`pool-submerged` is the show's basic gesture, and it costs one function call
rather than a second recording session.

## The one that proves it

`crowd-poolside` is built from an **art-gallery room tone**. That source was
chosen on purpose: nothing about it belongs to a swimming pool, so if it reads
as a natatorium after treatment, the treatment is doing real work rather than
flattering material that was already close.

`qc/verify_texture.py` measures this as a paired comparison — the same corner
frequency, on the same recording, before and against after. Measured: the source
carried 13.3 dB of rolloff at 12 kHz on its own, and the sunlit treatment added
11.1 dB more, for 24.4 dB total.
