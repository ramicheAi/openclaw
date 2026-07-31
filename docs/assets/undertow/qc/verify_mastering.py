"""
Delivery verification for every audio file in the UNDERTOW score package.

verify_signatures.py checks that the MUSIC does what it claims. This checks
that the FILES do — the engineering layer underneath, which is where the first
version of this score was actually weakest. Each check below exists because the
corresponding defect was found in a shipped file, not because it seemed prudent:

  dual-mono      every master was bit-identical L and R. A score whose subject
                 is depth and space was delivered with no space in it.
  true peak      measured on 4x oversampled audio, per ITU-R BS.1770. Sample
                 peak is not peak: a file legal at -1.0 dBFS per sample can
                 still reconstruct above 0 dBFS between samples and clip on a
                 codec's decode.
  loudness       the theme was -9.5 LUFS, the teaser cue -11.7, the kit -16.
                 Three parts of one score package, 6.5 LU apart.
  endpoints      files that begin or end on a non-zero sample click on play and
                 at every loop point, and no difference-based click test can
                 see it because there is no adjacent sample to compare against.
  dc offset      spends headroom and asymmetrically limits one polarity.
  subsonic       energy below hearing that every limiter still has to swallow.
  mono-sum       a wide mix that partially cancels when summed is worse than a
                 narrow one that does not; phones and theatrical bass
                 management both sum.

    python3 qc/verify_mastering.py
"""
import math
import os
import sys
import wave

import numpy as np
from scipy.signal import butter, resample_poly, sosfiltfilt

QC = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(QC)

TARGET_LUFS = -16.0
LUFS_TOLERANCE = 2.5          # under target is allowed (crest-limited), over is not
CEILING_DBTP = -1.0
MIN_BITS = 24                 # masters; a dithered 16-bit copy may sit alongside
MAX_DC = 1e-3
MAX_SUBSONIC = 0.005          # fraction of total energy below 22 Hz
# How much level a mono fold-down may cost.
#
# Set from the arithmetic, not from taste. Two fully decorrelated channels of
# equal power sum to half that power — exactly -3.0 dB — so any genuinely wide
# mix loses something on fold-down and that is physics, not a fault. Only a
# loss BEYOND -3 dB implies anti-phase content actually cancelling.
#
# The first version of this check used -1.5 dB and failed the Midnight stinger,
# which was simply the widest thing in the kit doing what it was designed to
# do. Loosening a threshold because it fired is usually the wrong move, so the
# number is derived instead: -3.0 dB is the theoretical floor, and 0.5 dB of
# headroom over it separates "wide" from "cancelling".
MONO_LOSS_WARN_DB = 2.5
MAX_MONO_LOSS_DB = 3.5

# Files that are legitimately near-mono, with the reason. Sub-bass content is
# collapsed to mono below 120Hz on purpose, so anything living entirely down
# there cannot be wide and must not be failed for it.
MONO_BY_DESIGN = {
    "signatures/fathom-hadal.wav": "D2 sub under an 800Hz lowpass - no content above the mono-maker",
    "signatures/fathom-abyssal.wav": "almost all energy below 120Hz",
    "signatures/fathom-sunlit.wav": "closest rank, deliberately the narrowest image",
    "signatures/motif-dive-reflex.wav": "a heartbeat heard inside the chest is centred and dry",
    "signatures/motif-riddim-break.wav": "membrane and bass, both below the mono-maker",
    "signatures/motif-open-door.wav": "a sub glissando, centred by design",
}


def read(path):
    w = wave.open(path)
    sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
    raw = w.readframes(w.getnframes())
    if sw == 2:
        a = np.frombuffer(raw, dtype="<i2").astype(np.float64).reshape(-1, ch) / 32768.0
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, ch, 3).astype(np.int32)
        q = b[..., 0] | (b[..., 1] << 8) | (b[..., 2] << 16)
        a = np.where(q & 0x800000, q - 0x1000000, q).astype(np.float64) / 8388608.0
    else:
        a = np.frombuffer(raw, dtype="<i4").astype(np.float64).reshape(-1, ch) / 2147483648.0
    return a, sr, sw * 8


def true_peak_db(x, oversample=4):
    up = resample_poly(x, oversample, 1, axis=0)
    return 20 * math.log10(max(float(np.abs(up).max()), 1e-12))


def lufs(path):
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
    m = re.search(r"I:\s*(-?[\d.]+)\s*LUFS", tail)
    return float(m.group(1)) if m else None


