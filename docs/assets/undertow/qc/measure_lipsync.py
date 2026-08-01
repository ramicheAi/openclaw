#!/usr/bin/env python3
"""
UNDERTOW — point the lip-sync instrument at a real shot.

qc/verify_lipsync.py calibrates the instrument on material it generates itself.
This is the instrument actually being USED: it reads a mouth out of a generated
video, compares it against the chart that video was supposed to perform, and
returns numbers.

    python3 qc/measure_lipsync.py --video shot.mp4 --chart chart.json \
                                  --box 0.44,0.55,0.59,0.67 [--audio vo.wav]

WHAT IT REPORTS

  closure accuracy   of the frames where the chart says the lips must be shut,
                     how many actually are. This is the number that decides
                     whether a shot is usable: audiences do not consciously read
                     vowel shapes and catch a missed closure every time.
  sync offset        frames the mouth leads (+) or lags (-) the chart. Early is
                     normal practice and forgiven; late is the failure everyone
                     notices, which is why the tolerances are lopsided.
  articulation       how much the mouth moves at all. A shot whose mouth barely
                     changes can score a flattering offset by accident, because
                     a flat signal correlates weakly with everything. This is
                     the guard against reading a still mouth as a synced one.

THE MOUTH BOX is given, not found. Locating a mouth in a stylised anime frame is
its own problem and guessing at it would put an unmeasured step underneath every
measurement. A box read off the start frame by eye is honest, reproducible, and
takes ten seconds.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
sys.path.insert(0, ART)
sys.path.insert(0, os.path.join(ART, "audio"))

import align as A          # noqa: E402
import mastering as M      # noqa: E402
import visemes as V        # noqa: E402

# A frame counts as SHUT below this fraction of the clip's own widest aperture.
# Relative rather than absolute because a closed anime mouth is still a drawn
# line, not an absence of ink, and because the aperture's pixel area depends
# entirely on shot scale.
SHUT_FRACTION = 0.22
# Below this much variation the mouth is not really moving and no offset
# computed from it means anything.
MIN_ARTICULATION = 0.10
MAX_LEAD_FRAMES = 2
MAX_LAG_FRAMES = 1


def extract(video, fps, box):
    """Per-frame mouth aperture inside the box, 0..1.

    NOT dark-pixel area, which is the obvious choice and the wrong one here. In
    this art style an open mouth shows TEETH — a bright band — so an open mouth
    is partly darker than skin and partly lighter than it. Counting only dark
    pixels reads a wide open mouth as barely more open than a closed one, and
    the measurement flattens exactly where it needs resolution.

    What separates cleanly is distance from the skin tone. The box is almost all
    face, so its modal luminance IS the skin; anything far from that mode in
    either direction is mouth — lip line, shadow, teeth, tongue. Closed reads as
    a thin line, open reads as a large region, and both are counted.

    The reference is taken once across the whole clip rather than per frame. A
    per-frame reference adapts to whatever is in front of it, which would
    normalise away the very thing being measured.
    """
    from PIL import Image
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([M.ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
                        "-i", video, "-vf", f"fps={fps}",
                        os.path.join(tmp, "f%05d.png")], check=True)
        files = sorted(os.listdir(tmp))
        if not files:
            raise SystemExit("no frames extracted")
        crops = []
        for f in files:
            im = Image.open(os.path.join(tmp, f)).convert("L")
            w, h = im.size
            x0, y0, x1, y1 = box
            crops.append(np.asarray(
                im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))),
                dtype=np.float64))

    allpix = np.concatenate([c.ravel() for c in crops])
    hist, edges = np.histogram(allpix, bins=64, range=(0, 255))
    skin = float((edges[hist.argmax()] + edges[hist.argmax() + 1]) / 2.0)
    # Half the spread of the skin band itself, so ordinary shading on the face
    # is not counted as mouth while real lip and teeth values are.
    tol = max(12.0, float(np.std(allpix[np.abs(allpix - skin) < 40])) * 1.6)
    area = np.array([float((np.abs(c - skin) > tol).sum()) / c.size for c in crops])
    peak = area.max()
    return (area / peak if peak > 0 else area), skin, len(crops)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--chart", required=True)
    ap.add_argument("--box", required=True,
                    help="x0,y0,x1,y1 as fractions of frame size")
    ap.add_argument("--audio", help="the recording, to measure picture against sound")
    ap.add_argument("--label", default="")
    args = ap.parse_args()

    chart = json.load(open(args.chart))
    fps = chart.get("fps", 24)
    frames = chart["frames"]
    want = np.asarray(V.openness(frames))
    box = tuple(float(v) for v in args.box.split(","))

    got, thresh, n = extract(args.video, fps, box)
    m = min(len(got), len(want))
    got, want_c = got[:m], want[:m]

    print(f"\n\033[1mLIP-SYNC MEASUREMENT{(' — ' + args.label) if args.label else ''}\033[0m")
    print(f"  {os.path.basename(args.video)}   {n} frames at {fps}fps, "
          f"chart is {len(frames)}")
    print(f"  mouth box {box}, skin reference {thresh:.0f}/255")

    articulation = float(got.std())
    print(f"\n  articulation   {articulation:.3f}"
          f"   (needs > {MIN_ARTICULATION} for any of the rest to mean anything)")
    if articulation < MIN_ARTICULATION:
        print("  \033[31m✗ the mouth barely moves. Nothing below this line is "
              "meaningful — a still mouth correlates weakly with everything, "
              "which reads as a small offset rather than as no performance.\033[0m\n")
        return 1
    print("  \033[32m✓\033[0m the mouth is actually performing")

    # THE RECORDING IS THE REFERENCE, NOT THE CHART.
    #
    # Both are legitimate comparisons and they do not agree, so which one is
    # authoritative matters. Measured on the first real shot: picture against
    # recording +0 frames, chart against that same recording +0 frames, and
    # picture against chart +5. Two things aligned to the same clock cannot be
    # five frames apart, so the +5 is not timing — it is SHAPE. The chart is a
    # blocky nine-level approximation and renders a drawn-out word as one flat
    # open run where the real articulation has several separate movements.
    #
    # The audience hears the recording. The chart is an intermediate that exists
    # to place mouths, and grading a shot against an intermediate rather than
    # against the thing it will be played with is how a good take gets rejected.
    chart_offset, chart_r = A.sync_offset(got, want_c, max_frames=12)
    env = None
    if args.audio and os.path.exists(args.audio):
        env = A.speech_envelope(M.read_wav(args.audio), M.SR, fps)[:m]
        offset, r = A.sync_offset(got, env, max_frames=12)
        src = "the RECORDING"
    else:
        offset, r = chart_offset, chart_r
        src = "the CHART (no recording supplied — weaker reference, see the "
        src += "note in this file)"
    print(f"\n  sync offset    {offset:+d} frames   (r={r:+.3f})   against {src}")
    if env is not None:
        print(f"                 (against the chart it reads {chart_offset:+d}; "
              f"a gap here is shape, not timing)")
    if offset > MAX_LEAD_FRAMES:
        print(f"  \033[31m✗\033[0m mouth leads by {offset} frames, over the "
              f"{MAX_LEAD_FRAMES}-frame allowance")
    elif offset < -MAX_LAG_FRAMES:
        print(f"  \033[31m✗\033[0m mouth LAGS by {-offset} frames — this is the "
              f"direction an audience notices")
    else:
        print(f"  \033[32m✓\033[0m within tolerance (+{MAX_LEAD_FRAMES} early / "
              f"-{MAX_LAG_FRAMES} late)")

    # Closures, compared at the offset actually measured: a shot that is simply
    # shifted should be reported as shifted, not as having missed its closures.
    need = [i for i in V.closure_frames(frames) if 0 <= i + offset < m]
    shut = got <= SHUT_FRACTION
    hit = [i for i in need if shut[i + offset]]
    print(f"\n  closures       {len(hit)} of {len(need)} shut "
          f"(chart frames {need})")
    if need and len(hit) == len(need):
        print("  \033[32m✓\033[0m every required closure lands")
    elif need:
        missed = [i for i in need if i not in hit]
        print(f"  \033[31m✗\033[0m missed at {missed} — measured aperture "
              f"{[round(float(got[i + offset]), 2) for i in missed]} "
              f"against a {SHUT_FRACTION} shut threshold")

    # The single number that decides usability, stated last so it is the thing
    # left on screen.
    in_time = -MAX_LAG_FRAMES <= offset <= MAX_LEAD_FRAMES
    closed_ok = not need or len(hit) == len(need)
    print(f"\n  VERDICT        ", end="")
    if not in_time and not closed_ok:
        print("\033[31mnot usable\033[0m — neither the timing nor the "
              "articulation is there.")
    elif not in_time:
        print("\033[31mout of sync\033[0m — articulation is fine, timing is not.")
    elif not closed_ok:
        # Report these separately, because they fail for opposite reasons and the
        # fix is different. A take that is in time but never closes its lips is
        # not a sync problem to retry; it is a limit of what the generator does,
        # and the answer is shot design rather than another take.
        print("\033[31mnot usable as a visible-mouth shot\033[0m — the timing is "
              "there and the articulation is not. See Route A in the Sound Bible.")
    else:
        print("\033[32musable\033[0m")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
