"""
UNDERTOW — the Fathom ladder, demonstrated.

A 32-second continuous descent through all five ranks. Drawn deterministically
and scored with the five Fathom stingers, so the piece does the one thing a
rules page cannot: it lets you HEAR the ladder while you watch it.

Why this exists. The Bible asks the audience to chart Fathom the way Solo
Leveling's audience charts ranks, and a pitch document can only assert that a
system is intuitive. This asserts nothing. It descends, and by the third card
a viewer is predicting the next sound before it arrives — which is the actual
claim, demonstrated rather than described.

Everything is drawn, not generated: the one asset explaining the show's rules
should not be subject to a model's opinion about text.

Palette follows the Bible's spine exactly, in canon order — sun-bleached
chlorine cyan, green-gold open water, violet twilight, bioluminescent
midnight, and Hadal, "where the only colors are what characters bring with
them", which is why the last tier is black except one carried light.

    python3 build-fathom-ladder.py
"""
import importlib.util
import math
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ART = os.path.dirname(os.path.abspath(__file__))
F = "/mnt/skills/examples/canvas-design/canvas-fonts"

_spec = importlib.util.spec_from_file_location("undertow_score",
                                               os.path.join(ART, "build-score.py"))
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)

W, H, FPS = 1920, 1080, 24
TIER_SECONDS = 6.0
# Hadal is allowed to hang, but only just. At 8s it held for 14 seconds of a
# 38 second piece - more than a third of the runtime on one rank, with a frozen
# depth readout. Long enough for the 7s stinger to ring out and no longer.
TAIL = 3.5
OUT = os.path.join(ART, "fathom-ladder.mp4")

# (rank, depth label, metres lo, metres hi, meaning, top colour, bottom colour)
TIERS = [
    ("SUNLIT",   "0–20 m",        0,    20,
     "Awakened novice. Most club swimmers cap here.",   (126, 212, 220), (74, 166, 186)),
    ("TWILIGHT", "20–200 m",     20,   200,
     "Meridian licensing threshold. Fathom Games entrants.", (74, 166, 186), (46, 110, 94)),
    ("MIDNIGHT", "200–1,000 m", 200,  1000,
     "House champions. Perhaps forty people alive.",    (46, 110, 94), (58, 42, 94)),
    ("ABYSSAL",  "1,000–6,000 m", 1000, 6000,
     "The ten House Heads. Living legends.",            (58, 42, 94), (10, 26, 56)),
    ("HADAL",    "6,000 m+",    6000, 11000,
     "Wardens only. To go Hadal is to risk becoming Drowned.", (10, 26, 56), (2, 3, 6)),
]


def _scrim():
    """Edge-weighted darkening mask, used to keep type legible on bright water.

    Deliberately a GRADIENT and not a shape. The first attempt blurred a few
    rectangles behind the text; a Gaussian on a hard rectangle still has ends,
    and at 70px they read as grey lozenges floating in the frame. A ramp from
    each edge has no boundary to notice, and doubles as an ordinary vignette.
    """
    x = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    left = np.clip((0.44 - x) / 0.44, 0, 1) ** 1.35
    right = np.clip((x - 0.66) / 0.34, 0, 1) ** 1.35
    bottom = np.clip((y - 0.76) / 0.24, 0, 1) ** 1.5
    m = np.maximum(np.maximum(left, right), bottom)
    return np.repeat(m[:, :, None], 3, axis=2)


SCRIM = _scrim()


def font(name, size):
    return ImageFont.truetype(os.path.join(F, name), size)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def water_colour(t_total, total):
    """Continuous colour down the whole descent, not five flat blocks.

    The Bible's promise is that a viewer can pause ANY frame and know the
    depth from colour alone. That only holds if the gradient is continuous —
    five flat cards would let you name the tier but not the position in it.
    """
    p = min(0.9999, t_total / total) * len(TIERS)
    i = int(p)
    return lerp(TIERS[i][5], TIERS[i][6], p - i)


def depth_at(t_total, total):
    """Metres, interpolated logarithmically inside the current tier.

    Linear interpolation would spend the same screen time crossing 0-20m as
    1,000-6,000m and make the counter feel broken. Depth is perceived
    logarithmically and the ranks are spaced that way, so the readout is too.
    """
    p = min(0.9999, t_total / total) * len(TIERS)
    i = int(p)
    lo, hi = TIERS[i][2], TIERS[i][3]
    lo = max(lo, 1.0)
    return lo * (hi / lo) ** (p - i)


