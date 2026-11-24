"""Cut the four fish out of the painting and build a fish-free background.

Usage: python3 tools/extract_fish.py <source-photo> <out-dir>
Produces: background.webp, fish-*.webp, fish.json (positions in painting px).
"""
import json, sys
import cv2
import numpy as np

src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src)
P = im[234:1615, 298:2220].copy()  # painting area inside the silk mount
H, W = P.shape[:2]

# Even out the uneven lighting of the photo (flat-field) so the paper reads
# as one tone and the edges can melt into the page background.
g = cv2.cvtColor(P, cv2.COLOR_BGR2GRAY).astype(np.float32)
paper = (g > cv2.GaussianBlur(g, (0, 0), 40) - 4).astype(np.float32)
illum = cv2.GaussianBlur(g * paper, (0, 0), 120) / (cv2.GaussianBlur(paper, (0, 0), 120) + 1e-4)
P = np.clip(P.astype(np.float32) * (206.0 / illum)[..., None], 0, 255).astype(np.uint8)

# Fish outlines, traced by hand in red over a 1440x900 screenshot of the
# home page (tools/fish-outlines.jpg). In that screenshot the painting was
# drawn at scale 0.7492, offset (0, -105.2), so screen -> painting is
# p = (screen - offset) / scale.
OUTLINES = "tools/fish-outlines.jpg"
SHOT_SCALE, SHOT_TX, SHOT_TY = 0.7492, 0.0, -105.2
# a point inside each fish, in screenshot pixels
SEEDS = {"about": (500, 470), "music": (1100, 300), "work": (650, 670), "blog": (480, 150)}
# each fish's head (painting px): the point it sways around and swims from
HEADS = {"about": (1112, 655), "music": (1158, 428), "work": (1082, 1075), "blog": (848, 362)}

shot = cv2.imread(OUTLINES).astype(int)
sb, sg, sr = shot[..., 0], shot[..., 1], shot[..., 2]
red = ((sr > 170) & (sg < 110) & (sb < 110) & (sr - sg > 90)).astype(np.uint8) * 255
walls = cv2.dilate(red, np.ones((3, 3)))
to_painting = np.float32([[1 / SHOT_SCALE, 0, -SHOT_TX / SHOT_SCALE], [0, 1 / SHOT_SCALE, -SHOT_TY / SHOT_SCALE]])

all_mask = np.zeros((H, W), np.uint8)
meta = {}
for name, seed in SEEDS.items():
    ff = walls.copy()
    cv2.floodFill(ff, np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8), seed, 128)
    region = (ff == 128).astype(np.uint8) * 255
    region = cv2.dilate(region, np.ones((3, 3)))          # take in the line itself
    fg = cv2.warpAffine(region, to_painting, (W, H), flags=cv2.INTER_LINEAR)
    fg = ((fg > 127) * 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(fg, (0, 0), 2.2)              # soft brush edge
    all_mask = np.maximum(all_mask, cv2.dilate(fg, np.ones((15, 15))))

    x, y, w, h = cv2.boundingRect(cv2.dilate(fg, np.ones((15, 15))))
    rgba = np.dstack([P[y:y+h, x:x+w], alpha[y:y+h, x:x+w]])
    cv2.imwrite(f"{out}/fish-{name}.webp", rgba, [cv2.IMWRITE_WEBP_QUALITY, 88])
    hx, hy = HEADS[name]
    meta[name] = {"x": x, "y": y, "w": w, "h": h,
                  "px": round((hx - x) / w * 100, 1), "py": round((hy - y) / h * 100, 1)}

# Background: fill the holes with a smooth paper estimate plus real paper grain.
# Paper tone = normalized blur over pixels that are neither fish nor ink.
mask = cv2.dilate(all_mask, np.ones((21, 21)))
gray = cv2.cvtColor(P, cv2.COLOR_BGR2GRAY)
paper_ok = ((mask == 0) & (gray > cv2.GaussianBlur(gray, (0, 0), 40) - 6)).astype(np.float32)
Pf = P.astype(np.float32)
# Average nearby clean paper. In the middle of a big hole there's little paper
# close by and a small blur gets noisy, so blend in wider and wider blurs
# wherever the nearer ones have too little paper to go on.
smooth = None
for sigma in (300, 120, 45):
    num = cv2.GaussianBlur(Pf * paper_ok[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(paper_ok, (0, 0), sigma)[..., None]
    est = num / (den + 1e-4)
    if smooth is None:
        smooth = est
    else:
        trust = np.clip((den - 0.15) / 0.35, 0, 1)
        smooth = est * trust + smooth * (1 - trust)
# grain sampled from an empty strip of paper (top-left), tiled
patch = Pf[20:220, 20:420]
grain = patch - cv2.GaussianBlur(patch, (0, 0), 15)
tile = np.tile(grain, (H // grain.shape[0] + 1, W // grain.shape[1] + 1, 1))[:H, :W]
fill = np.clip(smooth + tile, 0, 255)
soft = cv2.GaussianBlur(mask, (0, 0), 10).astype(np.float32)[..., None] / 255
bg = (Pf * (1 - soft) + fill * soft).astype(np.uint8)
cv2.imwrite(f"{out}/background.webp", bg, [cv2.IMWRITE_WEBP_QUALITY, 82])
json.dump({"width": W, "height": H, "fish": meta}, open(f"{out}/fish.json", "w"), indent=2)
print(json.dumps(meta))

# Signature + seal, cut out on its own so phones (where the pond is turned a
# quarter turn) can show it upright, plus a background with it painted out.
sx0, sy0, sx1, sy1 = 48, 1140, 160, 1362
sig = P[sy0:sy1, sx0:sx1].astype(np.float32)
paper_c = smooth[sy0:sy1, sx0:sx1]
lum = sig.mean(2); plum = paper_c.mean(2)
dark = np.clip((plum - lum - 8) / 70, 0, 1)
red = np.clip((sig[..., 2] - sig[..., 1] - 18) / 40, 0, 1)
a = np.maximum(dark, red)
rgb = np.clip((sig - paper_c * (1 - a[..., None])) / np.maximum(a[..., None], 0.05), 0, 255)
cv2.imwrite(f"{out}/signature.webp", np.dstack([rgb, a * 255]).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])
m2 = np.zeros((H, W), np.uint8); m2[sy0:sy1, sx0:sx1] = 255
soft2 = cv2.GaussianBlur(m2, (0, 0), 6).astype(np.float32)[..., None] / 255
bg2 = (bg.astype(np.float32) * (1 - soft2) + fill * soft2).astype(np.uint8)
cv2.imwrite(f"{out}/background-nosig.webp", bg2, [cv2.IMWRITE_WEBP_QUALITY, 82])
