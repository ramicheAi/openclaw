from PIL import Image, ImageDraw, ImageFont
import os

ART = "/home/user/openclaw/docs/assets/undertow"
F = "/mnt/skills/examples/canvas-design/canvas-fonts"
JP = "/etc/alternatives/fonts-japanese-gothic.ttf"

# (file, NAME, role, cx, cy, hfrac)  -- crop window: center x/y as fraction, height as fraction of source
CAST = [
    ("kai-pool-floor-01.png",  "KAI ISOZAKI",   "The boy who sank",        0.50, 0.60, 0.46),
    ("ren-fence-01.png",       "REN KUROSE",    "The rival",               0.50, 0.40, 0.60),
    ("kemar-01.png",           "KEMAR REID",    "Freewater champion",      0.50, 0.48, 0.74),
    ("bo-dock.png",            "BO FUJII",      "The heart",               0.50, 0.50, 0.74),
    ("luna-01.png",            "LUNA AMANE",    "The diver",               0.50, 0.50, 0.78),
    ("mirei-01.png",           "MIREI SANDA",   "The tactician",           0.50, 0.40, 0.58),
    ("gouda-01.png",           "COACH GOUDA",   "The beached god",         0.50, 0.44, 0.58),
    ("nakaru-seawall-01.png",  "KAIEN NAKARU",  "The Second Tide",         0.50, 0.40, 0.50),
]

W, H = 2400, 2080
M = 80                    # outer margin
COLS = 4
GAP = 30
TITLE_H = 250
LABEL_H = 96

cell_w = (W - 2*M - (COLS-1)*GAP) // COLS
cell_h = int(cell_w * 4/3)

INK    = (231,238,244)
MUTED  = (147,163,184)
FAINT  = (90,107,132)
TEAL   = (62,242,196)
GOLD   = (245,214,123)
CYAN   = (89,199,227)
LINE   = (60,72,96)

def font(name, size):
    return ImageFont.truetype(os.path.join(F, name), size)

# --- canvas with vertical depth gradient (surface cyan-ish -> abyss black)
img = Image.new("RGB", (W, H), (5,8,16))
d = ImageDraw.Draw(img)
top = (12,28,44); bot = (4,6,12)
for y in range(H):
    t = y / H
    t2 = t ** 0.85
    c = tuple(int(top[i] + (bot[i]-top[i])*t2) for i in range(3))
    d.line([(0,y),(W,y)], fill=c)

# subtle vignette-ish top glow
glow = Image.new("L", (W,H), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse([-W*0.2, -H*0.35, W*1.2, H*0.35], fill=40)
img = Image.composite(Image.new("RGB",(W,H),(20,48,70)), img, glow.point(lambda v: v//2))

d = ImageDraw.Draw(img)

# --- title block
f_kanji = ImageFont.truetype(JP, 64)
f_title = font("BigShoulders-Bold.ttf", 132)
f_sub   = font("InstrumentSans-Regular.ttf", 26)
f_eyeb  = font("InstrumentSans-Bold.ttf", 22)

d.text((M, 74), "逆流", font=f_kanji, fill=(59,46,99))
d.text((M+150, 62), "UNDERTOW", font=f_title, fill=INK)

# eyebrow right-aligned
eyeb = "CHARACTER LINEUP  ·  CANON v2.0"
bb = d.textbbox((0,0), eyeb, font=f_eyeb)
d.text((W - M - (bb[2]-bb[0]), 96), eyeb, font=f_eyeb, fill=TEAL)

sub = "Every heritage on Earth is in these lanes — unannounced, the way real pools are."
d.text((M+152, 196), sub, font=f_sub, fill=MUTED)

# rule under title
d.line([(M, TITLE_H+8), (W-M, TITLE_H+8)], fill=LINE, width=2)

# --- portraits
f_name = font("InstrumentSans-Bold.ttf", 34)
f_role = font("InstrumentSans-Regular.ttf", 25)

start_y = TITLE_H + 46
for i,(fn, name, role, cx, cy, hf) in enumerate(CAST):
    col = i % COLS
    row = i // COLS
    x = M + col*(cell_w+GAP)
    y = start_y + row*(cell_h + LABEL_H + 34)

    src = Image.open(os.path.join(ART, fn)).convert("RGB")
    sw, sh = src.size
    crop_h = int(sh * hf)
    crop_w = int(crop_h * 3/4)
    if crop_w > sw:
        crop_w = sw
        crop_h = int(crop_w * 4/3)
    left = int(sw*cx - crop_w/2)
    top_ = int(sh*cy - crop_h/2)
    left = max(0, min(left, sw-crop_w))
    top_ = max(0, min(top_, sh-crop_h))
    port = src.crop((left, top_, left+crop_w, top_+crop_h)).resize((cell_w, cell_h), Image.LANCZOS)

    img.paste(port, (x, y))
    # frame
    d.rectangle([x, y, x+cell_w-1, y+cell_h-1], outline=(80,95,120), width=2)

    # label
    ly = y + cell_h + 20
    d.text((x, ly), name, font=f_name, fill=INK)
    d.text((x, ly+42), role, font=f_role, fill=CYAN if i!=7 else GOLD)

# footer
f_foot = font("InstrumentSans-Bold.ttf", 21)
foot = "DEEP CALLS TO DEEP"
bb = d.textbbox((0,0), foot, font=f_foot)
d.text(((W-(bb[2]-bb[0]))//2, H-56), foot, font=f_foot, fill=FAINT)

out = "/tmp/claude-0/-home-user-openclaw/ac50bd72-4d91-5a69-873e-60ae0d6ecf82/scratchpad/undertow-cast-lineup.png"
img.save(out, quality=95)
print("saved", out, img.size)
