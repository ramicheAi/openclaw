#!/usr/bin/env python3
"""
UNDERTOW — render a whole scene's audio from its cue sheet.

This is the `build` mode of the sound department, and the first thing that uses
all of it at once: the acoustic ladder, the texture tier, the score's own
instruments, the calm automation and the submerged-voice treatment, in one piece
of picture-length audio.

THE SCENE IS EPISODE 1'S SINKING SEQUENCE, which is the show's signature moment
and the reason the whole department was built this way. A boy who is afraid of
water falls into it, panics, sinks — and then the show plays its first card and
the water settles around him. Nothing in that turn is spoken. It is carried
entirely by depth, by tempo and by silence, which means it either works in sound
or it does not work at all.

WHAT IS NEW HERE: THE ROOM MOVES.

fathom_space() places a sound at a depth. That is right for a stinger, which
happens at one depth, and wrong for a descent, which is the act of changing
depth. `descend()` renders the material at several ranks and crossfades between
them on a time curve, so the acoustic itself is the performance — the treble
dying, the tail growing and the image widening as he goes down, continuously,
rather than as a cut between two rooms.

The laughter is the piece I am most pleased with, and it cost nothing: the
script says the laughter from above "bends into whale-song distortion and
fades". The texture tier already holds that recording at two ranks - `class-laugh`
at air and `class-laugh-memory` at abyssal - so the bend is a crossfade between
two treatments of one take, which is exactly what the line describes.

    python3 build-scene.py
"""
import os
import sys

import numpy as np
from scipy.signal import butter, sosfilt

import mastering as M

ART = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(ART, "textures")
SIG = os.path.join(ART, "signatures")
OUT = os.path.join(ART, "scenes")
SR = M.SR

DURATION = 72.0
SCENE = "ep1-the-sinking"

# ── the scene, as a curve rather than a list of cues ────────────────────────
#
# (time, fathom rank, calm, heart BPM). Everything between two rows is
# interpolated, because the whole point of this sequence is that it is a
# transition and not a series of states.
#
# The heart is the spine. Canon puts real numbers on screen — 90, 110, 130 on
# the block; 150 then 140 in the panic; 90, 60, 40 as it settles; and 34 held —
# so those are not invented here, they are transcribed.
BEATS = [
    #  t     rank        calm   bpm   what is happening
    ( 0.0, "air",        0.20,   90),  # on the block, the room already receding
    ( 6.0, "air",        0.10,  110),
    (10.0, "air",        0.00,  130),  # the Eye, one flash-frame
    (11.5, "air",        0.00,  132),  # BZZZT
    (13.0, "sunlit",     0.00,  145),  # the fall — a slap of limbs
    (16.0, "twilight",   0.00,  150),  # under. panic, thrash, the muffled roar
    (24.0, "twilight",   0.05,  140),
    (30.0, "midnight",   0.35,  120),  # the water settles around him
    (38.0, "midnight",   0.65,   90),
    (44.0, "abyssal",    0.85,   60),
    (50.0, "abyssal",    1.00,   40),
    (56.0, "abyssal",    1.00,   34),  # 34 BPM. held.
    (66.0, "abyssal",    1.00,   34),
    (69.0, "air",        0.30,   34),  # SMASH back to the deck
    (72.0, "air",        0.30,   80),
]

RANKS = ["air", "sunlit", "twilight", "midnight", "abyssal"]


def curve(field, n):
    """Interpolate one column of BEATS across n samples."""
    idx = {"calm": 2, "bpm": 3}[field]
    t = np.array([b[0] for b in BEATS])
    v = np.array([float(b[idx]) for b in BEATS])
    return np.interp(np.linspace(0, DURATION, n), t, v)


