"""
UNDERTOW — the sound signature kit.

The theme (build-score.py) is what the audience hums. This file is what the
audience *learns*: a small set of recurring sounds that carry fixed meaning,
so that by episode six the show can tell you what just happened without a line
of dialogue or a title card.

Every voice here is imported from build-score.py. That is the point — these
are not sound effects, they are the theme's own instruments saying shorter
things. A stinger that shares timbre with the main title reads as the same
world; one built from unrelated samples reads as a different show's library.

────────────────────────────────────────────────────────────────────────────
1. THE FATHOM LADDER  (five stingers, one per rank)

Bible §"Layer 3 — Fathom": Sunlit, Twilight, Midnight, Abyssal, Hadal. The
audience is meant to chart this ladder like a stat sheet, so it must be
audible, not just captioned.

Two things change together as you descend, and both are physically true of
water, which is why the ladder teaches itself:

    pitch          falls, spelling a D minor triad downward — D5 A4 F4 D3 D2.
                   The Fathom ladder IS the show's home chord, descending.
    high frequency dies, and reverb grows. Water eats treble and the deep is
                   enormous. Sunlit is bright and close; Hadal is dark and
                   endless. Nobody has to be told which is deeper.

Hadal breaks the pattern deliberately: it is the only stinger with no attack
transient at all. You do not hear yourself arrive there.

────────────────────────────────────────────────────────────────────────────
2. THE MOTIFS  (five, each a fixed meaning)

    CURRENT WAKES     the call's fall, inverted — it lifts instead. The water
                      agreeing with you. Warm, major-leaning, over a swell.

    DIVE REFLEX       the heartbeat voice slowing from 72 to 38 BPM across
                      six seconds. This is bradycardia rendered literally,
                      and it is the physiological core of the whole series.
                      Warm and safe when it settles; the same sound sped up
                      and clipped is panic.

    SECOND TIDE       canon states the rule outright: "an answer in the WRONG
                      key is the Second Tide." So Nakaru's motif is the theme,
                      exactly, with the answer transposed a tritone away — the
                      furthest wrong an answer can be. It is not evil-sounding.
                      It is the right shape, answered wrongly, which is what
                      makes him arguable rather than monstrous.

    OPEN DOOR         Kai's "Undertow: Open Door" — the deep pulling upward, a
                      vertical current in a flat pool. A rising sub glissando
                      under the call: the only motif in the kit that ascends
                      in the low register, because it is the only time the
                      deep reaches UP.

    RIDDIM BREAK      Kemar's "One Drop: Riddim Break" — he drops the water's
                      own beat for one bar. The pulse simply stops, one bar of
                      nothing, then returns displaced. The silence is the
                      technique; everything else is setup for it.

    python3 build-signatures.py
"""
import importlib.util
import os
import sys

import numpy as np

ART = os.path.dirname(os.path.abspath(__file__))

# Load build-score.py as a module. The hyphen in the filename means it cannot
# be imported normally, and renaming it would break the commit history that
# documents how the theme was arrived at.
_spec = importlib.util.spec_from_file_location("undertow_score",
                                               os.path.join(ART, "build-score.py"))
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)

SR = S.SR
OUT = os.path.join(ART, "signatures")


# ── THE FATHOM LADDER ───────────────────────────────────────────────────────
# (name, note, lowpass corner Hz, reverb seconds, sub weight, length)
FATHOM = [
    ("sunlit",   "D5", 12000, 1.2, 0.00, 2.6),
    ("twilight", "A4",  7000, 2.0, 0.15, 3.2),
    ("midnight", "F4",  4000, 3.2, 0.45, 4.2),
    ("abyssal",  "D3",  2000, 4.6, 0.85, 5.4),
    ("hadal",    "D2",   800, 7.0, 1.00, 7.0),
]


