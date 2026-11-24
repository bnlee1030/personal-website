"""Cut the name stamp out of its photo: transparent where the paper shows.

Usage: python3 tools/extract_stamp.py tools/source-stamp.jpg assets
Produces: stamp.webp (for the header), favicon-32.png, favicon-180.png.
"""
import sys
import cv2
import numpy as np

src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src).astype(np.float32)
b, g, r = cv2.split(im)
red = r - (g + b) / 2                          # paper ~0, seal ink ~ +60..90
alpha = np.clip((red - 18) / 40, 0, 1)
ys, xs = np.where(alpha > 0.5)
# the stamp is the big red blob near the centre (ignore the pink glare top-left)
cy, cx = np.median(ys[ys > 600]), np.median(xs[ys > 600])
keep = (abs(ys - cy) < 300) & (abs(xs - cx) < 300)
y0, y1, x0, x1 = ys[keep].min() - 6, ys[keep].max() + 7, xs[keep].min() - 6, xs[keep].max() + 7
a = alpha[y0:y1, x0:x1]
ink = np.array([38, 40, 150], np.float32)      # even seal red (BGR), keeps the stamp's texture via alpha
rgb = np.broadcast_to(ink, a.shape + (3,))
rgba = np.dstack([rgb, a * 255]).astype(np.uint8)
side = max(rgba.shape[:2])
sq = np.zeros((side, side, 4), np.uint8)
oy, ox = (side - rgba.shape[0]) // 2, (side - rgba.shape[1]) // 2
sq[oy:oy + rgba.shape[0], ox:ox + rgba.shape[1]] = rgba
cv2.imwrite(f"{out}/stamp.webp", cv2.resize(sq, (240, 240), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 92])
cv2.imwrite(f"{out}/favicon-32.png", cv2.resize(sq, (32, 32), interpolation=cv2.INTER_AREA))
# home-screen icon: stamp on paper (iOS fills transparency with black)
pad = int(side * 0.18)
bg = np.zeros((side + 2 * pad, side + 2 * pad, 4), np.uint8); bg[...] = (195, 209, 218, 255)
al = sq[..., 3:4].astype(np.float32) / 255
bg[pad:pad + side, pad:pad + side, :3] = (sq[..., :3] * al + bg[pad:pad + side, pad:pad + side, :3] * (1 - al)).astype(np.uint8)
cv2.imwrite(f"{out}/favicon-180.png", cv2.resize(bg, (180, 180), interpolation=cv2.INTER_AREA))
print("stamp box", x0, y0, x1, y1)
