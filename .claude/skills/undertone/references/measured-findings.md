# Undertone — measured findings

Everything here was measured on real generated material, not assumed. Numbers are
from `wan2_7` via Higgsfield with an audio reference, 24 fps, 720p sources,
unless stated. Where a conclusion was later corrected, the correction and the
reason are kept — the wrong turns are as useful as the results.

---

## Route B: audio-driven generation

### Does the audio reference actually do anything?

Yes, unambiguously. Same prompt and start frame, audio reference present vs
withheld:

| | with audio | control, no audio |
|---|---|---|
| sync offset vs the recording | **+0 frames** (r = +0.61) | −12 frames (r = **−0.24**) |
| articulation | 0.206 | 0.219 |

Negative correlation without the audio. The model is listening, not guessing.

**Note on tool choice:** the obvious candidate is often the wrong one. A
`dubbing` tool translates speech into another language and needs speech already
in the picture — it is not a lip-sync tool. What is needed is a model that takes
an arbitrary audio track as a reference input.

### What it delivers, and what it does not

**It delivers envelope-driven jaw motion with a genuine rest state.** Silence
closes the mouth; loudness opens it. That is the hard half of the problem.

**It does not form phoneme closures.** A one-or-two-frame bilabial stop inside a
word — the *m* of "my dad" — was absent in **all five takes** across four shot
scales, checked ±6 frames. Not late. Absent.

### Shot scale does NOT determine this

An early conclusion said close-ups fail and wides work. That was built on one
take per framing and is **wrong**. Running a five-point ladder:

| take | sync offset | r | closures landed |
|---|---|---|---|
| close-up, take 1 | +0 | 0.61 | **0 of 5** |
| close-up, take 2 | +2 | 0.87 | **3 of 5** |
| medium close-up | +1 | 0.79 | 0 of 5 |
| medium | +0 | 0.76 | 0 of 5 |
| wide / full | +4 | 0.31 | 5 of 5 |

Two close-ups with **identical** start plate, prompt and audio scored 0 of 5 and
3 of 5. Take-to-take variance is larger than anything shot scale does.

Corollary: **retrying does help.** An earlier note said it would not, on the
theory that the failure was a fixed property of the generator. It is not.

### The pause floor: about 400 ms

How brief can a silence be and still get a mouth rest? Tested by putting three
gaps of different lengths **inside one audio file**, so gap length is the only
variable and take variance cannot reach the comparison. Run on two voices:

| gap | duration | voice 1 | voice 2 | reliable? |
|---|---|---|---|---|
| 4 frames | 167 ms | 4 of 4 | **0 of 4** | **no** |
| 10 frames | 417 ms | 10 of 10 | 8 of 10 | yes |
| 24 frames | 1000 ms | 23 of 24 | 20 of 24 | yes |

**The mechanism, found from magnified frames rather than the table:** in the
failing take the mouth *does* close near that gap — frames 14–17 — but the
silence is frames 17–21. The rest lands three to four frames early and the lips
reopen inside the gap. It is not missing, it is **mistimed**.

So **rest placement carries roughly ±4 frames of jitter**, and a gap must be
longer than the jitter to reliably contain a rest. Working floor ≈ **10 frames /
400 ms** — a beat, not a breath. Covers sentence breaks, comma pauses and
dramatic silences; does not cover short junctures inside a fast exchange, which
should be treated as continuous speech.

*(An earlier version claimed 167 ms on one take. It did not replicate.)*

### The operative rule

Route B is usable wherever the performance is carried by **opens, closes and
rests** — which is most dialogue — and will not deliver a specific consonant
closure on a specific frame at any shot size. Where one particular closure has to
read, that is a Route A shot. Check every take.

---

## Voice pitch

Measured across presets at neutral pitch, no shifting:

