#!/usr/bin/env python3
"""
UNDERTOW — text cards, rendered from the cue sheet.

A teaser's cards are cut like shots, so they are authored like shots: the text,
timing and treatment live in the scene's cue sheet ("cards"), and this renders
each one to a clip build-sequence.py can cut exactly like any other plate.

Design rules, deliberately few:
  * near-black, never pure black — the sequence's water is never pure black,
    and a #000 card next to it reads as a dropout, not a cut.
  * one face for Latin (DejaVu Sans Bold, letterspaced caps), one for kanji
    (IPA Gothic). No mono fonts — the numeral overlay experiment proved a mono
    face on picture reads as a watermark.
  * the title card alone gets the blue glow from below: the show's key image
    is the boy on the pool floor lit from beneath, and the title inherits it.

    python3 build-cards.py [scene-id]
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ART = os.path.dirname(os.path.abspath(__file__))
CUES = os.path.join(ART, "audio")
SEQ = os.path.join(ART, "sequence")

W, H = 1920, 1080
LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
KANJI = "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"
INK = (216, 238, 246)


def tracked(draw, cx, y, text, font, tracking, fill):
    """Centered letterspaced text. PIL has no tracking; compose it by hand."""
    widths = [draw.textlength(c, font=font) for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=font, fill=fill)
        x += w + tracking
    return total


def card_image(card):
    img = Image.new("RGB", (W, H))
    px = img.load()
    # vertical gradient, faintly lighter at the top: the surface is up there
    top, bot = (10, 14, 18), (5, 7, 10)
    for yy in range(H):
        t = yy / H
        row = tuple(int(a + (b - a) * t) for a, b in zip(top, bot))
        for xx in range(0, W, 8):
            for k in range(8):
                px[min(xx + k, W - 1), yy] = row
    if card.get("glow"):
        # the blue light from below — soft, low, centered on the title
        glow = Image.new("L", (W, H), 0)
        gd = ImageDraw.Draw(glow)
        gd.ellipse((W * 0.18, H * 0.55, W * 0.82, H * 1.45), fill=90)
        glow = glow.filter(ImageFilter.GaussianBlur(180))
        blue = Image.new("RGB", (W, H), (24, 72, 110))
        img = Image.composite(blue, img, glow)

    d = ImageDraw.Draw(img)
    lines = card.get("lines", [])
    kanji = card.get("kanji")
    if kanji:
        kf = ImageFont.truetype(KANJI, 130)
        lf = ImageFont.truetype(LATIN, 96)
        tracked(d, W / 2, H * 0.30, kanji, kf, 26, INK)
        tracked(d, W / 2, H * 0.52, lines[0], lf, 42, INK)
    else:
        lf = ImageFont.truetype(LATIN, 54)
        y = H * 0.5 - len(lines) * 45
        for ln in lines:
            tracked(d, W / 2, y, ln, lf, 16, INK)
            y += 90
    return img


def ffmpeg():
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def main():
    scene_id = sys.argv[1] if len(sys.argv) > 1 else "ep1-teaser"
    sc = json.load(open(os.path.join(CUES, f"scene-{scene_id}.json")))
    cards = sc.get("cards", [])
    if not cards:
        raise SystemExit(f"  scene {scene_id} declares no cards")
    out_dir = os.path.join(SEQ, scene_id)
    os.makedirs(out_dir, exist_ok=True)
    ff = ffmpeg()
    fps = int(sc.get("fps", 24))
    for card in cards:
        png = os.path.join(out_dir, f"{card['id']}.png")
        card_image(card).save(png)
        mp4 = os.path.join(out_dir, f"{card['id']}.mp4")
        subprocess.run(
            [ff, "-nostdin", "-y", "-loglevel", "error",
             "-loop", "1", "-i", png, "-t", f"{card['seconds']:.3f}",
             "-r", str(fps), "-c:v", "libx264", "-preset", "medium", "-crf", "17",
             "-pix_fmt", "yuv420p", mp4], check=True)
        print(f"  {card['id']:12s} {card['seconds']:.1f}s  "
              f"{'glow' if card.get('glow') else '    '}  {card.get('kanji', '')}"
              f" {' / '.join(card.get('lines', []))}")
    print(f"\n  {len(cards)} cards -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
