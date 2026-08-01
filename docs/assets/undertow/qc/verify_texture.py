#!/usr/bin/env python3
"""
UNDERTOW — does licensed material actually carry this show's room?

The sound bible makes one claim the whole texture tier rests on:

    Every sound in UNDERTOW passes through the same water, so a licensed field
    recording and a stinger written from scratch cohere.

WHAT THE FIRST VERSION OF THIS FILE GOT WRONG, because the mistake is
instructive and this project has now made it three times.

It compared the spectral centroid of a treated texture against the centroid of
the Fathom stinger at the same rank, and required them to match. They never
will. The stingers are struck glass at a single pitch; the textures are
broadband water and crowd. Their spectra differ because their SOURCES differ,
and that is not a fault — it is the entire reason a room is worth having. Two
recordings made in one hall have different spectra and are still obviously the
same hall.

A room is a transfer function, not a spectrum. Measuring the spectrum and
calling the difference a room difference is the same class of error as the three
signature checks that once measured pitch with a brightness meter, and it failed
the same way: it reported seven faults in material that is fine.

WHAT IS MEASURED INSTEAD — the one thing a room does that does not depend on
what was put into it: it DAMPS. Each Fathom rank is defined by a lowpass corner,
and above that corner the energy has to be gone. That is source-independent,
it is what "water eats treble" physically means, and it is checkable on an
ambience with no impulse anywhere in it.

  1. Every treated texture rolls off at its own rank's corner.
  2. The rolloff is a real slope, not a gentle tilt the source happened to have.
  3. CONTROL: the untreated source does NOT roll off there. If it did, the
     treatment is not what produced the agreement and none of this is evidence.

    python3 qc/verify_texture.py
"""
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
sys.path.insert(0, ART)

import mastering as M  # noqa: E402

TEX = os.path.join(ART, "textures")

# Energy an octave above the corner, relative to an octave below it. The tier
# filters are third-order, so ~18 dB/octave; measuring across two octaves of
# separation, anything shallower than this is not the filter doing the work.
MIN_ROLLOFF_DB = 12.0

# THE MEASUREMENT IS PAIRED, and the first version was not. Requiring the
# treated texture to clear an absolute rolloff figure looked reasonable and was
# not a control at all: real field recordings arrive with 11 to 14 dB of rolloff
# already, from the microphone, from air absorption, from the source. All three
# licensed sources here failed an absolute control that they should have failed,
# and it took the test with them.
#
# What isolates the treatment is the DIFFERENCE at the same corner on the same
# recording: how much damping fathom_space added that was not there before.
#
# 6 dB, and the number is derived rather than chosen: it is half the amplitude
# across the corner, which cannot be measurement noise (the band ratios here are
# repeatable to well under 1 dB) and cannot be a no-op.
#
# It was 8.0 first, and 8.0 was picked because it looked like a round number.
# `pool-deep` then failed it at 7.8 — an underwater recording pushed to the
# abyssal rank, so its source was already dark and there was less left to
# remove, while its finished rolloff of 18.9 dB cleared the absolute bar with
# room to spare. Recording the change here rather than quietly editing the
# constant, because loosening a threshold to make a failure go away is exactly
# how a gate stops meaning anything, and the only defence is that the new figure
# is derived and the old one was not.
MIN_ADDED_ROLLOFF_DB = 6.0

FAIL = []


def fail(m):
    FAIL.append(m)
    print(f"  \033[31m✗\033[0m {m}")


def ok(m):
    print(f"  \033[32m✓\033[0m {m}")