def fathom_stinger(note, cut, rev, subweight, dur):
    """One rank of the ladder. Brightness and space are the rank."""
    f = S.hz(note)
    x = S.glass(f, dur, amp=0.55 * (1.0 - 0.5 * subweight))
    if subweight:
        # The deeper ranks are felt more than heard — the sub takes over from
        # the glass entirely by Hadal.
        x = x + S.sub(f / 2.0, dur, amp=0.70 * subweight)
    x = S.lp(x, cut)
    return S.reverb(x, rev, mix=0.28 + 0.30 * subweight)


def hadal_stinger(dur=7.0):
    """Hadal has no attack. You do not hear yourself arrive.

    Built by taking the ordinary stinger and replacing its onset with a slow
    swell, so the sound is simply *already there* by the time you notice it.
    """
    x = fathom_stinger("D2", 800, 7.0, 1.0, dur)
    n = len(x)
    swell = np.clip(np.linspace(0, 1, n) * 3.2, 0, 1) ** 2.0
    return x * swell


# ── THE MOTIFS ──────────────────────────────────────────────────────────────

def current_wakes(dur=5.0):
    """The call's fall, inverted. The water agreeing with you."""
    n = int(dur * SR)
    lead = np.zeros(n)
    # CALL is A4 F4 D4 C4 D4 — a descent. Mirror the intervals around the
    # first note so the same shape rises: the identical gesture, welcomed.
    root = S.NAMES[S.CALL[0][:-1]] + 12 * (int(S.CALL[0][-1]) - 4)
    rising = []
    for note in S.CALL:
        semi = S.NAMES[note[:-1]] + 12 * (int(note[-1]) - 4)
        rising.append(S.A4 * 2 ** ((root + (root - semi)) / 12.0))
    at = 0.35
    for f, beats in zip(rising, S.CALL_BEATS):
        seg = S.glass(f, min(2.4, dur - at), amp=0.44)
        lead = S.place(lead, seg, at)
        at += beats * (60.0 / S.BPM) * 0.55      # quicker than the theme: gladness
    beds = S.pad([S.hz(x) for x in S.CHORDS["F"]], dur, 0.30)   # relative major
    return S.reverb(lead[:n], 2.8, 0.36) + S.reverb(beds[:n], 3.4, 0.28)


def dive_reflex(dur=9.0, start_bpm=72.0, end_bpm=38.0):
    """Bradycardia. The heart slowing is the sound of getting good at this.

    Written by hand rather than by calling heartbeat(), because heartbeat()
    holds a fixed tempo and the whole meaning here is the ritardando.
    """
    n = int(dur * SR)
    out = np.zeros(n)
    rng = np.random.default_rng(23)
    t, k = 0.0, 0
    while t < dur:
        # ease the tempo down over the first two-thirds, then hold it calm
        prog = min(1.0, (t / dur) / 0.66)
        bpm = start_bpm + (end_bpm - start_bpm) * (prog ** 0.7)
        for off, gain in ((0.0, 1.0), (0.30, 0.44)):
            s = int((t + off) * SR)
            if s >= n:
                continue
            ln = min(int(0.46 * SR), n - s)
            tt = np.linspace(0, ln / SR, ln, endpoint=False)
            fsw = 74 * np.exp(-tt * 7.5) + 40
            body = np.sin(2 * np.pi * fsw * tt) * np.exp(-tt * 8.0)
            skin = rng.normal(0, 1, ln) * np.exp(-tt * 55) * 0.16
            # each beat is fractionally softer than the last — settling, not fading
            out[s:s + ln] += (body + skin) * gain * (1.0 - 0.35 * prog)
        t += 60.0 / bpm
        k += 1
    out = S.lp(out, 1100)
    return S.reverb(out, 2.4, 0.22) * 0.85


