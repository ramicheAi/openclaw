#!/usr/bin/env python3
"""
UNDERTOW — the texture tier: licensed material, put in this show's water.

The signature tier (build-score.py, build-signatures.py) is written from
nothing, because the theme and the stingers are the IP and must be original.
This is the other half of the argument. There is no artistic reason to
synthesise a room full of people or a body of water from scratch, and trying to
is what stops a sound department scaling past ten cues.

The risk with licensed material is obvious: it sounds like a library. Different
rooms, different microphones, different decades, no relationship to each other
or to the score. A show whose sound is assembled that way is recognisably
assembled.

So every texture goes through fathom_space(). A crowd recorded in an art gallery
and a Fathom stinger written in numpy share nothing — not timbre, not tuning,
not authorship. Put both at "sunlit" and they share a ROOM, because acoustically
they now were recorded in the same one. qc/verify_texture.py measures whether
that actually happened rather than assuming it.

Sources are Splice-licensed and recorded in the manifest with their asset UUIDs,
so the provenance of every shipped texture is traceable to a licence.

    python3 build-textures.py --src <dir of source wavs>
"""
import argparse
import json
import os
import sys

import numpy as np

import mastering as M

ART = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ART, "textures")

# Textures deliver 4 LU under the score, and that is a decision rather than a
# compromise. Two reasons, and the second only became visible once real material
# went through the chain:
#
#   * A bed is not a cue. Ambience mixed at cue level does not sit under
#     dialogue, it competes with it, and every mixer receiving these would
#     start by pulling them down by about this much.
#   * Dense broadband material cannot reach -16 LUFS under a -1.0 dBTP ceiling
#     without limiting hard enough to hear. Water noise has no peaks to spare.
#     Pushed to -16, three of these came back level-capped, which is the chain
#     reporting honestly that it could not have both. Asking for less loudness
#     is the right way to resolve that; asking the limiter to work harder is
#     how ambience turns to hiss.
TEXTURE_LUFS = -20.0

# (output name, source file, fathom tier, seconds, gain dB, what it is for)
#
# The tier is a dramatic decision, not a technical one. The classroom laugh is
# scored at "air" because Episode 1 wants that room to be pointedly dry — it is
# the world Kai is failing in, and it has none of the depth the water has. The
# same recording at "twilight" is the memory of that laugh, heard from under.
TEXTURES = [
    ("pool-surface",    "underwater.wav", "sunlit",   8.0,  0.0,
     "Water at the surface. The bed under any poolside scene."),
    ("pool-submerged",  "underwater.wav", "twilight", 8.0, -1.0,
     "The same water from under it. Cutting between this and pool-surface IS "
     "the show's basic gesture, and it costs one function call."),
    ("pool-deep",       "underwater.wav", "abyssal",  8.0, -2.0,
     "Water with nothing bounding it. For anything past the sealed door."),
    ("crowd-poolside",  "roomtone.wav",   "sunlit",  20.0, -3.0,
     "A meet, heard from the deck. Source is an art-gallery room tone, chosen "
     "deliberately: if THIS reads as a natatorium, the treatment is real."),
    ("crowd-submerged", "roomtone.wav",   "midnight", 20.0, -4.0,
     "The same crowd heard with your head under, which is the sound every "
     "swimmer in the audience knows and almost no show gets right."),
    ("class-laugh",     "classroom.wav",  "air",      6.0, -2.0,
     "The classroom laughing at the Anchor, Episode 1. Deliberately dry."),
    ("class-laugh-memory", "classroom.wav", "abyssal", 6.0, -6.0,
     "The same laugh as Kai hears it on the pool floor. Same recording, four "
     "rungs down; the distance is the whole point."),
]


def take(x, seconds, sr=M.SR):
    """A window from the middle of a source, faded in and out.

    From the middle rather than the head because the first second of a field
    recording is usually the recordist settling, and the last is them reaching
    for the stop button.
    """
    n = int(seconds * sr)
    if len(x) <= n:
        reps = int(np.ceil(n / max(1, len(x))))
        x = np.tile(x, (reps, 1))
    start = max(0, (len(x) - n) // 2)
    seg = x[start:start + n].copy()
    f = max(2, int(0.25 * sr))
    seg[:f] *= np.linspace(0, 1, f)[:, None]
    seg[-f:] *= np.linspace(1, 0, f)[:, None]
    return seg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="directory holding the source wavs")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    scratch = os.path.join(OUT, "_probe.wav")

    built = []
    print(f"\n  TEXTURE TIER  ->  {OUT}\n")
    print(f"  {'name':22s} {'tier':10s} {'LUFS':>7s} {'dBTP':>7s} {'corr':>7s}")
    for name, src, tier, secs, gain_db, _why in TEXTURES:
        path = os.path.join(args.src, src)
        if not os.path.exists(path):
            print(f"  \033[33mskip\033[0m {name}: no source at {path}")
            continue
        x = M.read_wav(path)
        seg = take(x, secs) * (10 ** (gain_db / 20))
        wet = M.fathom_space(seg, tier, seed=abs(hash(name)) % 9000 + 11)
        st, lufs, capped = M.master(wet, scratch, target=TEXTURE_LUFS)
        dest = os.path.join(OUT, f"{name}.wav")
        M.write_master(dest, st, bits=24)
        corr = M.correlation(st[:, 0], st[:, 1])
        flag = "  \033[33m(level capped)\033[0m" if capped else ""
        print(f"  {name:22s} {tier:10s} {lufs:7.1f} {M.true_peak(st):7.1f} {corr:+7.2f}{flag}")
        built.append({"name": name, "source": src, "tier": tier,
                      "seconds": secs, "lufs": round(lufs, 1)})

    if os.path.exists(scratch):
        os.remove(scratch)

    with open(os.path.join(OUT, "textures.json"), "w", encoding="utf-8") as fh:
        json.dump({"_comment": ("Texture tier. Licensed sources through "
                                "mastering.fathom_space() so library material and "
                                "the show's own signature kit share one room. "
                                "Licences are recorded in SAMPLES-MANIFEST.md."),
                   "textures": built}, fh, indent=1)
        fh.write("\n")
    print(f"\n  {len(built)} textures built\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