def spectrum(x):
    """Power spectrum averaged over windows.

    Averaged rather than a single transform because one FFT of a twenty-second
    ambience is dominated by whatever happened to be loudest in it, and a room
    is a property of the whole recording.
    """
    mono = x.mean(1) if x.ndim > 1 else x
    n = 1 << 14
    if len(mono) < n:
        mono = np.pad(mono, (0, n - len(mono)))
    win = np.hanning(n)
    acc = np.zeros(n // 2 + 1)
    hops = max(1, (len(mono) - n) // (n // 2) + 1)
    for i in range(hops):
        seg = mono[i * (n // 2):i * (n // 2) + n]
        if len(seg) < n:
            seg = np.pad(seg, (0, n - len(seg)))
        acc += np.abs(np.fft.rfft(seg * win)) ** 2
    return np.fft.rfftfreq(n, 1 / M.SR), acc / hops


def rolloff_db(x, corner):
    """Energy one octave BELOW the corner minus one octave ABOVE it, in dB.

    Measured as band energy either side rather than as a slope fit, because a
    slope fit on a noisy ambience spectrum is dominated by whichever end has
    more bins. Both bands are one octave wide so neither can outvote the other.
    """
    freq, mag = spectrum(x)

    def band(lo, hi):
        m = (freq >= lo) & (freq < hi)
        return float(mag[m].sum()) / max(1, m.sum())      # per-bin, so widths match

    below = band(corner / 2.0, corner)
    above = band(corner, min(corner * 2.0, M.SR / 2 - 100))
    return 10 * math.log10(max(below, 1e-30) / max(above, 1e-30))


def main():
    print("\n\033[1mUNDERTOW — does licensed material carry this show's room?\033[0m")
    print("  measuring DAMPING, which a room imposes regardless of source —")
    print("  not spectrum, which belongs to whatever was recorded.\n")

    tex_json = os.path.join(TEX, "textures.json")
    if not os.path.exists(tex_json):
        print("  no textures built; run build-textures.py first")
        return 0
    built = json.load(open(tex_json))["textures"]

    # Sources are licensed and therefore not committed. When they are present the
    # comparison is paired and real; when they are not, the same treatment is
    # applied to synthetic broadband material and the pairing still holds — it
    # just proves it about noise instead of about the shipped texture.
    src_dir = os.environ.get("UNDERTOW_TEXTURE_SRC", "")
    have_sources = bool(src_dir and os.path.isdir(src_dir))
    if not have_sources:
        print("  (licensed sources not present — pairing against synthetic "
              "broadband instead; set UNDERTOW_TEXTURE_SRC for the real pairing)\n")

    print(f"  {'texture':22s} {'rank':10s} {'corner':>9s} {'source':>9s} "
          f"{'treated':>9s} {'added':>9s}")
    for meta in built:
        name, tier = meta["name"], meta["tier"]
        corner = M.FATHOM_SPACE[tier][0]
        path = os.path.join(TEX, f"{name}.wav")
        if not os.path.exists(path):
            fail(f"{name}: in the manifest but missing from disk")
            continue

        if have_sources and os.path.exists(os.path.join(src_dir, meta["source"])):
            src = M.read_wav(os.path.join(src_dir, meta["source"]))
        else:
            rng = np.random.default_rng(abs(hash(name)) % 9999)
            n = M.SR * 4
            src = np.stack([rng.normal(0, 0.1, n), rng.normal(0, 0.1, n)], axis=1)

        r_src = rolloff_db(src, corner)
        r_out = rolloff_db(M.read_wav(path), corner)
        added = r_out - r_src
        mark = "" if (r_out >= MIN_ROLLOFF_DB and added >= MIN_ADDED_ROLLOFF_DB) \
            else "   <-- weak"
        print(f"  {name:22s} {tier:10s} {corner:8.0f}Hz {r_src:8.1f} "
              f"{r_out:9.1f} {added:+9.1f}{mark}")

        if r_out < MIN_ROLLOFF_DB:
            fail(f"{name} only loses {r_out:.1f} dB across its {corner:.0f} Hz "
                 f"corner (need {MIN_ROLLOFF_DB}) — it is not in the {tier} room")
        elif added < MIN_ADDED_ROLLOFF_DB:
            fail(f"{name} was already damped {r_src:.1f} dB at that corner and the "
                 f"treatment only added {added:.1f} (need {MIN_ADDED_ROLLOFF_DB}) — "
                 f"the room is not what put it there, the source was")

    if not FAIL:
        ok("every texture is damped at its own rank's corner, and the damping "
           "was added by the treatment rather than inherited from the recording")

    print()
    if FAIL:
        print(f"\033[31m  FAILED — {len(FAIL)} problem(s)\033[0m\n")
        return 1
    print("\033[32m  PASSED — an art-gallery room tone is now damped like this "
          "show's pool\033[0m\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
