"""
UNDERTOW multi-shot teaser assembly.

Concatenates the verified element-locked shots into one cut, lays the Splice
sound bed underneath, and ends on the drawn title card.

Every shot in SHOTS has already been frame-sampled and checked against canon
before reaching this script — this file does no quality judgement of its own,
it only assembles what passed. Run qc/sample_frames.py on any new shot and
look at it before adding it here.

Rules baked in, both learned the hard way:
  * No -shortest. It silently trimmed 4 frames off the picture the first time
    sound was added to a cut. Audio is padded and trimmed to the video instead.
  * All shots must share one resolution and frame rate, or the concat filter
    produces a broken stream. The script asserts this rather than trusting it.

    python3 build-teaser.py
"""
import os
import subprocess
import sys

ART = os.path.dirname(os.path.abspath(__file__))
SCRATCH = os.environ.get("UNDERTOW_SHOTS", "")

# (file, label) in cut order. Story logic: the boy, the rival, the joy,
# the mystery, the threat, the name.
SHOTS = [
    ("shot-kai-sinking.mp4",  "Kai — the boy who sank"),
    ("shot-ren-lane.mp4",     "Ren — precision as menace"),
    ("shot-kemar-joy.mp4",    "Kemar — joy as a weapon"),
    ("shot-luna-descent.mp4", "Luna — the diver"),
    ("shot-nakaru-wall.mp4",  "Nakaru — the Second Tide"),
    ("teaser-titlecard.mp4",  "title"),
]
BED = "teaser-bed.wav"          # in qc/, the verified Splice field-recording mix
SCORE = "teaser-score.wav"      # in qc/, our own cue from build-score.py
BED_LEVEL = 0.30                # the bed is texture under the score, not a duet
OUT = "teaser-undertow.mp4"
W, H, FPS = 1920, 1080, 24
XFADE = 0.5                     # seconds of dissolve between shots


def ff():
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe(path, f):
    out = subprocess.run([f, "-hide_banner", "-i", path],
                         capture_output=True, text=True).stderr
    import re
    m = re.search(r"(\d{3,4})x(\d{3,4})", out)
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else 0
    return (int(m.group(1)), int(m.group(2)) if m else 0), dur


def main(silent_to=None):
    """silent_to: build the identical picture with no audio, to the given path.

    This exists for verification, not delivery. qc/verify_audio.py hashes the
    h264 bitstream of the silent build against the muxed one; if they differ,
    the audio stage changed the picture — which is exactly the bug that once
    cost this cut four frames.
    """
    f = ff()
    paths = []
    for fn, label in SHOTS:
        p = os.path.join(ART, fn)
        if not os.path.exists(p) and SCRATCH:
            p = os.path.join(SCRATCH, fn)
        if not os.path.exists(p):
            raise SystemExit(f"missing shot: {fn}")
        (w, h), dur = probe(p, f)
        if (w, h) != (W, H):
            raise SystemExit(f"{fn} is {w}x{h}, expected {W}x{H} — "
                             "mixed resolutions break the concat filter")
        print(f"  {label:34s} {dur:5.2f}s  {w}x{h}")
        paths.append((p, dur))

    total = sum(d for _, d in paths) - XFADE * (len(paths) - 1)
    print(f"\n  total after {XFADE}s dissolves: {total:.2f}s")

    # Normalise every shot to the same timebase, then dissolve between them.
    inputs, filt, prev, offset = [], [], None, 0.0
    for i, (p, dur) in enumerate(paths):
        inputs += ["-i", p]
        filt.append(f"[{i}:v]fps={FPS},scale={W}:{H},setsar=1,format=yuv420p[v{i}]")
    prev = "[v0]"
    offset = paths[0][1] - XFADE
    for i in range(1, len(paths)):
        out = f"[x{i}]"
        filt.append(f"{prev}[v{i}]xfade=transition=fade:duration={XFADE}:offset={offset:.3f}{out}")
        prev = out
        offset += paths[i][1] - XFADE

    def find(name):
        p = os.path.join(ART, "qc", name)
        if not os.path.exists(p) and SCRATCH:
            p = os.path.join(SCRATCH, name)
        return p if os.path.exists(p) else None

    bed, score = find(BED), find(SCORE)
    if silent_to:
        bed = score = None

    vf = ";".join(filt)
    out_path = silent_to or os.path.join(ART, OUT)
    if bed or score:
        # The bed is an 8s loop of hydrophone field recording; the score is cut
        # to the exact picture length by build-score.py. Loop the bed to cover,
        # mix the score on top of it, then hard-trim to the picture.
        # apad + explicit -t, never -shortest.
        extra, chains, mixin = [], [], []
        i = len(paths)
        if bed:
            extra += ["-stream_loop", "-1", "-i", bed]
            chains.append(f"[{i}:a]volume={BED_LEVEL},afade=t=in:st=0:d=1.5,"
                          f"afade=t=out:st={total-2.0:.2f}:d=2.0,apad[bed]")
            mixin.append("[bed]")
            i += 1
        if score:
            # The cue carries its own fades — it was written to the frame.
            extra += ["-i", score]
            chains.append(f"[{i}:a]apad[scr]")
            mixin.append("[scr]")
            i += 1
        if len(mixin) == 2:
            # normalize=0: amix otherwise divides by input count and quietly
            # drops the whole mix ~6dB, which reads as "the score is weak".
            chains.append("".join(mixin) + "amix=inputs=2:duration=longest:normalize=0[a]")
            amap = "[a]"
        else:
            amap = mixin[0]
        print(f"  audio: {'bed + score' if len(mixin) == 2 else os.path.basename(bed or score)}")
        cmd = ([f, "-y", "-hide_banner", "-loglevel", "error"] + inputs + extra +
               ["-filter_complex", vf + ";" + ";".join(chains),
                "-map", prev, "-map", amap,
                "-t", f"{total:.3f}",
                "-c:v", "libx264", "-crf", "17", "-preset", "slow",
                "-c:a", "aac", "-b:a", "192k", out_path])
    else:
        print("  (no sound found — building silent)")
        cmd = ([f, "-y", "-hide_banner", "-loglevel", "error"] + inputs +
               ["-filter_complex", vf, "-map", prev, "-t", f"{total:.3f}",
                "-c:v", "libx264", "-crf", "17", "-preset", "slow", out_path])

    subprocess.run(cmd, check=True)
    (w, h), dur = probe(out_path, f)
    print(f"\n  saved {out_path}  {w}x{h}  {dur:.2f}s")


if __name__ == "__main__":
    arg = sys.argv[sys.argv.index("--silent-to") + 1] if "--silent-to" in sys.argv else None
    main(silent_to=arg)
