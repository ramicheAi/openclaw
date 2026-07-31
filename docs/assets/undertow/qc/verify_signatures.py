"""
Structural verification for the UNDERTOW sound signature kit.

verify_audio.py answers "is this a clean, correctly-levelled audio file". That
is necessary and not sufficient here, because every claim this kit makes is a
claim about STRUCTURE: that the Fathom ladder is audibly a ladder, that the
dive reflex actually slows, that Kemar's break actually has a hole in it. A
file can pass loudness and true-peak checks while doing none of those things.

So this measures the design intent directly and fails if it is absent.

    python3 qc/verify_signatures.py
"""
import os
import sys
import wave

import numpy as np

QC = os.path.dirname(os.path.abspath(__file__))
SIG = os.path.join(os.path.dirname(QC), "signatures")

FATHOM_ORDER = ["sunlit", "twilight", "midnight", "abyssal", "hadal"]


def read(path):
    w = wave.open(path)
    sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64)
    a = a.reshape(-1, w.getnchannels()).mean(1) / 32768.0
    return a, sr


def centroid(x, sr):
    """Spectral centroid in Hz — 'how bright is this'."""
    win = x * np.hanning(len(x))
    mag = np.abs(np.fft.rfft(win))
    freq = np.fft.rfftfreq(len(win), 1 / sr)
    return float((mag * freq).sum() / max(mag.sum(), 1e-12))


def tail_seconds(x, sr, floor_db=-45.0):
    """How long the sound stays above a floor — a proxy for perceived space."""
    env = np.abs(x)
    # 20ms smoothing so single samples don't decide the answer
    k = int(0.02 * sr)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    peak = env.max()
    if peak <= 0:
        return 0.0
    above = np.where(env > peak * 10 ** (floor_db / 20))[0]
    return float((above[-1] - above[0]) / sr) if len(above) else 0.0


def beat_times(x, sr, thresh=0.30, merge=0.12):
    """Onset times from the amplitude envelope.

    `merge` matters more than it looks. Both drum motifs play a main strike
    with a soft echo a third of a beat behind it; at the default 0.12s window
    the echoes count as beats and the measured tempo is meaningless. Pass a
    merge window wider than the echo offset to read the true pulse.
    """
    k = int(0.01 * sr)
    env = np.convolve(np.abs(x), np.ones(k) / k, mode="same")
    if env.max() <= 0:
        return np.array([])
    env = env / env.max()
    hot = env > thresh
    starts = np.where(hot[1:] & ~hot[:-1])[0] + 1
    keep = []
    for s in starts:
        if not keep or s - keep[-1] > merge * sr:
            keep.append(s)
    return np.array(keep) / sr


def rolloff(x, sr, frac=0.995):
    """Frequency below which `frac` of the energy sits — the signal's own bandwidth."""
    mag = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    freq = np.fft.rfftfreq(len(x), 1 / sr)
    c = np.cumsum(mag)
    if c[-1] <= 0:
        return 0.0
    return float(freq[np.searchsorted(c, c[-1] * frac)])


CLICK_LIMIT = 3.0


def click_ratio(x, sr):
    """Is the sharpest jump an outlier against this signal's OWN jumps?

    Two earlier attempts at this were wrong and are worth recording, because
    both look reasonable:

      * A fixed threshold. Wrong because a bright glass partial at full ring
        legitimately produces a big jump while a click in a dark quiet sound
        produces a small one — it flagged a clean 3.5kHz partial as a defect.
      * Slope against the signal's spectral rolloff. Wrong twice over: rolloff
        measured across a whole file badly underestimates bandwidth at the
        attack, where every sharp moment lives; and a real click RAISES the
        measured bandwidth, so the metric partly hides the thing it hunts.

    A click is an outlier in time, not a bandwidth question. Compare the worst
    jump to the 99.9th percentile of all jumps: a sustained bright partial
    contributes many large differences and stays flat, a single-sample step
    towers over its own distribution.

    Calibrated, not guessed. Across this kit the clean maximum is 2.08; a
    single planted +0.25 sample scores 3.54 in the brightest file (where a
    click hides best) and up to 50 in the darkest. CLICK_LIMIT sits at 3.0.
    Known limit: a click much smaller than 0.25 in bright material can pass.
    """
    if len(x) < 2:
        return 0.0
    d = np.abs(np.diff(x))
    p = np.percentile(d, 99.9)
    return float(d.max() / p) if p > 0 else 0.0


def endpoints(x):
    """A file must start and end at silence, or it ticks on play and on loop."""
    return float(abs(x[0])), float(abs(x[-1]))


