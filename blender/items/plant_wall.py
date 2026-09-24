"""Office shop: plant_wall. l1 two pots, l2 ladder shelf of plants, l3 living wall with grow light."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

# Shop item tiers share one footprint: back edge near y = +0.5 (against a wall), front faces -Y.
BUDGET = {1: 3000, 2: 4000, 3: 6000}


def build(level, fn, name):
    reset()
    join(fn(), f'{name}_l{level}')
    export(tier_path(level), budget=BUDGET[level])


def l1():
    return kit.pot_plant('a_', -0.3, 0.1, tall=True, s=0.9) + kit.pot_plant('b_', 0.35, 0.05, pot='pot_cream', s=1.3, seed=5)


def l2():
    parts = []
    for sx in (-1, 1):
        parts.append(box(f'rail{sx}', (0.05, 0.05, 1.6), (sx * 0.62, 0.3, 0.8), 'wood_honey', bevel=0.012, rot=(math.radians(-8), 0, 0)))
    for i, z in enumerate((0.3, 0.75, 1.2)):
        yy = 0.3 - (1.6 - z) * math.tan(math.radians(8)) * 0.5 + 0.05 * (2 - i)
        parts.append(box(f'shelf{i}', (1.24, 0.3 - i * 0.04, 0.04), (0, yy - 0.02, z), 'wood_honey', bevel=0.012))
        n = 3 if i < 2 else 2
        for k in range(n):
            px = (k - (n - 1) / 2) * 0.38
            if (i + k) % 2:
                parts += kit.trailing_plant(f't{i}{k}', px, yy - 0.04, z + 0.02, s=0.9, seed=i * 3 + k)
            else:
                parts += kit.pot_plant(f'p{i}{k}', px, yy - 0.02, pot='pot_cream', s=0.62, seed=i * 3 + k + 1, z=z + 0.02, detail=1)
    parts += kit.pot_plant('f_', 0.95, 0.05, tall=True, s=0.75, seed=9)
    return parts


def l3():
    W, H = 2.1, 1.85
    parts = [
        box('frame', (W + 0.08, 0.12, H + 0.08), (0, 0.44, 0.25 + H / 2), 'wood_walnut', bevel=0.02),
        box('backing', (W, 0.05, H), (0, 0.37, 0.25 + H / 2), 'soil', bevel=0.005),
        box('planter', (W + 0.1, 0.34, 0.3), (0, 0.24, 0.15), 'wood_honey', bevel=0.02),
        box('planter_soil', (W - 0.02, 0.26, 0.02), (0, 0.24, 0.3), 'soil', bevel=0),
        box('growbar', (W - 0.2, 0.08, 0.05), (0, 0.3, 0.25 + H + 0.1), 'metal_dark', bevel=0.012),
    ]
    greens = ['leaf', 'leaf_dark', 'leaf_light']
    k = 0
    for row in range(5):
        for col in range(7):
            cx = -W / 2 + 0.17 + col * (W - 0.34) / 6 + (0.08 if row % 2 else 0)
            cz = 0.45 + row * (H - 0.2) / 4.4
            o = sphere(f'wl{row}{col}', 0.17, (min(cx, W / 2 - 0.15), 0.3, cz), greens[(row * 7 + col) % 3], subdiv=1, scale=(1.15, 0.55, 1))
            displace_noise(o, strength=0.06, size=0.2, seed=k)
            parts.append(o)
            k += 1
    for i in range(5):
        o = sphere(f'pl{i}', 0.2, (-W / 2 + 0.25 + i * (W - 0.5) / 4, 0.2, 0.42), greens[i % 3], subdiv=2, scale=(1, 0.9, 0.9))
        displace_noise(o, strength=0.06, size=0.2, seed=30 + i)
        parts.append(o)
    return parts


def after_l3():
    g = box('plant_wall_grow_glow', (2.0, 0.02, 0.02), (0, 0.27, 0.25 + 1.85 + 0.07), 'grow', bevel=0)


for lvl, fn in ((1, l1), (2, l2), (3, l3)):
    if lvl == 3:
        reset()
        join(fn(), 'plant_wall_l3')
        after_l3()
        export(tier_path(3), budget=BUDGET[3])
    else:
        build(lvl, fn, 'plant_wall')
