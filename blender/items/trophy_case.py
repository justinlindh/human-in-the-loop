"""Office shop: trophy_case. l1 low shelf with one trophy, l2 glass case, l3 lit display wall."""
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
    parts = [box('bench', (1.0, 0.36, 0.06), (0, 0.25, 0.46), 'wood_honey', bevel=0.015)]
    for sx in (-1, 1):
        parts.append(box(f'side{sx}', (0.05, 0.36, 0.46), (sx * 0.475, 0.25, 0.23), 'wood_honey', bevel=0.012))
    parts.append(box('lower', (0.9, 0.34, 0.03), (0, 0.25, 0.1), 'wood_honey', bevel=0.01))
    parts += kit.trophy('t1', -0.15, 0.25, 0.49, s=1.0)
    parts += kit.stack_books('sb', 0.25, 0.25, 0.115, n=3)
    parts.append(box('frame', (0.24, 0.03, 0.18), (0.3, 0.35, 0.58), 'wood_dark', bevel=0.008, rot=(math.radians(-10), 0, 0)))
    parts.append(box('cert', (0.2, 0.005, 0.14), (0.3, 0.333, 0.58), 'paper_sheet', bevel=0, rot=(math.radians(-10), 0, 0)))
    return parts


def l2():
    W, D, H = 0.95, 0.42, 1.7
    parts = [
        box('plinth', (W, D, 0.12), (0, 0.25, 0.06), 'wood_walnut', bevel=0.015),
        box('crown', (W + 0.04, D + 0.04, 0.06), (0, 0.25, H + 0.03), 'wood_walnut', bevel=0.015),
        box('back', (W - 0.04, 0.02, H - 0.12), (0, 0.45, 0.06 + H / 2), 'fabric_slate', bevel=0.004),
    ]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(f'post{sx}{sy}', (0.035, 0.035, H - 0.12), (sx * (W / 2 - 0.02), 0.25 + sy * (D / 2 - 0.02), 0.06 + H / 2), 'wood_walnut', bevel=0.008))
    kinds = [('cup', 'star', 'plaque'), ('orb', 'cup'), ('plaque', 'star', 'cup')]
    for i, z in enumerate((0.12, 0.62, 1.12)):
        parts.append(box(f'shelf{i}', (W - 0.06, D - 0.06, 0.02), (0, 0.25, z + 0.01), 'glass_frame', bevel=0.004))
        ks = kinds[i]
        for k, kind in enumerate(ks):
            parts += kit.trophy(f't{i}{k}', (k - (len(ks) - 1) / 2) * 0.28, 0.25, z + 0.02, s=0.8, kind=kind)
    return parts


def l2_glass():
    W, D, H = 0.95, 0.42, 1.7
    g = [plane('tc_glass_front', W - 0.06, H - 0.14, (0, 0.25 - D / 2 + 0.005, 0.06 + H / 2), 'glass')]
    for sx in (-1, 1):
        g.append(plane(f'tc_glass_side{sx}', D - 0.06, H - 0.14, (sx * (W / 2 - 0.005), 0.25, 0.06 + H / 2), 'glass', rot=(math.pi / 2, 0, math.pi / 2)))
    return g


def l3():
    W, H = 2.1, 1.95
    parts = [box('wallunit', (W, 0.4, 0.1), (0, 0.3, 0.05), 'wood_walnut', bevel=0.02),
             box('backpanel', (W, 0.06, H), (0, 0.47, H / 2), 'wood_walnut', bevel=0.02)]
    cols, rows = 4, 3
    cw = (W - 0.1) / cols
    rh = (H - 0.2) / rows
    for c in range(cols + 1):
        parts.append(box(f'div{c}', (0.04, 0.36, H - 0.1), (-W / 2 + 0.05 + c * cw, 0.3, 0.1 + (H - 0.1) / 2), 'wood_walnut', bevel=0.008))
    for r in range(rows + 1):
        parts.append(box(f'shelf{r}', (W - 0.06, 0.36, 0.04), (0, 0.3, 0.1 + r * rh), 'wood_walnut', bevel=0.008))
    kinds = ['cup', 'star', 'plaque', 'orb']
    for r in range(rows):
        for c in range(cols):
            if (r, c) == (1, 1) or (r, c) == (1, 2):
                continue
            parts += kit.trophy(f't{r}{c}', -W / 2 + 0.05 + (c + 0.5) * cw, 0.3, 0.12 + r * rh, s=0.75, kind=kinds[(r + c) % 4])
    # Centerpiece spanning the middle two niches
    parts.append(box('podium', (0.5, 0.3, 0.12), (0, 0.3, 0.12 + rh + 0.06), 'gold', bevel=0.02))
    parts += kit.trophy('big', 0, 0.3, 0.12 + rh + 0.12, s=1.3, kind='cup')
    return parts


def l3_lights():
    W, H = 2.1, 1.95
    cols, rows = 4, 3
    cw = (W - 0.1) / cols
    rh = (H - 0.2) / rows
    strips = []
    for r in range(rows):
        strips.append(box(f'tc_strip{r}', (W - 0.2, 0.02, 0.012), (0, 0.16, 0.1 + (r + 1) * rh - 0.03), 'lamp', bevel=0))
    join(strips, 'trophy_case_lamp_glow')


reset(); join(l1(), 'trophy_case_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'trophy_case_l2'); l2_glass(); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'trophy_case_l3'); l3_lights(); export(tier_path(3), budget=BUDGET[3])