def second_tide(dur=11.0):
    """The right shape, answered in the wrong key. Nakaru.

    Canon: "an answer in the WRONG key is the Second Tide." A tritone is the
    furthest an answer can land from where it was called, so that is where
    this one lands. Note what is NOT done here: nothing is detuned, nothing
    growls, no dissonant cluster. He is not written as a monster.
    """
    n = int(dur * SR)
    lead, low = np.zeros(n), np.zeros(n)
    lead = S.phrase(lead, S.CALL, S.CALL_BEATS, S.glass, 0.3, 0.50)
    # the answer, a tritone off — six semitones, the maximum possible wrongness
    wrong = []
    for note in S.ANSWER:
        semi = S.NAMES[note[:-1]] + 12 * (int(note[-1]) - 4)
        wrong.append(S.A4 * 2 ** ((semi + 6) / 12.0))
    at = 2.6
    for f, beats in zip(wrong, S.ANSWER_BEATS):
        if at >= dur:
            break
        low = S.place(low, S.sub(f, min(3.2, dur - at), amp=0.62), at)
        at += beats * (60.0 / S.BPM)
    beds = S.pad([S.hz(x) for x in ["D2", "A2", "D3"]], dur, 0.20)
    return (S.reverb(lead[:n], 3.6, 0.40) + low[:n] + S.reverb(beds[:n], 4.4, 0.26))


def open_door(dur=7.0):
    """Kai. The deep reaching UP — the only ascent in the low register."""
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    # a sub sliding up two octaves over the whole gesture, D1 -> D3
    f0, f1 = S.hz("D1"), S.hz("D3")
    inst = f0 * (f1 / f0) ** (t / dur) ** 1.6
    phase = 2 * np.pi * np.cumsum(inst) / SR
    rise = np.sin(phase) * np.concatenate([
        np.linspace(0, 1, int(0.5 * SR)),
        np.ones(n - int(0.5 * SR) - int(1.2 * SR)),
        np.linspace(1, 0, int(1.2 * SR))]) * 0.62
    lead = S.phrase(np.zeros(n), S.CALL, S.CALL_BEATS, S.glass, 1.4, 0.42)
    return S.reverb(rise, 3.0, 0.24) + S.reverb(lead[:n], 3.8, 0.44)


def riddim_break(dur=10.0, bpm=84.0):
    """Kemar. The pulse drops out for one bar. The silence IS the technique."""
    n = int(dur * SR)
    out = np.zeros(n)
    rng = np.random.default_rng(31)
    beat = 60.0 / bpm
    bar = beat * 4
    drop_start, drop_end = bar * 2, bar * 3      # bar three is the hole
    t, k = 0.0, 0
    while t < dur:
        if not (drop_start <= t < drop_end):
            # one-drop: the emphasis sits on beat 3, not beat 1
            gain = 1.0 if k % 4 == 2 else (0.30 if k % 2 else 0.46)
            s = int(t * SR)
            ln = min(int(0.40 * SR), n - s)
            if ln > 0:
                tt = np.linspace(0, ln / SR, ln, endpoint=False)
                fsw = 80 * np.exp(-tt * 7.0) + 44
                body = np.sin(2 * np.pi * fsw * tt) * np.exp(-tt * 8.5)
                skin = rng.normal(0, 1, ln) * np.exp(-tt * 55) * 0.16
                out[s:s + ln] += (body + skin) * gain
        t += beat
        k += 1
    out = S.lp(out, 1100)
    # after the hole, the bass re-enters displaced by half a beat — he alone
    # kept time, and everyone else is now behind him
    low = np.zeros(n)
    for i, note in enumerate(["F2", "A#2", "C3", "F2"]):
        low = S.place(low, S.bass(S.hz(note), 1.5, 0.40),
                      drop_end + beat * 0.5 + i * beat)
    return S.reverb(out, 2.0, 0.18) + low[:n]


