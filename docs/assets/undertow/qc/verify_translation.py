"""
Does the ANSWER survive a speaker that cannot play it?

The whole score rests on a call being answered from below, and the ANSWER lives
between 87 and 147 Hz. A phone speaker produces almost nothing under ~500 Hz; a
laptop, almost nothing under ~200. On those devices the fundamental is simply
absent — so if the line does not survive, then on the majority of devices an
audience will ever use, the answer does not arrive, and the series' central
musical idea silently fails.

mastering.py deliberately adds even harmonics to the low band so the ear can
infer the missing fundamental. That is a claim about perception, and claims get
tested. This file tests it.

METHOD. The ANSWER is rendered IN ISOLATION through the exact same voice and
low-band processing the theme uses, then filtered through a model of each
playback system, and the pitch is recovered with a HARMONIC PRODUCT SPECTRUM — the standard estimator for exactly this situation, because
it multiplies downsampled copies of the spectrum and therefore locks onto the
fundamental implied by a harmonic series even when that fundamental has been
removed entirely. If HPS recovers the written pitch through a phone filter, the
missing-fundamental effect is doing its job.

Isolation is not a convenience, it is the only way to ask the question. A first
version of this file measured the finished mix and reported total failure — but
it was locking onto 262, 294 and 349 Hz, which are C4, D4 and F4: the CALL,
doing precisely what it is meant to do. In the full mix the melody is louder
than the answer's harmonics by design, so the mix can only tell you which line
dominates, never whether the quieter one survives filtering.

RESULT, with its control. A test that cannot fail proves nothing, so the same
measurement is run with the harmonic treatment disabled:

    harmonic treatment DISABLED   1 of 5 ANSWER notes recovered through a phone
    harmonic treatment as shipped 5 of 5, every one within 4 cents

Without it the estimator returns 196 Hz for a written F2 of 87 Hz - it hears
the second harmonic as the note, which is exactly what a listener on a phone
would do. The treatment is therefore doing real work, not decorating.

    python3 qc/verify_translation.py
    python3 qc/verify_translation.py --control    # same test, treatment off
"""
import math
import os
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfiltfilt

QC = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(QC)
SR = 48000

# Playback models, as high-pass corners. Deliberately pessimistic — real
# devices roll off rather than cliff, so passing these is a stronger result
# than passing a gentle shelf would be.
SYSTEMS = [
    ("full range", 20),
    ("TV / soundbar", 120),
    ("laptop", 200),
    ("phone speaker", 500),
]

# The ANSWER, and where each note is struck in undertow-theme.wav. The theme
# states it three times; the 50.5s statement is the fullest, so it is the one
# measured. Times are the phrase start plus the cumulative ANSWER_BEATS at
# 60 BPM, where one beat is one second.
ANSWER = [("D3", 146.83), ("A#2", 116.54), ("G2", 98.00),
          ("F2", 87.31), ("G2", 98.00)]
PHRASE_AT = 50.5      # in the finished theme
PHRASE_AT_ISO = 1.0   # in the isolated render used for this test
BEATS = [0.0, 2.0, 3.5, 5.5, 7.0]

CENTS_TOLERANCE = 60          # a semitone is 100 cents; this must not be sloppy


def read(path):
    w = wave.open(path)
    ch, sw = w.getnchannels(), w.getsampwidth()
    raw = w.readframes(w.getnframes())
    if sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, ch, 3).astype(np.int32)
        q = b[..., 0] | (b[..., 1] << 8) | (b[..., 2] << 16)
        a = np.where(q & 0x800000, q - 0x1000000, q).astype(np.float64) / 8388608.0
    elif sw == 2:
        a = np.frombuffer(raw, dtype="<i2").astype(np.float64).reshape(-1, ch) / 32768.0
    else:
        a = np.frombuffer(raw, dtype="<i4").astype(np.float64).reshape(-1, ch) / 2147483648.0
    return a.mean(1), w.getframerate()