class Snow:
    """Marine snow. It drifts UP because the camera is going down.

    Deterministic seed: this file must render identically on every machine,
    or the checksum in the asset manifest is meaningless.
    """

    def __init__(self, n=260):
        rng = np.random.default_rng(4)
        self.x = rng.random(n) * W
        self.y = rng.random(n) * H
        self.r = rng.random(n) * 2.2 + 0.5
        self.v = rng.random(n) * 46 + 14
        self.a = rng.random(n) * 0.5 + 0.18

    def step(self, dt):
        self.y -= self.v * dt
        wrapped = self.y < -4
        self.y[wrapped] = H + 4
        self.x[wrapped] = np.random.default_rng(int(self.y.sum())).random(wrapped.sum()) * W


def render(path_mp4, audio_path=None):
    total = TIER_SECONDS * len(TIERS)
    duration = total + TAIL
    n_frames = int(duration * FPS)

    f_rank = font("BigShoulders-Bold.ttf", 128)
    f_depth = font("GeistMono-Regular.ttf", 34)
    f_mean = font("InstrumentSans-Regular.ttf", 27)
    f_read = font("GeistMono-Regular.ttf", 62)
    f_small = font("GeistMono-Regular.ttf", 20)
    f_title = font("InstrumentSans-Regular.ttf", 24)

    snow = Snow()
    ff = S.ffmpeg_exe()
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if audio_path:
        cmd += ["-i", audio_path]
    cmd += ["-map", "0:v"]
    if audio_path:
        cmd += ["-map", "1:a", "-c:a", "aac", "-b:a", "192k"]
    # explicit -t, never -shortest: the audio must never be allowed to decide
    # the picture length (it silently trimmed 4 frames off the teaser once)
    cmd += ["-t", f"{duration:.3f}", "-c:v", "libx264", "-crf", "16",
            "-preset", "slow", "-pix_fmt", "yuv420p", path_mp4]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    for k in range(n_frames):
        t = k / FPS
        tc = min(t, total - 1e-4)
        img = Image.new("RGB", (W, H), water_colour(tc, total))
        d = ImageDraw.Draw(img)

        # a shaft of surface light, dying with depth — the reason the frame
        # gets darker is that the surface is getting further away
        surf = max(0.0, 1.0 - (t / (TIER_SECONDS * 2.6)))
        if surf > 0.01:
            sh = Image.new("L", (W, H), 0)
            ImageDraw.Draw(sh).polygon(
                [(W * 0.40, -60), (W * 0.60, -60), (W * 0.78, H), (W * 0.22, H)],
                fill=int(70 * surf))
            sh = sh.filter(ImageFilter.GaussianBlur(110))
            img = Image.composite(Image.new("RGB", (W, H), (210, 245, 250)), img, sh)
            d = ImageDraw.Draw(img)

        snow.step(1.0 / FPS)
        # Marine snow is lit debris, so it must always be BRIGHTER than the
        # water it hangs in. Drawing it at a fixed brightness worked in the
        # deep and turned the sunlit tiers into what looked like dust on the
        # lens, because the particles were darker than the surrounding cyan.
        # Derived from the current water colour instead, so it reads at every
        # depth.
        wc = water_colour(tc, total)
        for x, y, r, a in zip(snow.x, snow.y, snow.r, snow.a):
            c = lerp(wc, (255, 255, 255), 0.45 + 0.45 * a)
            d.ellipse([x - r, y - r, x + r, y + r], fill=c)

        # Legibility scrim. All the type is in one light family and must stay
        # that way — flipping the ink to dark halfway down would read as two
        # different graphics packages. Instead a soft dark wash sits under the
        # text, weighted by how bright the water currently is: strong at
        # Sunlit, gone by Abyssal. Constant look, guaranteed contrast.
        bright = (0.2126 * wc[0] + 0.7152 * wc[1] + 0.0722 * wc[2]) / 255.0
        if bright > 0.06:
            a = min(0.40, bright * 0.46)
            arr = np.asarray(img, dtype=np.float32)
            arr = arr * (1.0 - SCRIM * a) + np.float32((2, 10, 18)) * (SCRIM * a)
            img = Image.fromarray(arr.astype(np.uint8))
            d = ImageDraw.Draw(img)

        i = min(len(TIERS) - 1, int(t / TIER_SECONDS))
        rank, dlabel, _, _, meaning, _, _ = TIERS[i]
        local = t - i * TIER_SECONDS

        # Hadal: the only light is the one you brought
        if i == len(TIERS) - 1:
            glow = Image.new("L", (W, H), 0)
            gr = 260 + 26 * math.sin(t * 1.7)
            ImageDraw.Draw(glow).ellipse([W * 0.5 - gr, H * 0.5 - gr, W * 0.5 + gr, H * 0.5 + gr],
                                         fill=54)
            glow = glow.filter(ImageFilter.GaussianBlur(150))
            img = Image.composite(Image.new("RGB", (W, H), (120, 170, 190)), img, glow)
            d = ImageDraw.Draw(img)

        # rank card, fading in as the tier begins
        fade = min(1.0, local / 0.55) * (1.0 if local < TIER_SECONDS - 0.5 or i == len(TIERS) - 1
                                         else max(0.0, (TIER_SECONDS - local) / 0.5))
        if fade > 0.01:
            ink = int(240 * fade)
            x0, y0 = 150, int(H * 0.36)
            d.line([(x0, y0 - 26), (x0, y0 + 210)], fill=(ink, ink, ink), width=3)
            d.text((x0 + 34, y0 - 44), rank, font=f_rank, fill=(ink, ink, ink))
            d.text((x0 + 38, y0 + 108), dlabel, font=f_depth,
                   fill=(int(150 * fade), int(200 * fade), int(215 * fade)))
            d.text((x0 + 38, y0 + 158), meaning, font=f_mean,
                   fill=(int(190 * fade), int(210 * fade), int(220 * fade)))

        # live depth readout and a ruler that fills as you go
        # Right-aligned against the ruler. Left-aligning at a fixed x let the
        # readout grow into the ruler as the number gained digits, and "8,124 m"
        # ran straight through it.
        m = depth_at(tc, total)
        txt = f"{m:,.0f} m" if m >= 100 else f"{m:.1f} m"
        rx, ry0, ry1 = W - 150, int(H * 0.20), int(H * 0.80)
        edge = rx - 58
        tw = d.textbbox((0, 0), txt, font=f_read)
        d.text((edge - (tw[2] - tw[0]), int(H * 0.36) - 44), txt, font=f_read, fill=(226, 240, 246))
        lw = d.textbbox((0, 0), "FATHOM", font=f_small)
        d.text((edge - (lw[2] - lw[0]), int(H * 0.36) + 32), "FATHOM",
               font=f_small, fill=(150, 185, 202))
        d.line([(rx, ry0), (rx, ry1)], fill=(90, 120, 140), width=2)
        for j in range(len(TIERS) + 1):
            yy = ry0 + (ry1 - ry0) * j / len(TIERS)
            d.line([(rx - 12, yy), (rx + 12, yy)], fill=(120, 155, 175), width=2)
        yhead = ry0 + (ry1 - ry0) * min(1.0, t / total)
        d.line([(rx, ry0), (rx, yhead)], fill=(232, 244, 250), width=4)
        d.ellipse([rx - 8, yhead - 8, rx + 8, yhead + 8], fill=(240, 250, 255))

        d.text((150, H - 96), "UNDERTOW  ·  THE FATHOM LADDER", font=f_title,
               fill=(222, 236, 244))

        # global fade at head and tail so the piece can be dropped anywhere
        if t < 0.7 or t > duration - 1.2:
            g = min(t / 0.7, (duration - t) / 1.2, 1.0)
            img = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), img, max(0.0, g))

        proc.stdin.write(img.tobytes())

    proc.stdin.close()
    proc.wait()


def build_audio(path_wav):
    """The five stingers, one per tier, over the theme's own pad."""
    total = TIER_SECONDS * len(TIERS) + TAIL
    n = int(total * S.SR)
    mix = np.zeros(n)

    # a Dm bed so the piece is never dry, dropping away as the light does
    bed = S.pad([S.hz(x) for x in S.CHORDS["Dm"]], total, 0.20)[:n]
    mix += S.reverb(bed, 4.4, 0.30) * np.linspace(1.0, 0.45, n)

    import wave as _w
    for i, (rank, *_rest) in enumerate(TIERS):
        p = os.path.join(ART, "signatures", f"fathom-{rank.lower()}.wav")
        w = _w.open(p)
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64)
        x = x.reshape(-1, w.getnchannels()).mean(1) / 32768.0
        mix = S.place(mix, x * 0.95, i * TIER_SECONDS)

    mix = mix[:n]
    n_out = int(1.6 * S.SR)
    mix[-n_out:] *= np.linspace(1, 0, n_out)
    S.write_wav(path_wav, mix, peak=0.86)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "ladder.wav")
        build_audio(wav)
        render(OUT, wav)
    print(f"  saved {OUT}")
