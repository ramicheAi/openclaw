"""
UNDERTOW cast lineup / height chart.

Rebuilt 2026-07-31 for canon 2.5. The previous version cropped portraits out of
the eight *founding* plates, which meant it inherited their canon violations —
Mirei bare-faced, Gouda grinning, Bo rendered in 3D. It also could not show
relative height, because those plates were scene art at unrelated scales.

This version composites the eight BASELINE reference plates instead. They are
full-body figures on flat grey, so the whole cast can stand on one ground line
at true relative height — the artifact an animation team actually works from.

Zero generation: every pixel is cut from an approved plate. Provenance is
`derived-from-approved-plates`.

Background removal is a border flood fill, NOT a brightness threshold. A
threshold punches holes in Bo's cream sweater and Luna's white robe, which sit
within ~20 levels of the grey backdrop. Flood fill only eats background that is
actually connected to the frame edge, so interior light areas survive.

    python3 docs/assets/undertow/build-lineup.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage
import numpy as np
import os

ART = os.path.dirname(os.path.abspath(__file__))
F = "/mnt/skills/examples/canvas-design/canvas-fonts"
JP = "/etc/alternatives/fonts-japanese-gothic.ttf"

# (file, NAME, age, role, height_cm, crop)
# height_cm is canon — see UNDERTOW-CHARACTER-CANON.json identity.height_cm.
# crop isolates the front view of Ren's three-view turnaround; None = whole frame.
CAST = [
    ("kai-neutral-ref.png",    "KAI ISOZAKI",  15, "The boy who sank",   168, None),
    ("bo-neutral-ref.png",     "BO FUJII",     16, "The heart",          183, None),
    ("mirei-neutral-ref.png",  "MIREI SANDA",  15, "The tactician",      155, None),
    ("luna-neutral-ref.png",   "LUNA AMANE",   16, "The diver",          158, None),
    ("ren-neutral-ref.png",    "REN KUROSE",   16, "The rival",          176, (270, 0, 626, 1200)),
    ("kemar-neutral-ref.png",  "KEMAR REID",   17, "Freewater champion", 180, None),
    ("gouda-neutral-ref.png",  "COACH GOUDA",  44, "The beached god",    185, None),
    ("nakaru-neutral-ref.png", "KAIEN NAKARU", 38, "The Second Tide",    188, None),
]

W, H = 4400, 1480
M = 80
GAP = 16
TITLE_H = 250
GROUND_Y = 1215          # everyone's feet land here
PX_PER_CM = 4.15         # 188cm -> ~780px
COLS = len(CAST)
cell_w = (W - 2 * M - (COLS - 1) * GAP) // COLS

INK, MUTED, FAINT = (231, 238, 244), (147, 163, 184), (90, 107, 132)
TEAL, GOLD, CYAN = (62, 242, 196), (245, 214, 123), (89, 199, 227)
LINE = (60, 72, 96)


def font(name, size):
    return ImageFont.truetype(os.path.join(F, name), size)


LUM_FLOOR = 140   # below this is ink line or dark garment, never backdrop
SAT_CEIL = 45     # backdrop and its shadow are neutral; skin and kit are not


def cutout(path, crop=None):
    """Cut a figure off its grey backdrop, returning RGBA trimmed to its bbox.

    Method: take the set of "light and neutral" pixels, then keep only the
    connected component that touches the frame edge. That component is the
    backdrop plus its contact shadow, and nothing else — because cel-shaded
    art draws a dark ink outline around every figure, and the outline fails
    LUM_FLOOR, so the region cannot cross into the character.

    Two simpler methods were tried and rejected:
      * brightness threshold — punched holes in Bo's cream sweater and Luna's
        white robe, both within ~20 levels of their backdrop.
      * PIL flood fill — compares each pixel to the SEED, so the dark core of
        Luna's contact shadow blocked it and the shadow survived whole. Raising
        the tolerance far enough to swallow the shadow risks leaking through
        anti-aliased linework elsewhere.
    Letting the ink outline define the boundary is what the art form already
    gives us for free.
    """
    im = Image.open(path).convert("RGB")
    if crop:
        im = im.crop(crop)

    a = np.asarray(im).astype(np.int16)
    lum = a.mean(2)
    sat = a.max(2) - a.min(2)
    lightish = (lum >= LUM_FLOOR) & (sat <= SAT_CEIL)

    lbl, n = ndimage.label(lightish)
    edge = np.concatenate([lbl[0, :], lbl[-1, :], lbl[:, 0], lbl[:, -1]])
    bg_labels = set(int(v) for v in np.unique(edge) if v)
    bg = np.isin(lbl, list(bg_labels)) if bg_labels else np.zeros_like(lightish)

    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), "L")
    # Feather the cut so figures do not read as pasted stickers.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    fig = im.convert("RGBA")
    fig.putalpha(alpha)
    return fig.crop(fig.getbbox())


# ---------------------------------------------------------------- canvas
img = Image.new("RGB", (W, H), (5, 8, 16))
d = ImageDraw.Draw(img)
top, bot = (12, 28, 44), (4, 6, 12)
for y in range(H):
    t = (y / H) ** 0.85
    d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))

glow = Image.new("L", (W, H), 0)
ImageDraw.Draw(glow).ellipse([-W * 0.2, -H * 0.4, W * 1.2, H * 0.3], fill=40)
img = Image.composite(Image.new("RGB", (W, H), (20, 48, 70)), img, glow.point(lambda v: v // 2))
d = ImageDraw.Draw(img)

# ---------------------------------------------------------------- height grid
f_tick = font("GeistMono-Regular.ttf", 20)
for cm in range(120, 200, 10):
    y = GROUND_Y - cm * PX_PER_CM
    major = cm % 20 == 0
    d.line([(M, y), (W - M, y)], fill=(38, 54, 76) if major else (26, 37, 53), width=1)
    if major:
        d.text((M - 4, y - 26), f"{cm}cm", font=f_tick, fill=(74, 93, 118))
d.line([(M, GROUND_Y), (W - M, GROUND_Y)], fill=LINE, width=3)

# ---------------------------------------------------------------- title
f_kanji = ImageFont.truetype(JP, 64)
f_title = font("BigShoulders-Bold.ttf", 132)
f_sub = font("InstrumentSans-Regular.ttf", 27)
f_eyeb = font("InstrumentSans-Bold.ttf", 22)

d.text((M, 74), "逆流", font=f_kanji, fill=(59, 46, 99))
d.text((M + 150, 62), "UNDERTOW", font=f_title, fill=INK)

eyeb = "CAST LINEUP · HEIGHT CHART · CANON v2.5"
bb = d.textbbox((0, 0), eyeb, font=f_eyeb)
d.text((W - M - (bb[2] - bb[0]), 96), eyeb, font=f_eyeb, fill=TEAL)

d.text((M + 152, 196),
       "Built from the baseline reference plates — every figure at true relative height.",
       font=f_sub, fill=MUTED)
d.line([(M, TITLE_H + 8), (W - M, TITLE_H + 8)], fill=LINE, width=2)

# ---------------------------------------------------------------- figures
f_name = font("InstrumentSans-Bold.ttf", 32)
f_role = font("InstrumentSans-Regular.ttf", 24)
f_meta = font("GeistMono-Regular.ttf", 21)

# QC=1 keeps a copy of the empty board. Diffing the finished sheet against it
# isolates figure pixels exactly, so the height chart can be checked against its
# own grid instead of taken on trust.
if os.environ.get("QC"):
    img.save(os.path.join(ART, "qc", "_lineup-background.png"))

for i, (fn, name, age, role, cm, crop) in enumerate(CAST):
    fig = cutout(os.path.join(ART, fn), crop)

    # Scale to CROWN-to-feet, not bounding box. Scaling by bbox would let styled
    # hair eat real height: Gouda's topknot alone cost him 13cm, Luna's floating
    # hair 6cm. A height chart measures to the top of the skull, so the crown
    # lands exactly on the character's mark and hair overshoots it — which is
    # what you want to see on a model sheet anyway.
    al = np.asarray(fig.split()[-1]) > 128
    widths = al.sum(1)
    crown = int(np.argmax(widths >= 0.22 * widths.max()))
    scale = (cm * PX_PER_CM) / (fig.height - crown)
    fig = fig.resize((max(1, round(fig.width * scale)), max(1, round(fig.height * scale))),
                     Image.LANCZOS)

    cx = M + i * (cell_w + GAP) + cell_w // 2
    img.paste(fig, (cx - fig.width // 2, GROUND_Y - fig.height), fig)

# labels drawn after every figure so nothing overlaps them
for i, (fn, name, age, role, cm, crop) in enumerate(CAST):
    x = M + i * (cell_w + GAP)
    ly = GROUND_Y + 26
    d.line([(x, ly - 12), (x + cell_w, ly - 12)], fill=(40, 54, 74), width=1)
    d.text((x, ly), name, font=f_name, fill=INK)
    d.text((x, ly + 40), role, font=f_role, fill=GOLD if name == "KAIEN NAKARU" else CYAN)
    d.text((x, ly + 74), f"{age}  ·  {cm}cm", font=f_meta, fill=FAINT)

f_foot = font("InstrumentSans-Bold.ttf", 21)
foot = "DEEP CALLS TO DEEP"
bb = d.textbbox((0, 0), foot, font=f_foot)
d.text(((W - (bb[2] - bb[0])) // 2, H - 52), foot, font=f_foot, fill=FAINT)

out = os.path.join(ART, "cast-lineup-sheet.png")
img.save(out)
print("saved", out, img.size)