def correlation(L, R):
    a, b = L - L.mean(), R - R.mean()
    d = math.sqrt(float((a * a).sum()) * float((b * b).sum()))
    return float((a * b).sum() / d) if d > 0 else 1.0


def targets():
    """Every deliverable in the score package."""
    out = [os.path.join(ART, "undertow-theme.wav"),
           os.path.join(ART, "qc", "teaser-score.wav")]
    sig = os.path.join(ART, "signatures")
    if os.path.isdir(sig):
        out += [os.path.join(sig, f) for f in sorted(os.listdir(sig)) if f.endswith(".wav")]
    return [p for p in out if os.path.exists(p)]


def main():
    fails, warns = [], []
    print(f"\n  SCORE DELIVERY VERIFICATION   target {TARGET_LUFS:.0f} LUFS / "
          f"{CEILING_DBTP:.1f} dBTP / {MIN_BITS}-bit\n")
    print(f"  {'file':30s} {'bits':>5s} {'LUFS':>7s} {'dBTP':>7s} {'corr':>6s} "
          f"{'mono':>7s} {'DC':>9s}")

    for p in targets():
        rel = os.path.relpath(p, ART)
        x, sr, bits = read(p)
        if x.shape[1] != 2:
            fails.append(f"{rel}: not stereo")
            continue
        L, R = x[:, 0], x[:, 1]

        corr = correlation(L, R)
        tp = true_peak_db(x)
        il = lufs(p)
        dc = float(np.abs(x.mean(0)).max())
        mid = (L + R) / 2
        mono_db = 20 * math.log10(max(np.sqrt((mid ** 2).mean()), 1e-12) /
                                  max(np.sqrt((L ** 2).mean()), 1e-12))

        print(f"  {rel:30s} {bits:5d} {il if il is not None else float('nan'):7.1f} "
              f"{tp:7.1f} {corr:+6.2f} {mono_db:+6.1f}dB {dc:9.6f}")

        if bits < MIN_BITS:
            fails.append(f"{rel}: {bits}-bit master (deliver 24-bit; dither any 16-bit copy)")
        if np.array_equal(L, R):
            fails.append(f"{rel}: left and right are bit-identical — this is not stereo")
        if tp > CEILING_DBTP + 0.05:
            fails.append(f"{rel}: true peak {tp:.1f} dBTP over the {CEILING_DBTP} ceiling")
        if il is not None:
            if il > TARGET_LUFS + 0.5:
                fails.append(f"{rel}: {il:.1f} LUFS is over target")
            elif il < TARGET_LUFS - LUFS_TOLERANCE:
                fails.append(f"{rel}: {il:.1f} LUFS is more than {LUFS_TOLERANCE} LU under target")
        if dc > MAX_DC:
            fails.append(f"{rel}: DC offset {dc:.5f}")
        if abs(x[0]).max() > 1e-4 or abs(x[-1]).max() > 1e-4:
            fails.append(f"{rel}: does not start and end at silence — clicks on play and on loop")
        if mono_db < -MAX_MONO_LOSS_DB:
            fails.append(f"{rel}: loses {abs(mono_db):.1f} dB summed to mono — past the -3 dB "
                         "decorrelation floor, so content is actively cancelling")
        elif mono_db < -MONO_LOSS_WARN_DB:
            warns.append(f"{rel}: loses {abs(mono_db):.1f} dB summed to mono — near the -3 dB "
                         "floor; wide, but check it on a phone before locking")

        sos = butter(4, 22, "lp", fs=sr, output="sos")
        sub = sosfiltfilt(sos, x, axis=0)
        frac = float((sub ** 2).sum() / max((x ** 2).sum(), 1e-20))
        if frac > MAX_SUBSONIC:
            fails.append(f"{rel}: {frac*100:.1f}% of energy below 22 Hz — inaudible, and it "
                         "spends headroom the limiter has to pay for")

        if corr > 0.97 and rel.replace(os.sep, "/") not in MONO_BY_DESIGN:
            warns.append(f"{rel}: correlation {corr:+.2f} — effectively mono, and not on the "
                         "documented list of files that are mono by design")

    print()
    for w in warns:
        print(f"  WARN  {w}")
    for f in fails:
        print(f"  FAIL  {f}")
    print(f"\n  {'✓ DELIVERY VERIFICATION PASSED' if not fails else '✗ DELIVERY VERIFICATION FAILED'}"
          + (f" — {len(warns)} warning(s)" if warns and not fails else "") + "\n")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
