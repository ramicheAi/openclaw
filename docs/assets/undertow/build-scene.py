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
import json
import os
import sys

import numpy as np
from scipy.signal import butter, sosfilt

import mastering as M

ART = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(ART, "textures")
SIG = os.path.join(ART, "signatures")
OUT = os.path.join(ART, "scenes")
CUES = os.path.join(ART, "audio")
SR = M.SR

DEFAULT_SCENE = "ep1-the-sinking"


# ── the scene lives in a document, not in this file ─────────────────────────
#
# The sound bible has always said the cue sheet is the single source of truth
# and that the mix is generated from it. That was ASPIRATIONAL: the first two
# versions of this file carried the beats, the layer envelopes and the mix
# targets as Python literals, and the cue sheet next door held only dialogue.
# Two documents describing one scene, with nothing keeping them honest, is the
# drift the claim was meant to prevent.
#
# So this module now holds rendering machinery and no scene data at all. Every
# number that is a creative decision — where he is, how calm he is, how fast
# his heart is going, when a layer arrives and when it leaves — lives in
# audio/scene-<id>.json, which a person can edit without reading any code, and
# which qc/verify_scene.py grades the finished audio against.
def load_scene(scene_id=DEFAULT_SCENE):
    """Read a scene's cue sheet. There is no fallback and that is deliberate."""
    path = os.path.join(CUES, f"scene-{scene_id}.json")
    if not os.path.exists(path):
        raise SystemExit(
            f"\n  no cue sheet at {path}\n"
            f"  A scene is its cue sheet. Write one before rendering.\n")
    with open(path) as f:
        return json.load(f)


def curve(sc, field, n):
    """Interpolate one column of the cue sheet's beats across n samples."""
    t = np.array([b["t"] for b in sc["beats"]], float)
    v = np.array([float(b[field]) for b in sc["beats"]], float)
    return np.interp(np.linspace(0, sc["duration"], n), t, v)


def depth_track(sc, n):
    """Position on the ladder over time, straight from the cue sheet.

    Shared with qc/verify_scene.py so the gate and the builder cannot disagree
    about where the character is — they read one function reading one document.
    """
    pos = {r: i for i, r in enumerate(sc["ranks"])}
    t = np.array([b["t"] for b in sc["beats"]], float)
    p = np.array([float(pos[b["fathom"]]) for b in sc["beats"]])
    return np.interp(np.linspace(0, sc["duration"], n), t, p)


def rank_weights(sc, n):
    """A weight per rank per sample, summing to one.

    Built by treating the rank column as a position on the ladder and
    interpolating THAT, so a move from twilight to abyssal passes through
    midnight instead of jumping. The ladder is ordered, which is the property
    that makes this legal — you cannot interpolate between unordered categories,
    but depth is not a category, it is a number wearing a name.
    """
    track = depth_track(sc, n)
    ranks = sc["ranks"]
    w = np.zeros((len(ranks), n))
    for i in range(len(ranks)):
        w[i] = np.clip(1.0 - np.abs(track - i), 0.0, 1.0)
    s = w.sum(axis=0, keepdims=True)
    return w / np.maximum(s, 1e-9)


def envelope(sc, n, fade_in, fade_out):
    """A layer's level over time, from its in and out windows.

    One shape for every layer, because the failure this replaces was a set of
    ad-hoc per-layer expressions in which one layer quietly had no fade-out at
    all. A missing fade_out is still allowed — a scene can legitimately end
    inside a texture — but now it has to be written as `null`, which is a
    decision somebody made rather than a line somebody forgot.
    """
    t = np.linspace(0, sc["duration"], n)

    def ramp(a, b, rising):
        # A zero-width window is a hard step, not a division by zero. The deck
        # crowd legitimately starts at full level, which is fade_in [0, 0].
        if b <= a:
            g = (t >= a).astype(np.float64)
        else:
            g = np.clip((t - a) / (b - a), 0.0, 1.0)
        return g if rising else 1.0 - g

    g = ramp(fade_in[0], fade_in[1], True)
    if fade_out:
        g = g * ramp(fade_out[0], fade_out[1], False)
    return g


