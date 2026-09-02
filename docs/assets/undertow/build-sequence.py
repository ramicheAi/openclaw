#!/usr/bin/env python3
"""
UNDERTOW — cut picture to a scene's cue sheet.

This is the pre-scoring doctrine finally closing its loop. The sound department
was built on one claim — author the audio first as data, then render the picture
from it — and until now the claim had never been executed end to end: the 72
second sinking mix existed, and no picture had ever been cut to it.

Nothing here decides anything. The cue sheet decides:

  * WHICH shots exist, and what is in them          scene-<id>.json "shots"
  * WHEN each one starts and ends                   shots[].t_in / t_out
  * WHAT the audio under them is                    scenes/<id>.wav

so a cut is not an edit performed against a mix, it is the same document read
twice. Move a beat in the cue sheet and both the mix and the cut follow it.

WHY THE CLIPS ARE RETIMED RATHER THAN TRIMMED. Every generated clip is five
seconds; the windows the cue sheet asks for run from 1.5s to 10s. Trimming a 5s
clip to 1.5s throws away the part of the shot that pays off, and looping it to
10s reads as a loop. Each clip is instead speed-matched to its window, which is
ordinary practice — a held wide slowed to a crawl is the correct treatment for
the 34 BPM section, and the 1.5s flash-frames genuinely should be fast.

    python3 build-sequence.py [scene-id]
"""
import json
import os
import subprocess
import sys

ART = os.path.dirname(os.path.abspath(__file__))
CUES = os.path.join(ART, "audio")
SEQ = os.path.join(ART, "sequence")
SCENES = os.path.join(ART, "scenes")

# The deck shots come back brighter and warmer than the underwater ones, because
# a generator given "indoor pool, afternoon" has no idea the scene is a descent.
# Grading them toward the show's palette is normal timing work, and it is done
# here rather than in the prompt because it is a decision about the SEQUENCE.
GRADE = {
    "air":      "eq=contrast=1.06:brightness=-0.03:saturation=0.92,"
                "colorbalance=rs=-0.04:gs=-0.01:bs=0.06",
    "sunlit":   "eq=contrast=1.05:brightness=-0.02:saturation=0.95,"
                "colorbalance=rs=-0.03:bs=0.05",
    "twilight": "eq=contrast=1.04:saturation=0.98,colorbalance=rs=-0.02:bs=0.04",
    "midnight": "eq=contrast=1.03:saturation=1.0,colorbalance=bs=0.03",
    "abyssal":  "eq=contrast=1.02:saturation=1.0",
}