def dominant(x, sr, lo=350.0, hi=4000.0):
    """Strongest spectral peak in a band — for reading melody, not brightness."""
    mag = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    freq = np.fft.rfftfreq(len(x), 1 / sr)
    m = (freq >= lo) & (freq <= hi)
    if not m.any():
        return 0.0
    return float(freq[m][np.argmax(mag[m])])


def low_centroid(x, sr, hi=400.0):
    """Centroid of the low band only — isolates a sub glissando from anything above it."""
    mag = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    freq = np.fft.rfftfreq(len(x), 1 / sr)
    m = freq <= hi
    mag, freq = mag[m], freq[m]
    return float((mag * freq).sum() / max(mag.sum(), 1e-12))


def band_centroid_over_time(x, sr, n=8):
    """Centroid of each of n equal slices — for checking a glissando's direction."""
    step = len(x) // n
    return [centroid(x[i * step:(i + 1) * step], sr) for i in range(n)]


TARGET_LUFS = -16.0
LOUDNESS_TOLERANCE = 2.5     # a capped stinger may sit under target; none may sit over
CEILING_DBTP = -1.0


def loudness(path):
    """Integrated LUFS and true peak, via ffmpeg. Returns (None, None) on failure."""
    import re
    import subprocess
    from shutil import which
    ff = which("ffmpeg")
    if not ff:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    out = subprocess.run([ff, "-hide_banner", "-i", path, "-map", "0:a",
                          "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    tail = out[out.rfind("Integrated loudness:"):]
    i = re.search(r"I:\s*(-?[\d.]+)\s*LUFS", tail)
    p = re.search(r"Peak:\s*(-?[\d.]+)\s*dBFS", tail)
    return (float(i.group(1)) if i else None, float(p.group(1)) if p else None)


def main():
    fails, notes = [], []

    # ── 1. the Fathom ladder must actually be a ladder ──────────────────────
    print("\n  FATHOM LADDER — brightness must fall, space must grow\n")
    print(f"    {'rank':10s} {'centroid':>10s} {'tail':>8s}")
    cents, tails = [], []
    for name in FATHOM_ORDER:
        p = os.path.join(SIG, f"fathom-{name}.wav")
        if not os.path.exists(p):
            fails.append(f"missing {p}")
            continue
        x, sr = read(p)
        c, t = centroid(x, sr), tail_seconds(x, sr)
        cents.append(c)
        tails.append(t)
        print(f"    {name:10s} {c:9.0f}Hz {t:7.2f}s")

    if len(cents) == len(FATHOM_ORDER):
        if not all(cents[i] > cents[i + 1] for i in range(len(cents) - 1)):
            fails.append("Fathom ladder is not monotonically darker with depth — "
                         "the audience cannot learn depth by ear if it isn't")
        else:
            notes.append("brightness falls monotonically across all five ranks")
        if not all(tails[i] < tails[i + 1] for i in range(len(tails) - 1)):
            fails.append("Fathom ladder space does not grow monotonically with depth")
        else:
            notes.append("perceived space grows monotonically across all five ranks")

    # ── 2. the dive reflex must actually slow down ──────────────────────────
    print("\n  MOTIFS\n")
    p = os.path.join(SIG, "motif-dive-reflex.wav")
    if os.path.exists(p):
        x, sr = read(p)
        # merge 0.45s: wide enough to swallow the 0.30s echo, narrower than the
        # slowest true beat (38 BPM = 1.58s), so this reads the heart itself
        bt = beat_times(x, sr, merge=0.45)
        if len(bt) < 6:
            fails.append(f"dive-reflex: only {len(bt)} onsets found, cannot confirm a ritardando")
        else:
            gaps = np.diff(bt)
            first, last = gaps[:max(2, len(gaps)//4)].mean(), gaps[-max(2, len(gaps)//4):].mean()
            print(f"    dive-reflex    {len(bt)} onsets, "
                  f"first gaps {first:.2f}s -> last {last:.2f}s")
            if last <= first * 1.15:
                fails.append("dive-reflex: the heart is not measurably slowing — "
                             f"{first:.2f}s -> {last:.2f}s between beats")
            else:
                notes.append(f"dive reflex slows {first:.2f}s -> {last:.2f}s between beats")

    # ── 3. the riddim break must actually have a hole in it ─────────────────
    p = os.path.join(SIG, "motif-riddim-break.wav")
    if os.path.exists(p):
        x, sr = read(p)
        bt = beat_times(x, sr, merge=0.45)
        if len(bt) < 4:
            fails.append("riddim-break: too few onsets to find the drop")
        else:
            gaps = np.diff(bt)
            biggest = gaps.max()
            typical = np.median(gaps)
            print(f"    riddim-break   {len(bt)} onsets, "
                  f"largest gap {biggest:.2f}s vs typical {typical:.2f}s")
            if biggest < typical * 2.5:
                fails.append("riddim-break: no silent bar found — the drop IS the technique")
            else:
                notes.append(f"riddim break drops {biggest:.2f}s against a {typical:.2f}s pulse")

    # ── 4. open-door's SUB must ascend ──────────────────────────────────────
    # Measured in the low band only. Whole-signal brightness is the wrong
    # instrument here: the glass CALL riding on top swamps a sub glissando,
    # and reports a barely-moving number for a gesture spanning two octaves.
    p = os.path.join(SIG, "motif-open-door.wav")
    if os.path.exists(p):
        x, sr = read(p)
        step = len(x) // 8
        seq = [low_centroid(x[i * step:(i + 1) * step], sr) for i in range(8)]
        early, late = np.mean(seq[1:3]), np.mean(seq[5:7])
        print(f"    open-door      sub centroid {early:.0f}Hz -> {late:.0f}Hz")
        if late < early * 1.4:
            fails.append(f"open-door: the sub does not climb — {early:.0f}Hz -> {late:.0f}Hz")
        else:
            notes.append(f"open-door sub climbs {early:.0f}Hz -> {late:.0f}Hz")

    # ── 5. current-wakes must actually rise in PITCH ────────────────────────
    # Brightness is likewise wrong here — the warm low pad under the phrase
    # drags the centroid down while the melody climbs. Read the melody itself:
    # the strongest partial in a window after each strike.
    p = os.path.join(SIG, "motif-current-wakes.wav")
    if os.path.exists(p):
        x, sr = read(p)
        bt = beat_times(x, sr, thresh=0.22, merge=0.30)
        pitches = [dominant(x[int(t * sr):int((t + 0.22) * sr)], sr) for t in bt[:5]]
        pitches = [p_ for p_ in pitches if p_ > 0]
        print(f"    current-wakes  strike pitches {[f'{p_:.0f}' for p_ in pitches]}")
        if len(pitches) < 3:
            fails.append(f"current-wakes: only {len(pitches)} strikes readable")
        elif not all(pitches[i] <= pitches[i + 1] * 1.02 for i in range(len(pitches) - 2)):
            fails.append(f"current-wakes: the phrase does not lift — {pitches}")
        else:
            notes.append(f"current-wakes lifts {pitches[0]:.0f}Hz -> {max(pitches):.0f}Hz")

    # ── 6. nothing in the kit may click or end mid-ring ─────────────────────
    for fn in sorted(os.listdir(SIG)):
        if not fn.endswith(".wav"):
            continue
        x, sr = read(os.path.join(SIG, fn))
        r = click_ratio(x, sr)
        if r > CLICK_LIMIT:
            fails.append(f"{fn}: worst jump {r:.1f}x its own 99.9th percentile — a click")
        s0, s1 = endpoints(x)
        if s0 > 1e-3 or s1 > 1e-3:
            fails.append(f"{fn}: does not start/end at silence ({s0:.4f}/{s1:.4f}) — ticks on loop")
        if np.abs(x).max() >= 0.999:
            fails.append(f"{fn}: clipped")

    # ── 7. the kit must be level-matched ────────────────────────────────────
    # A signature set is used by dropping cues onto a timeline. If they are not
    # matched, every relative balance a designer hears is an artifact of how
    # each sound happened to be synthesised rather than a decision.
    print("\n  LEVELS\n")
    spread = []
    for fn in sorted(os.listdir(SIG)):
        if not fn.endswith(".wav"):
            continue
        lufs, peak = loudness(os.path.join(SIG, fn))
        if lufs is None:
            fails.append(f"{fn}: could not measure loudness")
            continue
        spread.append(lufs)
        print(f"    {fn:28s} {lufs:6.1f} LUFS   {peak:5.1f} dBTP")
        if lufs > TARGET_LUFS + 0.5:
            fails.append(f"{fn}: {lufs:.1f} LUFS is over the {TARGET_LUFS:.0f} target")
        if lufs < TARGET_LUFS - LOUDNESS_TOLERANCE:
            fails.append(f"{fn}: {lufs:.1f} LUFS is more than {LOUDNESS_TOLERANCE} LU under target")
        if peak is not None and peak > CEILING_DBTP + 0.05:
            fails.append(f"{fn}: true peak {peak:.1f} dBTP breaches the {CEILING_DBTP} ceiling")
    if spread:
        notes.append(f"kit level-matched within {max(spread) - min(spread):.1f} LU, "
                     f"no true peak above {CEILING_DBTP} dBTP")

    print()
    for n in notes:
        print(f"  ok    {n}")
    for f in fails:
        print(f"  FAIL  {f}")
    print(f"\n  {'✓ SIGNATURE VERIFICATION PASSED' if not fails else '✗ SIGNATURE VERIFICATION FAILED'}\n")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
