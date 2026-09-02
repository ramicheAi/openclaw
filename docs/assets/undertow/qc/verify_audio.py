#!/usr/bin/env python3
"""
Audio verifier for UNDERTOW video assets.

This exists to correct a bad rule. The teaser originally shipped silent because
"generated audio cannot be verified by looking at it." That was wrong — it
confused *my eyes* with *verification*. Sound has objective properties, and a
spectrogram is something you can literally look at.

What this checks:

1. LOUDNESS AND TRUE PEAK (objective)
   EBU R128 integrated loudness and true peak. A bed that clips, or that is
   mixed so hot it leaves no room for score and dialogue, fails here.

2. SPEECH DETECTION (objective heuristic)
   Voiced speech puts sustained harmonic energy in the 300-3400 Hz band with a
   characteristic ratio against the sub band. An ambient underwater bed is
   bottom-heavy with broadband transients and no sustained mid harmonics. A
   high, sustained mid/low ratio means something is talking in there.

3. SPECTROGRAM (visual, for a human or an agent to actually read)
   Rendered to PNG. Speech reads as stacked horizontal bands; drones read as
   flat bottom energy; water reads as vertical transient spikes.

4. PICTURE INTEGRITY when muxing sound onto a verified cut
   --compare-video <original> extracts both raw h264 bitstreams and hashes
   them. They must be identical: adding sound must never alter a frame.
   This is not theoretical — `-shortest` silently dropped 4 frames the first
   time the teaser was scored, and only this check caught it.

    python3 verify_audio.py <media> [--compare-video <original.mp4>]
"""
import json
import os
import re
import subprocess
import sys
import tempfile

MID_LO, MID_HI = 300, 3400          # speech band
SPEECH_RATIO_LIMIT = 0.55           # mid energy / total; above this, suspect voice
TRUE_PEAK_CEILING = -1.0            # dBFS


def ff():
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(args):
    return subprocess.run(args, capture_output=True, text=True).stderr


def loudness(path, f):
    # -map 0:a is not optional. Without it ffmpeg analyses the first stream,
    # which on an mp4 is video, and ebur128 reports its -70 LUFS floor —
    # a number that looks like a measurement and is not one.
    out = run([f, "-hide_banner", "-i", path, "-map", "0:a",
               "-af", "ebur128=peak=true", "-f", "null", "-"])
    # ebur128 prints a per-frame progress line for every frame, each containing
    # "I: ... LUFS". The first is the -70 floor before the measurement converges.
    # Only the trailing summary block is the real reading, so parse from there.
    summary = out[out.rfind("Integrated loudness:"):] if "Integrated loudness:" in out else out
    grab = lambda pat: (re.search(pat, summary) or [None, None])[1]
    return {
        "integrated_lufs": grab(r"I:\s*(-?[\d.]+)\s*LUFS"),
        "true_peak_dbfs": grab(r"Peak:\s*(-?[\d.]+)\s*dBFS"),
        "lra_lu": grab(r"LRA:\s*(-?[\d.]+)\s*LU"),
    }


def band_energy(path, f, lo, hi):
    """Mean volume after isolating a band — a cheap proxy for energy in it."""
    out = run([f, "-hide_banner", "-i", path, "-map", "0:a",
               "-af", f"highpass=f={lo},lowpass=f={hi},volumedetect", "-f", "null", "-"])
    m = re.search(r"mean_volume:\s*(-?[\d.]+)", out)
    return float(m.group(1)) if m else None


def verify(path, compare_video=None):
    f = ff()
    ok = True
    print(f"\n  AUDIO VERIFICATION — {os.path.basename(path)}\n")

    L = loudness(path, f)
    print(f"  integrated   {L['integrated_lufs']} LUFS")
    print(f"  true peak    {L['true_peak_dbfs']} dBFS")
    print(f"  range        {L['lra_lu']} LU")
    if L["true_peak_dbfs"] and float(L["true_peak_dbfs"]) > TRUE_PEAK_CEILING:
        print(f"  FAIL  true peak above {TRUE_PEAK_CEILING} dBFS — clipping risk")
        ok = False

    full = band_energy(path, f, 20, 20000)
    mid = band_energy(path, f, MID_LO, MID_HI)
    if full is not None and mid is not None:
        # convert dB back to linear-ish ratio for a readable number
        ratio = 10 ** ((mid - full) / 20)
        print(f"\n  speech band ({MID_LO}-{MID_HI} Hz) vs full: {ratio:.2f}")
        if ratio > SPEECH_RATIO_LIMIT:
            print(f"  WARN  mid-band energy high — inspect the spectrogram for voice")
        else:
            print(f"  ok    bottom-heavy, consistent with ambience not speech")

    # Write QC artifacts into qc/, never into the asset directory — anything
    # dropped beside the assets is unregistered media and fails the asset gate.
    spec = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        os.path.splitext(os.path.basename(path))[0] + "-spectrogram.png")
    subprocess.run([f, "-y", "-hide_banner", "-loglevel", "error", "-i", path,
                    "-lavfi", "showspectrumpic=s=1400x600:mode=combined:legend=1:"
                              "scale=log:color=intensity", spec], check=True)
    print(f"\n  spectrogram  {spec}")
    print("               READ IT. Stacked horizontal bands = speech.")

    if compare_video:
        with tempfile.TemporaryDirectory() as td:
            hashes = []
            for src in (compare_video, path):
                raw = os.path.join(td, os.path.basename(src) + ".h264")
                subprocess.run([f, "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                                "-map", "0:v", "-c", "copy",
                                "-bsf:v", "h264_mp4toannexb", "-f", "h264", raw], check=True)
                import hashlib
                h = hashlib.sha256()
                with open(raw, "rb") as fh:
                    for c in iter(lambda: fh.read(1 << 20), b""):
                        h.update(c)
                hashes.append(h.hexdigest())
        same = hashes[0] == hashes[1]
        print(f"\n  picture integrity  {'IDENTICAL' if same else 'ALTERED'}")
        if not same:
            print("  FAIL  muxing changed the picture. Check for -shortest trimming frames.")
            ok = False

    print(f"\n  {'✓ AUDIO VERIFICATION PASSED' if ok else '✗ AUDIO VERIFICATION FAILED'}\n")
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmp_v = None
    if "--compare-video" in sys.argv:
        cmp_v = sys.argv[sys.argv.index("--compare-video") + 1]
    sys.exit(verify(sys.argv[1], cmp_v))
