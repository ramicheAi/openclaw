#!/usr/bin/env python3
"""
Frame sampler for UNDERTOW video assets.

A still can be checked by opening it. A clip cannot — identity can hold at frame
0 and drift by the end, which is exactly what was unverifiable about the first
teaser. This pulls evenly spaced frames into one contact sheet so a video gets
the same visual sign-off as a plate: open it, check every frame against canon,
discard the clip if any frame is off-model.

    python3 sample_frames.py <video> [n_frames] [out.png]

Labels each frame with its timestamp so a defect can be reported precisely
("drifts at 5.2s") rather than vaguely.
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = "/mnt/skills/examples/canvas-design/canvas-fonts"


def ffmpeg_bin():
    """Prefer a system ffmpeg; fall back to the imageio-ffmpeg wheel."""
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def duration(path, ff):
    out = subprocess.run([ff, "-hide_banner", "-i", path],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise SystemExit(f"could not read duration of {path}")


def sample(path, n=8, out=None):
    ff = ffmpeg_bin()
    dur = duration(path, ff)
    # Pull from inside the clip: the very last frame is often a fade or a
    # compression-mangled tail and is not representative.
    times = [dur * (i + 0.5) / n for i in range(n)]

    frames = []
    with tempfile.TemporaryDirectory() as td:
        for i, t in enumerate(times):
            fp = os.path.join(td, f"f{i:02d}.png")
            subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error",
                            "-ss", f"{t:.3f}", "-i", path,
                            "-frames:v", "1", fp], check=True)
            frames.append((t, Image.open(fp).convert("RGB")))

    TH = 460
    tiles = [(t, im.resize((max(1, round(im.width * TH / im.height)), TH), Image.LANCZOS))
             for t, im in frames]
    pad, bar = 14, 30
    W = sum(im.width + pad for _, im in tiles) + pad
    H = TH + bar + pad * 2
    sheet = Image.new("RGB", (W, H), (10, 14, 22))
    d = ImageDraw.Draw(sheet)
    try:
        f = ImageFont.truetype(os.path.join(FONT_DIR, "GeistMono-Regular.ttf"), 19)
    except OSError:
        f = ImageFont.load_default()

    x = pad
    for t, im in tiles:
        sheet.paste(im, (x, pad))
        d.text((x, pad + TH + 7), f"{t:5.2f}s", font=f, fill=(120, 150, 180))
        x += im.width + pad

    out = out or os.path.splitext(path)[0] + "-frames.png"
    sheet.save(out)
    print(f"{os.path.basename(path)}  {dur:.2f}s  ->  {out}  ({n} frames, {sheet.size[0]}x{sheet.size[1]})")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    sample(sys.argv[1],
           int(sys.argv[2]) if len(sys.argv) > 2 else 8,
           sys.argv[3] if len(sys.argv) > 3 else None)