def descend(sc, mono, weights, seed=17):
    """Render at every rank and crossfade — the room as a performance.

    Expensive by construction: it convolves the whole scene once per rank. That
    is the honest way to do it. Filtering with time-varying coefficients would
    be cheaper and would smear the reverb tails against each other, which is
    precisely the thing this sequence is made of.
    """
    st = np.stack([mono, mono], axis=1)
    out = np.zeros_like(st)
    for i, rank in enumerate(sc["ranks"]):
        if weights[i].max() < 1e-3:
            continue
        wet = M.fathom_space(st, rank, seed=seed + i * 31)
        out += wet * weights[i][:, None]
    return out


def heart(sc, n, bpm_curve, seed=23):
    """A heartbeat that follows an arbitrary tempo curve.

    build-signatures.dive_reflex() ramps between two fixed tempos. This scene
    needs 90 up to 150 and back down to 34 with the numbers landing where canon
    says they land, so the tempo has to be a function rather than an endpoint.
    """
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    t = 0.0
    while t < sc["duration"]:
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


def main():
    scene_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SCENE
    sc = load_scene(scene_id)
    os.makedirs(OUT, exist_ok=True)
    dur = float(sc["duration"])
    n = int(dur * SR)
    calm = curve(sc, "calm", n)
    bpm = curve(sc, "bpm", n)
    w = rank_weights(sc, n)

    print(f"\n  BUILDING {sc['id']}  —  {dur:.0f}s")
    print(f"  from audio/scene-{sc['id']}.json\n")

    # ── the world, which descends with him ──────────────────────────────────
    #
    # LAYERS HAND OFF; THEY DO NOT ACCUMULATE, and every one of them declares
    # its own arrival and departure in the cue sheet.
    #
    # The version this replaces ramped `pool-surface` IN at 11-16s and never
    # ramped it out. So the brightest texture in the show — 2009 Hz, the
    # surface — sat at full level for 56 of the scene's 72 seconds, underneath
    # everything, including the part where a boy is motionless on the floor of a
    # pool. The measurement showed it plainly: the bed's spectral centroid RAN
    # UP from 525 Hz to 1089 Hz across the descent, the exact opposite of what
    # this sequence is. It was a missing term in one hand-written expression
    # among five, which is precisely the kind of thing a uniform envelope in a
    # document makes visible and an ad-hoc expression in code hides.
    world = np.zeros(n)
    print("  layers:")
    for L in sc["layers"]:
        g = envelope(sc, n, L["fade_in"], L.get("fade_out"))
        sig = tex(L["texture"], n, L.get("gain_db", 0.0)) * g * L.get("bus_gain", 1.0)
        world = world + sig
        out_s = "—" if not L.get("fade_out") else \
            f"{L['fade_out'][0]:.0f}-{L['fade_out'][1]:.0f}s"
        print(f"    {L['texture']:20s} in {L['fade_in'][0]:5.1f}-{L['fade_in'][1]:<5.1f}"
              f"  out {out_s:>10s}   {L.get('gain_db', 0.0):+5.1f} dB")

    # ── the body ────────────────────────────────────────────────────────────
    hb = heart(sc, n, bpm) * float(sc["heart"]["level"])

    # ── the thing in the water ──────────────────────────────────────────────
    # "a low, vast, gentle tone. Like a whale. Like a name." Close sines beating
    # slowly against each other, so it breathes without being played.
    T = sc["tone"]
    t = np.arange(n) / SR
    if "answer_phrase" in T:
        # The thing in the water is not an effect — it is the theme's ANSWER,
        # played so low and slow it reads as a voice rather than music. Each
        # note is a detuned pair (so it beats, like the old sines did) plus a
        # soft octave; attacks are seconds long, because nothing down there
        # arrives, it is simply already present.
        tone = np.zeros(n)
        beat = 60.0 / float(T.get("bpm", 30))
        det = float(T.get("detune_hz", 0.2))
        oct_g = float(T.get("octave_up", 0.35))
        pos = 0.0
        for f, beats in T["answer_phrase"]:
            # note_dur, NOT dur: the first version shadowed the scene duration
            # here, which silently disabled the duck (its 9.5-11.5s points fell
            # beyond an 8-second time axis and interp returned 1.0 everywhere).
            note_dur = beats * beat
            i0 = int(pos * SR); ln = min(int((note_dur + 2.5) * SR), n - i0)
            if ln <= 0:
                break
            tt = np.arange(ln) / SR
            env = np.minimum(1.0, tt / 1.2) * np.exp(-np.maximum(0.0, tt - note_dur) * 1.1)
            nt = (np.sin(2 * np.pi * f * tt) + np.sin(2 * np.pi * (f + det) * tt)
                  + oct_g * np.sin(2 * np.pi * 2 * f * tt)) * env
            tone[i0:i0 + ln] += nt
            pos += note_dur
        # the phrase is authored from t=0 and PLACED by the envelope window
        shift = int(T["fade_in"][0] * SR)
        tone = np.roll(tone, shift); tone[:shift] = 0.0
    else:
        tone = sum(gn * np.sin(2 * np.pi * f * t)
                   for f, gn in zip(T["freqs_hz"], T["gains"]))
    tone = tone * float(T["level"]) * envelope(sc, n, T["fade_in"], T.get("fade_out"))

    # ── assemble, then put the whole thing in the water ─────────────────────
    print(f"\n  placing the world at its depth "
          f"({len(sc['ranks'])} ranks, crossfaded)…")
    bed = descend(sc, world, w)

    # ── EVENTS: the moments the picture can collide with ────────────────────
    # Added AFTER descend, each carrying its own fathom placement, so a spot is
    # placed in its room exactly once. Gains are relative to the spots' -6dBFS
    # peak norm; signature stingers arrive already mastered.
    for ev in sc.get("events", []):
        path = os.path.join(ART, ev["sound"] + ".wav")
        x = M.read_wav(path)
        if ev.get("fathom"):
            x = M.fathom_space(x, ev["fathom"], seed=97)
        x = x * (10 ** (ev["gain_db"] / 20.0))
        i0 = int(ev["t"] * SR); ln = min(len(x), n - i0)
        if ln > 0:
            bed[i0:i0 + ln] += x[:ln]
        print(f"    event {ev['t']:6.2f}s  {ev['sound']:28s} {ev['gain_db']:+4.0f} dB"
              f"  {ev.get('fathom') or 'as-mastered'}")

    # ── DUCK: 'SOUND drops away' ────────────────────────────────────────────
    # World only. The heart is exempt because the silence exists to expose it.
    if "duck" in sc:
        dp = sc["duck"]["points"]
        tt = np.linspace(0, dur, n)
        g = np.interp(tt, [q[0] for q in dp], [q[1] for q in dp], left=1.0, right=1.0)
        bed = bed * g[:, None]

    # The heart is NOT in the room. It is inside his chest, and it stays there
    # whatever depth he is at — that contrast is what makes the room feel
    # external and the body feel like his.
    H = sc["heart"]
    heart_st = M.stereo_reverb(M.pan(hb, 0.0), H["reverb_seconds"], H["reverb_mix"],
                               width=H["reverb_width"], seed=29)

    # The tone belongs to the deep and only exists down there.
    tone_st = M.fathom_space(np.stack([tone, tone], 1), T["fathom"], seed=71)

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
    TARGET = sc["mix"]

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
    st, lufs, capped = M.master(out, scratch, target=float(sc["target_lufs"]))
    if os.path.exists(scratch):
        os.remove(scratch)
    dest = os.path.join(OUT, f"{sc['id']}.wav")
    M.write_master(dest, st, bits=24)

    print(f"\n  {os.path.basename(dest)}   {dur:.0f}s   {lufs:.1f} LUFS   "
          f"{M.true_peak(st):.1f} dBTP   corr {M.correlation(st[:, 0], st[:, 1]):+.2f}"
          f"{'   (level capped)' if capped else ''}")
    print("\n  the scene, as the ear meets it:")
    for b in sc["beats"]:
        bar = "▁▂▃▄▅▆▇█"[min(7, int(b["bpm"] / 20))]
        note = f"  {b['note']}" if b.get("note") else ""
        print(f"    {b['t']:5.1f}s  {b['fathom']:9s}  calm {b['calm']:.2f}  "
              f"{b['bpm']:3.0f} bpm {bar}{note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
