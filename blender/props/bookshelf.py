"""Open bookshelf with a mix of upright, leaning, and stacked books."""
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
rnd = random.Random(11)
W, D, H, T = 0.95, 0.34, 1.6, 0.035
BOOKS = ['fabric_teal', 'fabric_mustard', 'fabric_terracotta', 'fabric_slate', 'fabric_sage', 'paper_sheet', 'wood_dark', 'cardboard']
parts = [box('back', (W, 0.02, H), (0, D / 2 - 0.01, H / 2), 'wood_light', bevel=0.005)]
for sx in (-1, 1):
    parts.append(box(f'side{sx}', (T, D, H), (sx * (W / 2 - T / 2), 0, H / 2), 'wood_honey', bevel=0.012))
shelves = [0.06, 0.44, 0.82, 1.2, H - T / 2]
for i, z in enumerate(shelves):
    parts.append(box(f'shelf{i}', (W - 2 * T + 0.002, D, T), (0, 0, z), 'wood_honey', bevel=0.01))
for s in range(4):
    z0 = shelves[s] + T / 2
    x = -W / 2 + T + 0.02
    end = W / 2 - T - 0.02
    while x < end - 0.05:
        kind = rnd.random()
        if kind < 0.12 and x < end - 0.2:
            for k in range(3):
                parts.append(box(f'stack{s}_{k}_{x:.2f}', (0.18, 0.22, 0.04), (x + 0.09, -0.02, z0 + 0.02 + k * 0.042), rnd.choice(BOOKS), bevel=0))
            x += 0.2
            continue
        w = rnd.uniform(0.03, 0.055)
        h = rnd.uniform(0.2, 0.3)
        lean = math.radians(12) if kind > 0.9 else 0
        parts.append(box(f'book{s}_{x:.2f}', (w, rnd.uniform(0.2, 0.26), h), (x + w / 2 + (h / 2) * math.sin(lean), -0.02, z0 + h / 2 * math.cos(lean)), rnd.choice(BOOKS), bevel=0, rot=(0, lean, 0)))
        x += w + 0.004 + (h * math.sin(lean))
        if rnd.random() < 0.1:
            x += 0.08
join(parts, 'bookshelf')
export()
