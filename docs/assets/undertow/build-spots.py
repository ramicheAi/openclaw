#!/usr/bin/env python3
"""
UNDERTOW — the spot tier: single-event sounds the picture can collide with.

The beds are states; these are EVENTS. The review that forced this file into
existence measured the sinking sequence and found that not one of the script's
hard sync moments existed in the mix — no buzzer under the flinch that causes
the fall, no splash under the impact, no air-burst under the scream that costs
him his air. A mix with no events never touches its picture.

Spots are prepared differently from textures on purpose:

  * PEAK-normalized (to -6 dBFS), not loudness-normalized. A transient's
    identity is its crest; LUFS-matching a splash to a bed flattens the one
    property it exists for.
  * DRY. Any fathom placement happens at scene-build time from the cue sheet,
    because the same splash is heard from the deck at 13.0s and from below,
    four rungs down, when Bo enters at 66.5s.

The buzzer is SYNTHESIZED (signature tier — a school start buzzer the audience
learns to dread is IP; also it must be pitch-stable so the flinch cue is
identical every episode). The water spots are licensed (texture doctrine: no
artistic argument for synthesizing a splash), excerpted here.

    python3 build-spots.py --src <dir with splash-dive.wav / uw-bubbles.wav>
"""
import argparse
import json
import os

import numpy as np
from scipy.signal import butter, sosfilt

import mastering as M

ART = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ART, "spots")
SR = M.SR
PEAK_DBFS = -6.0


def norm(x):
    p = float(np.abs(x).max())
    return x * (10 ** (PEAK_DBFS / 20) / max(p, 1e-9))


def fade(x, a=0.004, b=0.06):
    n = len(x)
    fi, fo = int(a * SR), int(b * SR)
    x[:fi] *= np.linspace(0, 1, fi)[:, None] if x.ndim > 1 else np.linspace(0, 1, fi)
    x[-fo:] *= np.linspace(1, 0, fo)[:, None] if x.ndim > 1 else np.linspace(1, 0, fo)
    return x


def buzzer(dur=0.9):
    """The start buzzer. Harsh on purpose: a square-ish stack around 420 Hz
    with a fifth above it, hard attack, slight AC flutter — the sound of a
    cheap horn bolted to a tiled wall. This is the sound Kai flinches at."""
    t = np.arange(int(dur * SR)) / SR
    f0 = 420.0
    x = np.zeros_like(t)
    for k in (1, 3, 5, 7, 9):                       # square-wave partials
        x += np.sin(2 * np.pi * f0 * k * t) / k
    x += 0.5 * np.sin(2 * np.pi * f0 * 1.5 * t)     # the ugly fifth
    x *= 1.0 + 0.12 * np.sin(2 * np.pi * 100 * t)   # mains flutter
    env = np.minimum(1.0, t / 0.005) * np.exp(-np.maximum(0, t - dur + 0.15) * 18)
    x = x * env
    x = sosfilt(butter(2, 4200, "lp", fs=SR, output="sos"), x)
    return np.stack([x, x], 1)


def excerpt(path, t0, t1):
    x = M.read_wav(path)
    return x[int(t0 * SR):int(t1 * SR)].copy()


def to_onset(x, thresh_db=-20.0, pre_s=0.03):
    """Trim so the file STARTS at its own attack.

    A field-recorded splash begins with the recordist's room, then the event.
    An event file whose peak sits a second in cannot land on its cue-sheet
    time — the events gate found the splash missing its ±150ms window for
    exactly this reason. After this, t in the cue sheet IS the impact.
    """
    env = np.abs(x).max(axis=1)
    th = 10 ** (thresh_db / 20) * env.max()
    idx = int(np.argmax(env >= th))
    return x[max(0, idx - int(pre_s * SR)):]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    spots = {}

    spots["buzzer"] = buzzer()

    splash = os.path.join(args.src, "splash-dive.wav")
    bub = os.path.join(args.src, "uw-bubbles.wav")

    # The impact: attack of the dive splash, tail kept short — the bed and the
    # laughter own the aftermath.
    spots["splash-impact"] = fade(to_onset(excerpt(splash, 0.0, 3.4)))
    # Bo's entry, heard from below: the same recording is re-placed at depth by
    # the cue sheet; keeping it one source is the house-acoustic argument again.
    spots["splash-entry"] = fade(to_onset(excerpt(splash, 0.0, 4.2)))
    # The scream that costs him his air: the burst region of the bubble take.
    spots["air-burst"] = fade(to_onset(excerpt(bub, 0.0, 2.8)))
    # The thrash: sustained churn, used under the panic shot.
    spots["water-thrash"] = fade(excerpt(bub, 2.0, 8.5), a=0.25, b=0.8)

    man = {}
    print(f"\n  SPOT TIER  ->  {OUT}\n")
    for name, x in spots.items():
        x = norm(np.asarray(x, dtype=np.float64))
        if x.ndim == 1:
            x = np.stack([x, x], 1)
        dest = os.path.join(OUT, f"{name}.wav")
        M.write_master(dest, x, bits=24)
        man[name] = {"seconds": round(len(x) / SR, 2), "peak_dbfs": PEAK_DBFS}
        print(f"    {name:16s} {len(x)/SR:5.2f}s  peak {PEAK_DBFS:.0f} dBFS")

    with open(os.path.join(OUT, "spots.json"), "w") as f:
        json.dump({"_comment": "Spot tier: peak-normalized dry event sounds. "
                   "Fathom placement happens at scene build from the cue sheet.",
                   "spots": man}, f, indent=1)
    print(f"\n  {len(spots)} spots built")


if __name__ == "__main__":
    main()
