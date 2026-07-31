"""
UNDERTOW teaser title card.

Drawn, not generated. The one frame carrying the show's name should not be
subject to a model's opinion about typography — generated text is the single
most unreliable thing an image model produces, and a misspelt logo is not a
defect you want to discover after a pitch.

Renders a 16:9 card matching the teaser's palette, plus a held-frame video
segment so it can be concatenated straight into the cut.

    python3 build-titlecard.py
"""
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ART = os.path.dirname(os.path.abspath(__file__))
F = "/mnt/skills/examples/canvas-design/canvas-fonts"
JP = "/etc/alternatives/fonts-japanese-gothic.ttf"
W, H = 1920, 1080
# The card holds for as long as the theme needs to resolve on it, not for a
# round number. The answering phrase lands its first note as the card appears
# and finishes inside this hold; shortening it truncates the resolution.
HOLD_SECONDS = 8


def font(name, size):
    return ImageFont.truetype(os.path.join(F, name), size)


# Deep-water vertical gradient: the teaser's own palette, surface to abyss.
img = Image.new("RGB", (W, H), (4, 6, 12))
d = ImageDraw.Draw(img)
top, bot = (14, 34, 52), (3, 4, 9)
for y in range(H):
    t = (y / H) ** 0.8
    d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))

# A single shaft of surface light from above, soft — the show's whole image in one gesture.
shaft = Image.new("L", (W, H), 0)
sd = ImageDraw.Draw(shaft)
sd.polygon([(W * 0.42, -50), (W * 0.58, -50), (W * 0.72, H), (W * 0.28, H)], fill=48)
shaft = shaft.filter(ImageFilter.GaussianBlur(90))
img = Image.composite(Image.new("RGB", (W, H), (34, 78, 104)), img, shaft)
d = ImageDraw.Draw(img)

f_title = font("BigShoulders-Bold.ttf", 232)
f_kanji = ImageFont.truetype(JP, 60)
f_tag = font("InstrumentSans-Regular.ttf", 30)

title = "UNDERTOW"
tb = d.textbbox((0, 0), title, font=f_title)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
tx, ty = (W - tw) // 2 - tb[0], int(H * 0.40) - tb[1]

# Cyan bloom behind the wordmark, as if lit from under water.
glow = Image.new("L", (W, H), 0)
ImageDraw.Draw(glow).text((tx, ty), title, font=f_title, fill=120)
glow = glow.filter(ImageFilter.GaussianBlur(26))
img = Image.composite(Image.new("RGB", (W, H), (48, 176, 190)), img, glow)
d = ImageDraw.Draw(img)

d.text((tx, ty), title, font=f_title, fill=(233, 243, 248))

kanji = "逆流"
kb = d.textbbox((0, 0), kanji, font=f_kanji)
d.text(((W - (kb[2] - kb[0])) // 2 - kb[0], ty + th + 78), kanji, font=f_kanji, fill=(96, 132, 156))

rule_y = ty + th + 186
d.line([(W * 0.36, rule_y), (W * 0.64, rule_y)], fill=(52, 74, 96), width=2)

tag = "DEEP CALLS TO DEEP"
gb = d.textbbox((0, 0), tag, font=f_tag)
d.text(((W - (gb[2] - gb[0])) // 2 - gb[0], rule_y + 34), tag, font=f_tag, fill=(129, 154, 176))

out_png = os.path.join(ART, "teaser-titlecard.png")
img.save(out_png)

# Hold it as a video segment so it concatenates into the cut without a re-encode mismatch.
try:
    from shutil import which
    ff = which("ffmpeg")
    if not ff:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    out_mp4 = os.path.join(ART, "teaser-titlecard.mp4")
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error",
                    "-loop", "1", "-i", out_png, "-t", str(HOLD_SECONDS),
                    "-r", "24", "-vf", f"fade=t=in:st=0:d=0.8,"
                    f"fade=t=out:st={HOLD_SECONDS - 0.8}:d=0.8,format=yuv420p",
                    "-c:v", "libx264", "-crf", "16", out_mp4], check=True)
    print("saved", out_png, "and", out_mp4)
except Exception as e:  # png is the deliverable; the mp4 is a convenience
    print("saved", out_png, f"(video step skipped: {e})")