def rank_weights(n):
    """A weight per rank per sample, summing to one.

    Built by treating the rank column as a position on the ladder and
    interpolating THAT, so a move from twilight to abyssal passes through
    midnight instead of jumping. The ladder is ordered, which is the property
    that makes this legal — you cannot interpolate between unordered categories,
    but depth is not a category, it is a number wearing a name.
    """
    pos = {r: i for i, r in enumerate(RANKS)}
    t = np.array([b[0] for b in BEATS])
    p = np.array([float(pos[b[1]]) for b in BEATS])
    track = np.interp(np.linspace(0, DURATION, n), t, p)
    w = np.zeros((len(RANKS), n))
    for i in range(len(RANKS)):
        w[i] = np.clip(1.0 - np.abs(track - i), 0.0, 1.0)
    s = w.sum(axis=0, keepdims=True)
    return w / np.maximum(s, 1e-9)


def descend(mono, weights, seed=17):
    """Render at every rank and crossfade — the room as a performance.

    Expensive by construction: it convolves the whole scene once per rank. That
    is the honest way to do it. Filtering with time-varying coefficients would
    be cheaper and would smear the reverb tails against each other, which is
    precisely the thing this sequence is made of.
    """
    st = np.stack([mono, mono], axis=1)
    out = np.zeros_like(st)
    for i, rank in enumerate(RANKS):
        if weights[i].max() < 1e-3:
            continue
        wet = M.fathom_space(st, rank, seed=seed + i * 31)
        out += wet * weights[i][:, None]
    return out


def heart(n, bpm_curve, seed=23):
    """A heartbeat that follows an arbitrary tempo curve.

    build-signatures.dive_reflex() ramps between two fixed tempos. This scene
    needs 90 up to 150 and back down to 34 with the numbers landing where canon
    says they land, so the tempo has to be a function rather than an endpoint.
    """
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    t = 0.0
    while t < DURATION:
        i = min(n - 1, int(t * SR))
        bpm = bpm_curve[i]
        # a beat is two thumps: the lub, then the softer dub a third of a beat later
        for off, gain in ((0.0, 1.0), (0.30 * 60.0 / max(bpm, 1.0), 0.44)):
            s = int((t + off) * SR)
            if s >= n:
                continue
            ln = min(int(0.46 * SR), n - s)
            tt = np.linspace(0, ln / SR, ln, endpoint=False)

            # HOW FAR INTO PANIC THIS BEAT IS. Everything below is a function
            # of it, because "a racing heart is HEARD and a slow one is FELT"
            # is a statement about spectrum, and for two renders this file
            # asserted it in a comment while implementing only a gain change.
            #
            # Measured, the cost of that was the whole scene: the heart's
            # spectral centroid sat at a dead-flat 73 Hz from end to end while
            # its LEVEL tracked panic — loudest exactly when the mix is
            # supposed to be at its brightest, quietest exactly when it is
            # supposed to be at its darkest. Anti-correlated with the arc. The
            # world stem descended cleanly at -0.82; the finished mix came out
            # at +0.07, because a constant 73 Hz object holding 28% of the
            # energy pins a power-weighted centroid and the water's 965-1484 Hz
            # variation cannot move it.
            panic = float(np.clip((bpm - 34) / 116.0, 0, 1))

            # Racing: the thump has bite, up in the throat and the ears.
            # Settled: it is pure sub, felt through the ribs and barely heard.
            fsw = (74 + 30 * panic) * np.exp(-tt * 7.5) + (40 + 8 * panic)
            body = np.sin(2 * np.pi * fsw * tt) * np.exp(-tt * 8.0)

            # The skin transient is BAND-LIMITED, and it has to be.
            #
            # This was full-band white noise. Measured, that put the
            # heartbeat's magnitude-weighted spectral centroid at 6583 Hz —
            # without the term it is 144 Hz. A heartbeat heard from inside a
            # chest is a thump through wet tissue and there is nothing up
            # there; the term was contributing broadband hiss to a stem that is
            # supposed to be the lowest object in the mix.
            #
            # Its corner and its level now ride panic too — it is the part you
            # HEAR, so it should be almost gone by the time he is calm at 34.
            skin = rng.normal(0, 1, ln) * np.exp(-tt * 55)
            skin = sosfilt(butter(2, 300.0 + 2400.0 * panic, "lp",
                                  fs=SR, output="sos"), skin)
            skin *= 0.04 + 0.26 * panic

            drive = 0.55 + 0.45 * panic
            out[s:s + ln] += (body + skin) * gain * drive
        t += 60.0 / max(bpm, 1.0)
    return out


