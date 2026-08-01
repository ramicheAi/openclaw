#!/usr/bin/env python3
"""
UNDERTOW — proves the lip-sync pipeline before any of it is trusted.

THE PROBLEM THIS EXISTS FOR.

The standing limitation on this project has been stated plainly and it has not
changed: poses can be checked, movement cannot. Every swimming fault caught from
a contact sheet was visible in a single frame. The two that were missed — the
dolphin kick initiating at the legs, the shot drifting inside itself — were
properties of a sequence, and no still shows them.

Lip-sync is entirely a sequence property. So it needs an instrument, and an
instrument nobody has calibrated is a decoration. This script therefore does not
start by testing assets. It starts by testing ITSELF, against faults planted on
purpose, and reports its own failure if it cannot find them.

WHAT IS MEASURED

  1. ROUND TRIP.  Synthesise audio from a known chart, hand it back to the
     aligner, and require the alignment to come back where it started. If the
     aligner cannot recover a warp it was handed, nothing built on it means
     anything.
  2. PLANTED OFFSET.  Shift that audio by a known number of frames and require
     the offset detector to report that number, with the right sign. This is the
     calibration that licenses every later measurement.
  3. CLOSURE ACCURACY.  Read a rendered mouth back out of pictures and check the
     lips are actually shut on every M, B and P. Audiences do not consciously
     read vowels; they catch a missed closure every time.
  4. NEGATIVE CONTROL.  Run the offset detector against noise that has no
     relationship to the chart at all. It must NOT report confident sync. A
     detector that finds agreement in noise finds it everywhere.

Nothing here needs a voice recording, a video model, or a network. The whole
loop is exercised on material it generates itself, which is what makes it
runnable in the pre-commit gate on every machine, forever.

    python3 qc/verify_lipsync.py
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ART, "audio"))
sys.path.insert(0, ART)

import align as A          # noqa: E402
import visemes as V        # noqa: E402

SR = 48000
FPS = 24
FAIL = []

# Tolerances. Deliberately lopsided: a mouth that leads the sound is normal
# practice and a mouth that lags is the failure an audience notices, so early
# and late are not treated as the same size of error.
MAX_LEAD_FRAMES = 2.0
MAX_LAG_FRAMES = 1.0
PLANT_FRAMES = 5            # the defect planted to calibrate the detector
MIN_PLANT_DETECTION = 3.5   # must recover at least this much of a 5-frame shift
MAX_CONTROL_R = 0.45        # noise must not correlate better than this


def fail(msg):
    FAIL.append(msg)
    print(f"  \033[31m✗\033[0m {msg}")


def ok(msg):
    print(f"  \033[32m✓\033[0m {msg}")


# ── synthetic material ──────────────────────────────────────────────────────

def synth_speech(timeline, sr=SR, seed=7):
    """Turn a phone timeline into audio with a speech-shaped envelope.

    Not a voice — a stand-in with the right ACOUSTIC SHAPE, which is all the
    aligner reads. Vowels are loud and harmonic, fricatives are band-limited
    noise, stops are a near-silent gap with a burst at release, silence is
    silent. That is exactly the contour speech has, and it is the contour the
    energy-based aligner is built to follow.

    Using synthesised material rather than a recording is what lets this run in
    a pre-commit hook on a machine with no assets and no network.
    """
    rng = np.random.default_rng(seed)
    total = max((e for _, _, e in timeline), default=0.0)
    n = int(total * sr) + 1
    out = np.zeros(n)

    for phone, start, end in timeline:
        a, b = max(0, int(start * sr)), min(n, int(end * sr))
        if b <= a:
            continue
        t = np.arange(b - a) / sr
        bare = V.strip_stress(phone)
        if phone == "sil":
            continue
        if bare in V.STOPS:
            seg = np.zeros(len(t))
            burst = min(len(t), int(0.008 * sr))
            seg[-burst:] = rng.normal(0, 0.35, burst)
        elif bare in V.FRICATIVES or bare in V.AFFRICATES:
            seg = rng.normal(0, 0.30, len(t))
        elif bare in V.NASALS or bare in V.GLIDES:
            seg = 0.45 * np.sin(2 * np.pi * 180 * t)
        else:                                        # vowels: loud, harmonic
            seg = sum(0.9 / (k + 1) * np.sin(2 * np.pi * 150 * (k + 1) * t)
                      for k in range(6))
            seg *= 0.55
        # taper the joins so the envelope has no step discontinuities of its own
        e = max(2, int(0.004 * sr))
        if len(seg) > 2 * e:
            seg[:e] *= np.linspace(0, 1, e)
            seg[-e:] *= np.linspace(1, 0, e)
        out[a:b] += seg
    return out


def render_mouths(frames, size=64):
    """Draw each charted mouth as a picture, so the reader can be tested.

    The real pipeline measures a mouth region out of a generated shot. That path
    and this one share the measurement code; only the source of the pixels
    differs. Rendering here means the READER can be proven correct today,
    against material whose correct answer is known exactly, instead of being
    trusted on its first contact with a real asset.

    Cel-shaded anime draws a mouth as a dark shape on light skin, so the
    measurement is dark-pixel area inside the region — the same thing in both.
    """
    from PIL import Image, ImageDraw
    # (width, height) of the aperture, as a fraction of the box
    SHAPE = {
        "X": (0.42, 0.02), "M": (0.44, 0.02), "F": (0.36, 0.10),
        "C": (0.34, 0.18), "I": (0.52, 0.22), "U": (0.20, 0.30),
        "E": (0.40, 0.38), "O": (0.30, 0.52), "A": (0.44, 0.72),
    }
    imgs = []
    for m in frames:
        img = Image.new("L", (size, size), 210)      # skin
        d = ImageDraw.Draw(img)
        w, h = SHAPE[m]
        cw, ch = w * size / 2, max(0.5, h * size / 2)
        d.ellipse([size / 2 - cw, size / 2 - ch, size / 2 + cw, size / 2 + ch], fill=40)
        imgs.append(np.asarray(img, dtype=np.float64))
    return imgs


# ── the measurement, shared with the real pipeline ──────────────────────────

def measured_openness(images, dark_below=120.0):
    """Read mouth aperture back out of pictures, 0..1 per frame.

    Dark-pixel area within the mouth region. Normalised by the largest aperture
    in the sequence rather than by an absolute figure, because the absolute area
    depends on shot scale and a close-up and a mid shot must both be readable.
    """
    area = np.array([float((im < dark_below).sum()) for im in images])
    peak = area.max()
    return area / peak if peak > 0 else area


def measured_closed(images, dark_below=120.0, shut_fraction=0.06):
    """Which frames show the lips actually SHUT.

    A closed mouth in cel-shaded anime is a line, not a hole: some dark pixels
    remain because the lip seam is still drawn. So "shut" is a small fraction of
    the sequence's own maximum aperture rather than zero dark pixels, which
    would never be true of any real drawing.
    """
    op = measured_openness(images, dark_below)
    return op <= shut_fraction


# ── the tests ───────────────────────────────────────────────────────────────

LINE = "Deep calls to deep, in the roar of your waterfalls."
DURATION = 3.6


def build_reference():
    lex = V.load_lexicon()
    pairs = V.transcribe(LINE, lex)
    timeline = V.to_timeline(pairs, DURATION, lead_s=0.0)
    frames = V.chart(timeline, FPS, DURATION)
    return pairs, timeline, frames


def test_round_trip(pairs, timeline, frames):
    print("\n\033[1mRound trip — the aligner recovers an alignment it was handed\033[0m")
    audio = synth_speech(timeline)
    got = A.refine(pairs, audio, SR, FPS)
    if not got:
        fail("aligner returned no path at all")
        return None

    ref_mid = np.array([(s + e) / 2 for _, s, e in timeline])
    got_mid = np.array([(s + e) / 2 for _, s, e in got])
    n = min(len(ref_mid), len(got_mid))
    err_frames = np.abs(ref_mid[:n] - got_mid[:n]) * FPS
    print(f"    {n} phones, mean error {err_frames.mean():.2f} frames, "
          f"worst {err_frames.max():.2f}")
    if err_frames.mean() <= 2.0:
        ok(f"alignment returns within {err_frames.mean():.2f} frames on average")
    else:
        fail(f"aligner drifts {err_frames.mean():.2f} frames from a known answer — "
             f"it cannot be used to place a mouth")
    return audio


def test_planted_offset(frames, audio):
    print("\n\033[1mPlanted offset — the detector must find a defect put there on purpose\033[0m")
    env = A.speech_envelope(audio, SR, FPS)
    openness = V.openness(frames)

    base, base_r = A.sync_offset(openness, env)
    print(f"    unshifted   offset {base:+d} frames   r={base_r:+.3f}")
    if abs(base) <= MAX_LEAD_FRAMES:
        ok(f"a correctly built chart reads as in sync ({base:+d} frames)")
    else:
        fail(f"a chart built from this very audio reads {base:+d} frames out — "
             f"the detector has a bias and every later number inherits it")

    # Plant the defect. Delaying the AUDIO makes the mouth early, so the
    # detector should report a larger positive offset by exactly that much.
    pad = np.zeros(int(PLANT_FRAMES / FPS * SR))
    late_audio = np.concatenate([pad, audio])
    env_late = A.speech_envelope(late_audio, SR, FPS)
    got, got_r = A.sync_offset(openness, env_late, max_frames=16)
    recovered = got - base
    print(f"    audio {PLANT_FRAMES} frames late   offset {got:+d} frames   "
          f"r={got_r:+.3f}   recovered {recovered:+d}")

    if recovered >= MIN_PLANT_DETECTION:
        ok(f"planted {PLANT_FRAMES}-frame defect detected as {recovered:+d} frames — "
           f"the detector is calibrated and may be believed")
    else:
        fail(f"planted a {PLANT_FRAMES}-frame offset and the detector only saw "
             f"{recovered:+d} — it cannot find a fault this size, so it cannot "
             f"clear a shot either")

    # And the other direction, because a detector with a sign error passes the
    # test above while reporting every late mouth as early.
    early_audio = audio[int(PLANT_FRAMES / FPS * SR):]
    env_early = A.speech_envelope(early_audio, SR, FPS)
    got_e, _ = A.sync_offset(openness, env_early, max_frames=16)
    if (got_e - base) <= -MIN_PLANT_DETECTION:
        ok(f"sign is correct: audio {PLANT_FRAMES} frames early reads "
           f"{got_e - base:+d}")
    else:
        fail(f"sign error — audio {PLANT_FRAMES} frames EARLY read as "
             f"{got_e - base:+d}, so lead and lag cannot be told apart")


def test_closures(frames):
    print("\n\033[1mClosure accuracy — read back out of pictures, not out of the chart\033[0m")
    want = V.closure_frames(frames)
    if not want:
        fail("test line contains no M, B or P — it cannot exercise the check")
        return
    images = render_mouths(frames)
    shut = measured_closed(images)

    missed = [i for i in want if not shut[i]]
    print(f"    {len(want)} frames require shut lips; "
          f"{len(want) - len(missed)} measured shut")
    if not missed:
        ok("every required closure reads as shut in the rendered frames")
    else:
        fail(f"{len(missed)} closure(s) not shut in the picture at frames {missed} — "
             f"a missed closure is the one sync error every audience catches")

    # The reader must also be able to say NO. If it calls everything shut, the
    # pass above is meaningless.
    open_frames = [i for i, m in enumerate(frames) if m == "A"]
    wrongly_shut = [i for i in open_frames if shut[i]]
    if open_frames and not wrongly_shut:
        ok(f"and it distinguishes them: none of the {len(open_frames)} wide-open "
           f"frames reads as shut")
    elif open_frames:
        fail(f"{len(wrongly_shut)} wide-open frame(s) also read as shut — the "
             f"reader cannot tell a closed mouth from an open one, so the "
             f"closure result above proves nothing")


def test_negative_control(frames):
    print("\n\033[1mNegative control — noise must not read as sync\033[0m")
    rng = np.random.default_rng(29)
    openness = V.openness(frames)
    noise = rng.normal(0, 0.2, int(DURATION * SR))
    env = A.speech_envelope(noise, SR, FPS)
    _, r = A.sync_offset(openness, env)
    print(f"    unrelated noise   best r = {r:+.3f}  (limit {MAX_CONTROL_R:+.2f})")
    if abs(r) < MAX_CONTROL_R:
        ok("noise does not correlate with the chart, so agreement means something")
    else:
        fail(f"noise correlates at r={r:+.3f} — this detector would clear a shot "
             f"whose audio has nothing to do with its picture")


def main():
    print("\n\033[1mUNDERTOW — lip-sync pipeline verification\033[0m")
    print(f"  test line: {LINE!r}  ({DURATION}s at {FPS}fps)")
    pairs, timeline, frames = build_reference()
    print(f"  {len(pairs)} phones -> {len(frames)} frames, "
          f"{len(V.closure_frames(frames))} requiring shut lips")

    audio = test_round_trip(pairs, timeline, frames)
    if audio is not None:
        test_planted_offset(frames, audio)
    test_closures(frames)
    test_negative_control(frames)

    print()
    if FAIL:
        print(f"\033[31m  FAILED — {len(FAIL)} problem(s). The lip-sync pipeline is "
              f"NOT calibrated and its results must not be believed.\033[0m\n")
        return 1
    print("\033[32m  PASSED — the instrument finds faults it was given on purpose, "
          "so it may be pointed at real shots\033[0m\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
