#!/usr/bin/env python3
"""
UNDERTOW — measure a voice, because I cannot hear one.

Casting is a taste decision and it stays the creator's. What is NOT a taste
decision is whether a voice is in the right pitch range for the character, and
that has been guessed at up to now: the first previz voice for Kai — fifteen
years old — was an adult male preset chosen off a name, and it did not match him.
Names are not data. Fundamental frequency is.

WHAT THIS DOES AND DOES NOT SETTLE

  settles      is this voice in the pitch range of the character as written
  does NOT     does it sound like him. Timbre, weight, accent, how the grief
               sits under the line — none of that is in F0, and none of it is
               checkable by any measurement here. Those go to a human every time.

REFERENCE RANGES for speaking fundamental frequency. These are broad population
figures for conversational speech, not a casting rule, and they overlap heavily:

  adult male          85 - 155 Hz
  adolescent male     med voice change is gradual; 15-year-olds spread widely
                      across roughly 130 - 200 Hz depending how far through it
                      they are
  adult female       165 - 255 Hz
  child, either      200 - 300 Hz

Kai is fifteen and the character is written as guarded and not yet grown into
himself, so the target here is the LOW-ADOLESCENT band — above an adult man,
below a child.

    python3 qc/verify_voice.py take-a.wav take-b.wav ...
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
sys.path.insert(0, ART)

import mastering as M  # noqa: E402

F0_MIN, F0_MAX = 60.0, 400.0
TARGET_LO, TARGET_HI = 130.0, 200.0     # adolescent male, per the note above


def f0_track(x, sr, frame=0.040, hop=0.010):
    """Per-frame fundamental by autocorrelation, unvoiced frames dropped.

    Autocorrelation rather than anything cleverer because the question is only
    "roughly how high is this voice", and the answer needs to be robust rather
    than precise. Frames whose peak is weak relative to zero lag are unvoiced —
    breath, fricatives, silence — and contribute nothing but noise to a median.
    """
    mono = x.mean(1) if x.ndim > 1 else x
    n, hopn = int(frame * sr), int(hop * sr)
    lo, hi = int(sr / F0_MAX), int(sr / F0_MIN)
    out = []
    for a in range(0, max(0, len(mono) - n), hopn):
        seg = mono[a:a + n].astype(np.float64)
        seg = seg - seg.mean()
        e = float((seg ** 2).sum())
        if e < 1e-9:
            continue
        ac = np.correlate(seg, seg, mode="full")[len(seg) - 1:]
        if len(ac) <= hi:
            continue
        band = ac[lo:hi]
        peak = float(band.max())
        if peak / ac[0] < 0.35:
            continue                        # unvoiced: breath, fricative, silence

        # TAKE THE LOWEST STRONG PEAK, NOT THE HIGHEST ONE.
        #
        # Autocorrelation peaks at the period AND at every half of it, and the
        # half-period peak is often the taller. Taking the maximum therefore
        # reports double the true pitch, which is the classic octave error and
        # exactly what the first run of this file produced: three of four takes
        # came back with their 90th percentile pinned against the 400 Hz search
        # ceiling, which is not a thing a human speaking voice does.
        #
        # Accepting the earliest lag that reaches most of the peak height picks
        # the fundamental instead of its harmonic.
        strong = np.where(band >= peak * 0.80)[0]
        start = int(strong[0]) if len(strong) else int(np.argmax(band))

        # Climb to the actual local maximum before interpolating. The
        # "first strong lag" above is a point on the RISING EDGE of the peak,
        # not the peak itself, and a parabola fitted there is fitting a slope:
        # the first version of this did exactly that and returned NEGATIVE
        # frequencies for two of six known-pitch test tones. A parabolic
        # refinement is only defined at a maximum.
        k = start
        while k + 1 < len(band) and band[k + 1] >= band[k]:
            k += 1
        k += lo

        # Now interpolate. The lag is an integer number of samples, so the
        # recovered pitch is quantised, and at speech frequencies that bias is
        # not small: validated against synthetic tones, the uninterpolated
        # version read consistently about 4% high across 100-300 Hz.
        if lo < k < hi - 1:
            y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
            denom = y0 - 2 * y1 + y2
            if abs(denom) > 1e-12:
                shift = 0.5 * (y0 - y2) / denom
                if abs(shift) <= 1.0:          # a refinement, never a relocation
                    k = k + shift
        if k > 0:
            out.append(sr / k)
    f0 = np.asarray(out)

    # DISCARD FRAMES THAT LANDED ON THE SEARCH BOUNDARY. They are failures, not
    # measurements.
    #
    # This tracker passed a synthetic-tone self-test at 0.1% and still got real
    # speech wrong, which is the lesson: clean harmonic tones do not exercise
    # the thing that breaks. On real voices — breath, formants, noise, creak —
    # frames whose true period the search cannot resolve pile up against
    # F0_MAX. Measured on one take, 48% of frames sat at the ceiling and dragged
    # its median from the 160s to 264 Hz; the histogram was bimodal with nothing
    # at all between 300 and 350 Hz, which is not how a voice is distributed and
    # is the signature of an octave error rather than a high talker.
    #
    # A frame that reports the edge of the range is reporting that it failed.
    if len(f0):
        f0 = f0[f0 < F0_MAX * 0.95]
    return f0


def describe(path):
    x = M.read_wav(path)
    f0 = f0_track(x, M.SR)
    if len(f0) < 10:
        return None
    return {
        "median": float(np.median(f0)),
        "p10": float(np.percentile(f0, 10)),
        "p90": float(np.percentile(f0, 90)),
        "voiced_frames": len(f0),
        "seconds": len(x) / M.SR,
    }


def self_test():
    """Measure tones whose pitch is known before measuring anything that is not.

    Both bugs this file has had would have shipped silently without this. The
    first read every voice about 4% high; the second returned negative
    frequencies. Neither is visible when the only inputs are voices whose true
    pitch nobody knows — they just produce plausible-looking numbers.
    """
    sr = M.SR
    t = np.arange(int(1.2 * sr)) / sr
    bad = []
    for f in (100, 115, 145, 175, 220, 300):
        x = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 12)) * 0.1
        got = f0_track(x, sr)
        med = float(np.median(got)) if len(got) else float("nan")
        if not (abs(med - f) < f * 0.02):
            bad.append((f, med))
    return bad


def main():
    takes = sys.argv[1:]
    if not takes:
        print(__doc__)
        return 2

    bad = self_test()
    if bad:
        print("\n\033[31m  PITCH TRACKER FAILED ITS OWN CALIBRATION\033[0m")
        for f, m in bad:
            print(f"    a {f} Hz tone measured as {m:.1f} Hz")
        print("  Refusing to report voice measurements from an instrument that "
              "cannot measure a tone.\n")
        return 1

    print("\n\033[1mUNDERTOW — voice pitch measurement\033[0m")
    print("  \033[32m✓\033[0m tracker verified against six known tones, "
          "100-300 Hz, all within 2%")
    print(f"  target band for Kai (15): {TARGET_LO:.0f}-{TARGET_HI:.0f} Hz median F0\n")
    print(f"  {'take':34s} {'median':>8s} {'p10-p90':>13s} {'verdict':>22s}")

    results = []
    for t in takes:
        r = describe(t)
        if r is None:
            print(f"  {os.path.basename(t):34s} {'—':>8s}   not enough voiced audio")
            continue
        m = r["median"]
        if m < TARGET_LO:
            v = f"\033[33m{TARGET_LO - m:.0f} Hz too low\033[0m"
        elif m > TARGET_HI:
            v = f"\033[33m{m - TARGET_HI:.0f} Hz too high\033[0m"
        else:
            v = "\033[32min band\033[0m"
        print(f"  {os.path.basename(t):34s} {m:7.1f}Hz {r['p10']:6.0f}-{r['p90']:<6.0f} {v:>22s}")
        results.append((t, m))

    # NEGATIVE CONTROL. If two genuinely different voices measure the same, the
    # measurement is not discriminating and none of the verdicts above mean
    # anything. Only checkable when more than one take is supplied.
    if len(results) > 1:
        spread = max(m for _, m in results) - min(m for _, m in results)
        print()
        if spread < 5.0:
            print(f"  \033[31m✗\033[0m all takes within {spread:.1f} Hz of each other — "
                  f"this measurement is not telling them apart, so treat the "
                  f"verdicts above as unproven")
        else:
            print(f"  \033[32m✓\033[0m takes span {spread:.0f} Hz, so the measurement "
                  f"does discriminate between them")

    print("\n  \033[1mThis does not settle casting.\033[0m Pitch is measurable; timbre, "
          "weight,\n  accent and performance are not, and they decide it. Listen "
          "before choosing.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