def seal(x, fade_in=0.008, fade_out=0.30):
    """Every file must start and end at silence.

    A synthesised sound truncated mid-ring ends on a non-zero sample, which is
    a step to silence — an audible tick at the end of the file and at every
    loop point. It is invisible to a sample-to-sample difference test, because
    there is no next sample to differ from, so it has to be prevented here.
    """
    n_in, n_out = int(fade_in * SR), int(fade_out * SR)
    x = np.asarray(x, dtype=np.float64).copy()
    if len(x) > n_in + n_out:
        x[:n_in] *= np.linspace(0, 1, n_in)
        x[-n_out:] *= np.linspace(1, 0, n_out) ** 1.5
    return x


TARGET_LUFS = -16.0     # one reference level for the whole kit
CEILING_DBTP = -1.0     # never louder than this, whatever the target costs


def write_normalised(path, x):
    """Write at a common LOUDNESS, not a common peak.

    Peak-normalising a set like this produces a 9 LU spread, because a
    sustained sub stinger integrates far louder than a short bright one at the
    same peak. A sound designer dropping these on a timeline should get them
    matched, so that relative balance is a creative decision rather than an
    artifact of how each one happened to be synthesised.

    Two passes: write, measure with ebur128, apply the gain, rewrite. If the
    required gain would breach the true-peak ceiling, take the ceiling instead
    and say so — a stinger that quietly clips is worse than one 2 LU down.
    """
    import re
    import subprocess
    import wave as _w

    def _write(y):
        st = np.stack([y, y], axis=1)
        with _w.open(path, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((np.clip(st, -1, 1) * 32767).astype("<i2").tobytes())

    x = np.asarray(x, dtype=np.float64)
    x = x / (np.abs(x).max() + 1e-9) * 0.7      # provisional level for measuring
    _write(x)

    ff = S.ffmpeg_exe()
    out = subprocess.run([ff, "-hide_banner", "-i", path, "-map", "0:a",
                          "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    # take the SUMMARY block; ebur128 prints a per-frame "I:" line for every
    # frame and the first ones are the -70 LUFS floor before it converges
    tail = out[out.rfind("Integrated loudness:"):]
    m = re.search(r"I:\s*(-?[\d.]+)\s*LUFS", tail)
    if not m:
        _write(x)
        return None, None
    measured = float(m.group(1))

    gain = 10 ** ((TARGET_LUFS - measured) / 20)
    ceiling = 10 ** (CEILING_DBTP / 20) / (np.abs(x).max() + 1e-9)
    capped = gain > ceiling
    y = x * min(gain, ceiling)
    _write(y)
    return measured, capped


SIGNATURES = [
    ("current-wakes", current_wakes, "The water agreeing with you. The call's fall, inverted."),
    ("dive-reflex", dive_reflex, "Bradycardia: 72 BPM easing to 38. The series' physiology, audible."),
    ("second-tide", second_tide, "Nakaru. The right shape, answered a tritone wrong."),
    ("open-door", open_door, "Kai's Undertow: Open Door. The only ascent in the low register."),
    ("riddim-break", riddim_break, "Kemar. One bar of nothing, then everyone else is late."),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    print(f"\n  FATHOM LADDER          (normalised to {TARGET_LUFS:.0f} LUFS)\n")
    for name, note, cut, rev, sw, dur in FATHOM:
        x = hadal_stinger(dur) if name == "hadal" else fathom_stinger(note, cut, rev, sw, dur)
        x = seal(x, fade_out=min(0.6, dur * 0.12))
        was, capped = write_normalised(os.path.join(OUT, f"fathom-{name}.wav"), x)
        flag = "  CAPPED at ceiling" if capped else ""
        print(f"    {name:9s} {note:3s}  lp {cut:5d}Hz  rev {rev:.1f}s   "
              f"was {was:6.1f} LUFS{flag}")

    print("\n  MOTIFS\n")
    for name, fn, why in SIGNATURES:
        was, capped = write_normalised(os.path.join(OUT, f"motif-{name}.wav"), seal(fn()))
        flag = "  CAPPED" if capped else ""
        print(f"    {name:14s} was {was:6.1f} LUFS{flag}\n                   {why}")
    print()


if __name__ == "__main__":
    main()
