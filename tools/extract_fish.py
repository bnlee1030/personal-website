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

FISH = {
    "about": [  # big dark carp, left
        [(110,500),(160,560),(230,640),(300,690),(340,676),(500,683),(620,648),(720,622),(830,616),(960,592),(1060,594),(1114,618),(1118,662),(1088,707),(1042,737),(987,762),(962,792),(912,827),(820,847),(700,857),(560,867),(450,847),(350,807),(288,762),(238,702),(168,622),(116,540)],
        [(775,862),(830,838),(932,818),(904,862),(842,898),(782,914),(770,885)],
        [(498,866),(560,864),(664,872),(602,897),(530,928),(496,906)],
    ],
    "music": [  # curling carp, right
        [(1156,430),(1178,396),(1250,386),(1310,396),(1400,416),(1500,466),(1582,516),(1634,578),(1656,650),(1654,750),(1634,822),(1614,880),(1604,922),(1574,972),(1528,966),(1518,904),(1464,898),(1476,878),(1556,846),(1586,798),(1596,722),(1576,656),(1538,614),(1478,584),(1400,564),(1350,544),(1288,514),(1228,494),(1176,464)],
        [(1340,586),(1402,596),(1454,638),(1434,704),(1398,714),(1356,652)],
        [(1500,652),(1542,656),(1584,700),(1562,734),(1516,702)],
    ],
    "work": [  # small golden carp, bottom
        [(696,866),(722,876),(782,926),(902,981),(992,1026),(1052,1046),(1084,1072),(1074,1098),(1022,1110),(958,1104),(858,1084),(778,1054),(718,1014),(688,1004),(646,978),(626,930),(660,940),(688,918),(690,880)],
        [(826,1098),(872,1092),(908,1130),(882,1154),(842,1134)],
    ],
    "blog": [  # faint pale fish, top
        [(444,296),(520,310),(600,314),(700,304),(762,314),(824,336),(850,360),(834,380),(780,384),(700,376),(600,370),(520,356),(446,366),(440,330)],
        [(596,380),(626,378),(632,404),(604,404)],
    ],
}

all_mask = np.zeros((H, W), np.uint8)
meta = {}
for name, polys in FISH.items():
    poly = np.zeros((H, W), np.uint8)
    for p in polys:
        cv2.fillPoly(poly, [np.array(p, np.int32)], 255)
    # GrabCut, constrained to a band around the hand-drawn outline
    gc = np.full((H, W), cv2.GC_BGD, np.uint8)
    gc[cv2.dilate(poly, np.ones((25, 25))) > 0] = cv2.GC_PR_BGD
    gc[poly > 0] = cv2.GC_PR_FGD
    gc[cv2.erode(poly, np.ones((31, 31))) > 0] = cv2.GC_FGD
    try:
        cv2.grabCut(P, gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
        fg = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    except cv2.error:
        fg = poly
    fg = cv2.bitwise_and(fg, cv2.dilate(poly, np.ones((9, 9))))
    # keep only the biggest connected blobs (drop stray seaweed specks)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    keep = np.zeros_like(fg)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 600:
            keep[lab == i] = 255
    fg = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((9, 9)))
    alpha = cv2.GaussianBlur(cv2.dilate(fg, np.ones((5, 5))), (0, 0), 3)
    all_mask = np.maximum(all_mask, cv2.dilate(fg, np.ones((15, 15))))

    x, y, w, h = cv2.boundingRect(cv2.dilate(fg, np.ones((15, 15))))
    rgba = np.dstack([P[y:y+h, x:x+w], alpha[y:y+h, x:x+w]])
    cv2.imwrite(f"{out}/fish-{name}.webp", rgba, [cv2.IMWRITE_WEBP_QUALITY, 88])
    meta[name] = {"x": x, "y": y, "w": w, "h": h}

# Background: fill the holes with a smooth paper estimate plus real paper grain.
# Paper tone = normalized blur over pixels that are neither fish nor ink.
mask = cv2.dilate(all_mask, np.ones((21, 21)))
gray = cv2.cvtColor(P, cv2.COLOR_BGR2GRAY)
paper_ok = ((mask == 0) & (gray > cv2.GaussianBlur(gray, (0, 0), 40) - 6)).astype(np.float32)
Pf = P.astype(np.float32)
num = cv2.GaussianBlur(Pf * paper_ok[..., None], (0, 0), 45)
den = cv2.GaussianBlur(paper_ok, (0, 0), 45)[..., None] + 1e-4
smooth = num / den
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
