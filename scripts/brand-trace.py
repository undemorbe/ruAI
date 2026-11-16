"""Трассировка чёрного знака с фото в SVG-путь (marching squares + RDP + сглаживание).
   python3 scripts/brand-trace.py фото.jpg путь.txt  (нужны numpy и Pillow); результат - в scripts/brand-mark-traced.mjs."""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
LEVEL = 128.0
img = Image.open(src).convert('L').filter(ImageFilter.GaussianBlur(1.2))
a = np.asarray(img, dtype=float)
# рамка белым, чтобы все контуры были замкнуты
a = np.pad(a, 2, constant_values=255.0)
H, W = a.shape
ink = a < LEVEL  # «внутри» = чёрное


def interp(p, q, vp, vq):
    t = (LEVEL - vp) / (vq - vp)
    return (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))


# ребро: ('h', y, x) между (y,x)-(y,x+1); ('v', y, x) между (y,x)-(y+1,x)
def edge_pt(e):
    k, y, x = e
    if k == 'h':
        return interp((x, y), (x + 1, y), a[y, x], a[y, x + 1])
    return interp((x, y), (x, y + 1), a[y, x], a[y + 1, x])


adj = {}


def link(e1, e2):
    adj.setdefault(e1, []).append(e2)
    adj.setdefault(e2, []).append(e1)


for y in range(H - 1):
    for x in range(W - 1):
        tl, tr, br, bl = ink[y, x], ink[y, x + 1], ink[y + 1, x + 1], ink[y + 1, x]
        idx = tl * 8 + tr * 4 + br * 2 + bl
        if idx in (0, 15):
            continue
        T, R, B, L = ('h', y, x), ('v', y, x + 1), ('h', y + 1, x), ('v', y, x)
        cases = {
            1: [(L, B)], 2: [(B, R)], 3: [(L, R)], 4: [(T, R)], 6: [(T, B)], 7: [(T, L)],
            8: [(T, L)], 9: [(T, B)], 11: [(T, R)], 12: [(L, R)], 13: [(B, R)], 14: [(L, B)],
        }
        if idx in (5, 10):
            centre_ink = (a[y, x] + a[y, x + 1] + a[y + 1, x + 1] + a[y + 1, x]) / 4 < LEVEL
            if idx == 5:  # tr, bl чёрные
                segs = [(T, L), (B, R)] if not centre_ink else [(T, R), (L, B)]
            else:  # tl, br чёрные
                segs = [(T, R), (L, B)] if not centre_ink else [(T, L), (B, R)]
        else:
            segs = cases[idx]
        for e1, e2 in segs:
            link(e1, e2)

seen = set()
loops = []
for start in adj:
    if start in seen:
        continue
    chain = [start]
    seen.add(start)
    prev, cur = None, start
    while True:
        nxt = [n for n in adj[cur] if n != prev and n not in seen]
        if not nxt:
            break
        prev, cur = cur, nxt[0]
        seen.add(cur)
        chain.append(cur)
    if len(chain) > 20:
        loops.append(np.array([edge_pt(e) for e in chain]))


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    s, e = pts[0], pts[-1]
    d = e - s
    n = np.hypot(*d) or 1e-9
    dist = np.abs(d[0] * (pts[:, 1] - s[1]) - d[1] * (pts[:, 0] - s[0])) / n
    i = int(np.argmax(dist))
    if dist[i] > eps:
        return np.vstack([rdp(pts[: i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.array([s, e])


def area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * (np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


loops = [l for l in loops if abs(area(l)) > 30]
allp = np.vstack(loops)
x0, y0 = allp.min(0)
x1, y1 = allp.max(0)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
FIELD, BOX = 64.0, 60.0  # знак вписан в 60×60 по центру поля 64×64
k = BOX / max(x1 - x0, y1 - y0)


def fmt(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return s if s != '-0' else '0'


parts = []
for l in loops:
    # сглаживание замкнутого контура скользящим средним, затем упрощение
    sm = l.copy()
    for _ in range(2):
        sm = (np.roll(sm, 1, 0) + 2 * sm + np.roll(sm, -1, 0)) / 4
    # замкнутый контур делим в самой дальней от начала точке: RDP работает с открытыми ломаными
    far = int(np.argmax(np.hypot(*(sm - sm[0]).T)))
    simp = np.vstack([rdp(sm[: far + 1], 0.18)[:-1], rdp(np.vstack([sm[far:], sm[:1]]), 0.18)[:-1]])
    q = (simp - [cx, cy]) * k + FIELD / 2
    # квадратичные кривые через середины отрезков: гладкий контур без изломов
    n = len(q)
    mids = (q + np.roll(q, -1, 0)) / 2
    d = f'M{fmt(mids[-1][0])} {fmt(mids[-1][1])}'
    for i in range(n):
        d += f'Q{fmt(q[i][0])} {fmt(q[i][1])} {fmt(mids[i][0])} {fmt(mids[i][1])}'
    parts.append(d + 'Z')

path = ''.join(parts)
open(out, 'w').write(path)
print(len(loops), 'контуров,', len(path), 'символов', file=sys.stderr)