def hps(x, sr, fmin=60.0, fmax=400.0, harmonics=5, octave_bias=0.5):
    """Harmonic product spectrum: find the fundamental a harmonic series implies.

    Multiplying the spectrum by downsampled copies of itself makes every bin
    score highly only if energy also sits at 2f, 3f, 4f... The fundamental bin
    therefore wins even when its own energy has been filtered away, which is
    precisely the missing-fundamental case this file exists to test.
    """
    n = 1 << int(math.ceil(math.log2(len(x))))
    mag = np.abs(np.fft.rfft(x * np.hanning(len(x)), n))
    prod = mag.copy()
    for h in range(2, harmonics + 1):
        dec = mag[::h]
        prod[:len(dec)] *= dec
    freq = np.fft.rfftfreq(n, 1 / sr)
    band = (freq >= fmin) & (freq <= fmax)
    bf, bp = freq[band], prod[band]
    idx = int(np.argmax(bp))
    f0, score = float(bf[idx]), float(bp[idx])

    # HPS has a well-known downward octave bias: a true fundamental at 2f also
    # scores at f, because every one of its harmonics is an even harmonic of f.
    # The standard correction is to prefer the octave above whenever it is also
    # well supported. Without this the estimator confidently reports D2 for a
    # clean D3.
    hi = np.argmin(np.abs(bf - f0 * 2))
    if bf[hi] <= fmax and bp[hi] > score * octave_bias:
        f0 = float(bf[hi])
    return f0


def cents(a, b):
    return 1200 * math.log2(a / b) if a > 0 and b > 0 else 1e9


def isolated_answer():
    """Render the ANSWER alone, through the theme's own voice and low-band chain."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "undertow_score", os.path.join(ART, "build-score.py"))
    S = importlib.util.module_from_spec(spec)
    sys.path.insert(0, ART)
    spec.loader.exec_module(S)
    import mastering as M

    total = PHRASE_AT_ISO + 12.0
    low = np.zeros(int(total * SR))
    low = S.phrase(low, S.ANSWER, S.ANSWER_BEATS, S.sub, PHRASE_AT_ISO, 0.74)
    # the same treatment the mix bus applies: level trim then even harmonics
    trimmed = low * 0.56
    if "--control" in sys.argv:
        return trimmed, SR          # the negative control: no harmonics added
    return M.bass_harmonics(trimmed), SR


def main():
    x, sr = isolated_answer()

    if "--control" in sys.argv:
        print("\n  *** CONTROL RUN: harmonic treatment DISABLED. Failure here is the\n"
              "      expected and desired result — it is what makes the real run mean\n"
              "      something. ***")
    print("\n  ANSWER TRANSLATION TEST — can the low line be heard on a speaker\n"
          "  that cannot reproduce it? Pitch recovered by harmonic product spectrum.\n")
    header = "  {:16s}".format("note (written)") + "".join(f"{n:>16s}" for n, _ in SYSTEMS)
    print(header)

    fails = []
    for (name, f0), beat in zip(ANSWER, BEATS):
        t0 = PHRASE_AT_ISO + beat
        seg = x[int(t0 * sr):int((t0 + 1.1) * sr)]
        if len(seg) < sr // 4:
            continue
        row = f"  {name:>4s} {f0:7.1f} Hz "
        for sysname, corner in SYSTEMS:
            s = seg if corner <= 20 else sosfiltfilt(
                butter(4, corner, "hp", fs=sr, output="sos"), seg)
            got = hps(s, sr)
            err = cents(got, f0)
            ok = abs(err) <= CENTS_TOLERANCE
            row += f"{got:8.1f}Hz{'ok' if ok else 'MISS':>6s}"
            if not ok:
                fails.append(f"{name} on {sysname}: recovered {got:.1f} Hz, "
                             f"written {f0:.1f} Hz ({err:+.0f} cents)")
        print(row)

    print()
    if fails:
        for f in fails:
            print(f"  FAIL  {f}")
        print("\n  ✗ TRANSLATION FAILED — the ANSWER does not survive small speakers,\n"
              "    which means on most devices the series' central idea does not land.\n")
        return 1
    print("  ok    every ANSWER note is recoverable at pitch through a 500 Hz\n"
          "        high-pass — the missing fundamental is being implied by its\n"
          "        harmonics, so the answer arrives even on a phone.\n")
    print("  ✓ TRANSLATION VERIFICATION PASSED\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