| voice | median F0 | |
|---|---|---|
| Caspian | 79 Hz | far too low for a teenager |
| Callum | 104 Hz | adult male |
| Cillian | 123 Hz | just under |
| Kevin | 127 Hz | just under |
| Callum, pitched up +4 | 131 Hz | in band, but processed |
| Hugo | 136 Hz | in band |
| **Onyx** *(female preset)* | **144 Hz** | **in band, unprocessed** |
| Bram | 162 Hz | in band, top of range |

Onyx on a longer, angrier read: **182 Hz**, still in band. Pitch rises with
effort — check a voice on representative material.

The only candidate that landed in band with no processing at all was a **female**
preset, which is the standard Japanese casting practice for adolescent boys
arriving at the same answer the measurement does.

---

## Measurement traps, all of which were hit

Kept because each one produced a plausible, wrong number.

**Comparing a spectrum and calling it a room.** A first attempt at "does licensed
material sit in our acoustic" compared the spectral centroid of a broadband
ambience against a single-pitch bell and reported seven faults in material that
was fine. A room is a transfer function, not a spectrum; two recordings in one
hall have different spectra and are obviously the same hall. Measure **damping**,
which a room imposes regardless of source.

**Absolute thresholds where a paired measurement was needed.** Real field
recordings arrive with 11–14 dB of high-frequency rolloff already. An absolute
"is it damped" test failed every source. The test has to be *before against
after, same corner, same recording*.

**Relative thresholds where an absolute reference was needed.** "Shut means below
a fraction of this clip's own widest frame" fails at distance: the mouth box
unavoidably contains nostril shadow and chin line, which never go away, so the
measured area never drops far even when the lips meet. It reported 0 of 5 on a
shot that visibly closes. Calibrate "shut" against a still of the same framing
with the mouth **known** closed.

**Measuring the reference with a different ruler.** When calibrating against that
still, the still and the video were being thresholded independently — different
grades, different scales, meaningless comparison. It reported 46% of frames shut
on a clip whose mouth never closes. Pass the clip's own statistics into the
reference measurement.

**Dark-pixel area as a proxy for mouth aperture.** In cel-shaded art an open
mouth shows *teeth* — bright — so it is partly darker and partly lighter than
skin. Counting only dark pixels flattens exactly where resolution is needed.
Measure distance from the skin tone in either direction.

**Aperture height measured min-to-max.** A box loose enough not to clip an open
mouth also contains nostril and chin, so the span saturates at the box height
whatever the mouth does. Measure the **contiguous band** straddling the box
centre.

**Octave errors in pitch tracking.** Autocorrelation peaks at the period *and*
every half of it, and the half-period peak is often taller. Taking the maximum
doubles the reported pitch. Then: a parabolic peak refinement applied to a point
on the *rising edge* rather than the peak returned **negative frequencies**.
Then: frames that could not be resolved piled up against the top of the search
range — 48% of one take sat at the ceiling and dragged its median from the 180s
to 264 Hz, with a telltale second histogram peak at the boundary and a gap where
real voices live. Discard boundary frames as failures.

**A self-test on synthetic tones passed through all three of those.** Clean
harmonic material does not exercise what breaks on real signal. The synthetic
self-test is necessary and not sufficient.

**Automatic face-size measurement defeated three attempts** — a lip-line
threshold that called a wide mouth larger than a medium one, colour segmentation
that escaped across a skin-toned wall and returned 696 px for a visibly small
head, and an ink-outline walk that ran to the frame edge. That tool was deleted
rather than shipped. A measurement that can be wrong by an order of magnitude and
still look plausible is worse than none.

---

## The standing division of labour

Poses can be checked from frames. **Movement cannot.** Anything living in a
*sequence* rather than a frame — motion initiation, drift, timing, sync — is
invisible to still review. Either build an instrument that converts it into
poses at known frame indices (which is exactly what a mouth chart is), or say
plainly that it was not verified and needs human eyes.

Throughout this work, magnified frame-by-frame inspection with
nearest-neighbour scaling was the arbiter whenever a measurement and an
expectation disagreed. It was right every time.