def tex(name, n, gain_db=0.0):
    """A texture, looped or trimmed to length. Returns mono."""
    p = os.path.join(TEX, f"{name}.wav")
    if not os.path.exists(p):
        return np.zeros(n)
    x = M.read_wav(p).mean(1)
    if len(x) < n:
        x = np.tile(x, int(np.ceil(n / len(x))))
    return x[:n] * (10 ** (gain_db / 20))


def ramp(n, t0, t1, a=0.0, b=1.0):
    """A linear ramp between two times, clamped either side."""
    t = np.linspace(0, DURATION, n)
    return np.interp(t, [t0, t1], [a, b], left=a, right=b)


def window(n, t0, t1, fade=0.4):
    """A gate that opens at t0 and closes at t1, with soft edges."""
    t = np.linspace(0, DURATION, n)
    return (np.clip((t - t0) / fade, 0, 1) * np.clip((t1 - t) / fade, 0, 1))


def main():
    os.makedirs(OUT, exist_ok=True)
    n = int(DURATION * SR)
    calm = curve("calm", n)
    bpm = curve("bpm", n)
    w = rank_weights(n)

    print(f"\n  BUILDING {SCENE}  —  {DURATION:.0f}s\n")

    # ── the world, which descends with him ──────────────────────────────────
    #
    # THE WATER IS THREE LAYERS THAT HAND OFF, not two that accumulate.
    #
    # The first version ramped `pool-surface` IN at 11-16s and never ramped it
    # out. So the brightest texture in the show — 2009 Hz, the surface — sat at
    # full level for 56 of the scene's 72 seconds, underneath everything,
    # including the part where a boy is motionless on the floor of a pool. The
    # measurement showed it plainly: the bed's spectral centroid RAN UP from
    # 525 Hz to 1089 Hz across the descent, which is the exact opposite of what
    # this sequence is.
    #
    # Surface hands to submerged hands to deep. Each one arrives while the last
    # is still going and leaves once the next has taken over, so there is never
    # a cut — but the surface is GONE by the time he is past twilight, because
    # by then he cannot hear it.
    above = tex("crowd-poolside", n, -4.0) * (1.0 - ramp(n, 12.0, 18.0))

    # The crowd follows him under for six seconds and then loses him. This is
    # the beat sheet's "muffled roar" at 16s, which the first pass named and
    # then never actually put in the mix.
    roar = tex("crowd-submerged", n, -6.0) * window(n, 14.0, 30.0, 3.0)

    water_hi = tex("pool-surface", n, -3.0) * (ramp(n, 11.0, 16.0)
                                               * (1.0 - ramp(n, 22.0, 34.0)))
    water_md = tex("pool-submerged", n, -2.0) * (ramp(n, 15.0, 24.0)
                                                 * (1.0 - ramp(n, 38.0, 50.0)))
    water_lo = tex("pool-deep", n, -2.0) * ramp(n, 30.0, 46.0)
    world = above + roar + water_hi + water_md + water_lo

    # THE LAUGHTER, which is the scene's cruellest sound and its best trick.
    # Same recording, air rank into abyssal rank, crossfaded: the line says it
    # "bends into whale-song distortion and fades", and this is that sentence.
    laugh = (tex("class-laugh", n, -6.0) * window(n, 13.0, 20.0, 0.8)
             + tex("class-laugh-memory", n, -3.0) * window(n, 17.0, 34.0, 3.0))

    # ── the body ────────────────────────────────────────────────────────────
    hb = heart(n, bpm) * 0.55

    # ── the thing in the water ──────────────────────────────────────────────
    # "a low, vast, gentle tone. Like a whale. Like a name." Two close sines
    # beating slowly against each other, so it breathes without being played.
    t = np.arange(n) / SR
    tone = (np.sin(2 * np.pi * 36.7 * t) + 0.7 * np.sin(2 * np.pi * 36.9 * t)
            + 0.4 * np.sin(2 * np.pi * 73.4 * t))
    tone *= 0.16 * window(n, 48.0, 70.0, 6.0)

    # ── assemble, then put the whole thing in the water ─────────────────────
    print("  placing the world at its depth (five ranks, crossfaded)…")
    bed = descend(world + laugh * 0.9, w)

    # The heart is NOT in the room. It is inside his chest, and it stays there
    # whatever depth he is at — that contrast is what makes the room feel
    # external and the body feel like his.
    heart_st = M.stereo_reverb(M.pan(hb, 0.0), 2.2, 0.18, width=0.30, seed=29)

    # The tone belongs to the deep and only exists down there.
    tone_st = M.fathom_space(np.stack([tone, tone], 1), "abyssal", seed=71)

    # ── MIX BUS: set by measurement, not by ear I do not have ───────────────
    #
    # The first render of this scene had the heartbeat at unity and it ate the
    # sequence. Measured in six-second windows, the spectral centroid sat around
    # 300 Hz from start to finish and the correlation never left +0.99 — meaning
    # neither the descent's darkening nor its widening reached the output at all.
    # The heart is centred, low-passed to about 1.1 kHz and does not pass through
    # descend(), so at unity it simply masks the room the whole scene is about.
    #
    # This is the same failure the score had, where the ANSWER buried the CALL by
    # 11 dB of RMS. The fix is the same: state what share of the energy each
    # element should hold, measure what it actually holds, and correct.
    #
    # The heart is the spine of the sequence and still must not be its loudest
    # object. The room is what changes; the heart is what the change happens to.
    TARGET = {"world": 0.60, "heart": 0.28, "tone": 0.12}

    def rms(a):
        return float(np.sqrt((np.asarray(a) ** 2).mean()))

    stems = {"world": bed, "heart": heart_st, "tone": tone_st}
    raw = {k: rms(v) for k, v in stems.items()}
    total = sum(raw.values()) or 1.0
    print("\n  mix bus — share of energy, before and after:")
    gains = {}
    for k in stems:
        want = TARGET[k]
        have = raw[k] / total
        gains[k] = (want / max(have, 1e-9)) ** 0.5   # sqrt: approach, don't snap
        print(f"    {k:6s} {have * 100:5.1f}%  ->  target {want * 100:4.1f}%   "
              f"gain {20 * np.log10(gains[k]):+5.1f} dB")

    mix = sum(stems[k] * gains[k] for k in stems)

    # Panic is bright, hard and narrow; calm is dark, wide and open. Applied
    # last so it shapes the finished world rather than one layer of it.
    print("  applying the calm automation…")
    out = np.zeros_like(mix)
    for lo, hi in ((0.0, 0.34), (0.34, 0.67), (0.67, 1.01)):
        seg = M.calm_shape(mix, (lo + hi) / 2)
        g = ((calm >= lo) & (calm < hi)).astype(np.float64)
        # soften the handover so the automation is not itself an edit
        k = np.hanning(int(0.8 * SR))
        k /= k.sum()
        g = np.convolve(g, k, mode="same")
        out += seg * g[:, None]

    print("  mastering…")
    scratch = os.path.join(OUT, "_probe.wav")
    st, lufs, capped = M.master(out, scratch, target=-18.0)
    if os.path.exists(scratch):
        os.remove(scratch)
    dest = os.path.join(OUT, f"{SCENE}.wav")
    M.write_master(dest, st, bits=24)

    print(f"\n  {os.path.basename(dest)}   {DURATION:.0f}s   {lufs:.1f} LUFS   "
          f"{M.true_peak(st):.1f} dBTP   corr {M.correlation(st[:, 0], st[:, 1]):+.2f}"
          f"{'   (level capped)' if capped else ''}")
    print("\n  the scene, as the ear meets it:")
    for t0, rank, c, b in BEATS:
        bar = "▁▂▃▄▅▆▇█"[min(7, int(b / 20))]
        print(f"    {t0:5.1f}s  {rank:9s}  calm {c:.2f}  {b:3.0f} bpm {bar}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