def ffmpeg():
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe_duration(ff, path):
    out = subprocess.run([ff, "-hide_banner", "-i", path],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise RuntimeError(f"no duration for {path}")


def main():
    scene_id = sys.argv[1] if len(sys.argv) > 1 else "ep1-the-sinking"
    sc = json.load(open(os.path.join(CUES, f"scene-{scene_id}.json")))
    shots = sc["shots"]
    src = os.path.join(SEQ, scene_id)
    audio = os.path.join(SCENES, f"{scene_id}.wav")
    if not os.path.exists(audio):
        raise SystemExit(f"\n  no mix at {audio} — run build-scene.py first\n")

    ff = ffmpeg()
    fps = int(sc.get("fps", 24))
    work = os.path.join(src, "_work")
    os.makedirs(work, exist_ok=True)

    print(f"\n  CUTTING {scene_id}  —  {len(shots)} shots to "
          f"{sc['duration']:.0f}s of picture-locked audio\n")
    print(f"  {'shot':5s} {'window':>13s} {'want':>6s} {'clip':>6s} {'speed':>7s}  rank")

    parts = []
    for s in shots:
        media = s.get("media", {})
        clip = os.path.join(src, media.get("source", f"clip-{s['id']}.mp4"))
        if not os.path.exists(clip):
            raise SystemExit(f"  missing {clip}")
        want = float(s["t_out"]) - float(s["t_in"])
        excerpt = media.get("excerpt")
        retime = media.get("retime", True)
        out = os.path.join(work, f"seg-{s['id']}.mp4")

        pre = []
        if excerpt:
            # -ss AFTER -i: frame-accurate. Input-seek is keyframe-approximate
            # and on concatenated material lands in the neighbouring shot.
            pre = ["-ss", f"{excerpt[0]:.3f}", "-to", f"{excerpt[1]:.3f}"]
            have = excerpt[1] - excerpt[0]
        else:
            have = probe_duration(ff, clip)
        if retime:
            ratio = want / have
        else:
            ratio = 1.0
            if abs(have - want) > 0.05:
                raise SystemExit(f"  shot {s['id']}: retime=false but excerpt "
                                 f"{have:.2f}s != window {want:.2f}s")

        vf = f"setpts={ratio:.6f}*PTS"
        cp = media.get("crop_pct")
        if cp:
            # centered crop-zoom; used to remove generated edge artifacts
            vf += f",crop=iw*{cp}:ih*{cp}:(iw-iw*{cp})/2:(ih-ih*{cp})/2"
        # every segment conforms to one raster whatever its source resolution
        vf += ",scale=1920:1080:flags=lanczos,setsar=1"
        g = GRADE.get(s["rank"], "")
        if g:
            vf += f",{g}"
        vf += f",fps={fps}"

        subprocess.run(
            [ff, "-nostdin", "-y", "-loglevel", "error", "-i", clip, *pre,
             "-filter:v", vf, "-an", "-t", f"{want:.3f}",
             "-c:v", "libx264", "-preset", "medium", "-crf", "17",
             "-pix_fmt", "yuv420p", out], check=True)
        parts.append(out)
        mode = "native" if not retime else f"{ratio:5.2f}x"
        print(f"  {s['id']:5s} {s['t_in']:5.1f}-{s['t_out']:<6.1f} {want:5.1f}s "
              f"{have:5.1f}s {mode:>7s}  {s['rank']:9s} {s['slug']}")

    listing = os.path.join(work, "concat.txt")
    with open(listing, "w") as f:
        for p in parts:
            f.write(f"file '{p}'\n")

    dest = os.path.join(ART, f"sequence-{scene_id}.mp4")

    # ── the scripted on-screen heart numbers ────────────────────────────────
    # Canon puts these numerals on screen; the script's own text. Rendered as
    # PIL PNGs composited with overlay, because the bundled ffmpeg carries no
    # drawtext (no freetype). Restrained diegetic UI, low-left.
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype(
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 46)
    ov_inputs, chains = [], []
    overlays = sc.get("overlays", [])
    for i, ov in enumerate(overlays):
        img = Image.new("RGBA", (420, 80), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.text((6, 10), ov["text"], font=font, fill=(216, 238, 246, 200),
               stroke_width=2, stroke_fill=(10, 20, 24, 160))
        png = os.path.join(work, f"ov{i}.png")
        img.save(png)
        ov_inputs += ["-i", png]
        a, b = ov["t"]
        src_l = "[0:v]" if i == 0 else f"[v{i-1}]"
        chains.append(f"{src_l}[{i+2}:v]overlay=main_w*0.075:main_h*0.80"
                      f":enable='between(t,{a},{b})'[v{i}]")
    # No overlays means no filter graph at all — an empty filter_complex is a
    # hard ffmpeg error, not a no-op.
    if overlays:
        fx = ["-filter_complex", ";".join(chains),
              "-map", f"[v{len(overlays)-1}]", "-map", "1:a"]
    else:
        fx = ["-map", "0:v", "-map", "1:a"]

    print("\n  conforming, numerals, marrying to the mix…")
    subprocess.run(
        [ff, "-nostdin", "-y", "-loglevel", "error",
         "-f", "concat", "-safe", "0", "-i", listing,
         "-i", audio, *ov_inputs, *fx,
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
         "-shortest", "-movflags", "+faststart", dest], check=True)

    print(f"\n  {os.path.basename(dest)}   {probe_duration(ff, dest):.1f}s\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
