"""Office shop: boombox. One item whose look follows the office stage, not a level:
l1 garage boombox on a milk crate, l2 office floor boombox on a side cabinet, l3 HQ walnut record console."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

# Back edge near y = +0.5 (against a wall), front faces -Y.
BUDGET = {1: 4000, 2: 4000, 3: 5000}
FRONT = (math.pi / 2, 0, 0)  # a cylinder's axis turned to face the front


def build(level, fn, name):
    reset()
    join(fn(), f'{name}_l{level}')
    export(tier_path(level), budget=BUDGET[level])


def boombox(p, x, y, z, body='metal_soft', trim='plastic_charcoal', s=1.0):
    """A chunky twin-speaker boombox standing on z, its speakers to the front (-Y)."""
    W, D, H = 0.62 * s, 0.2 * s, 0.32 * s
    parts = [box(f'{p}body', (W, D, H), (x, y, z + H / 2), body, bevel=0.03 * s)]
    fy = y - D / 2
    for sx in (-1, 1):
        cx = x + sx * 0.19 * s
        parts.append(cyl(f'{p}rim{sx}', 0.115 * s, 0.03 * s, (cx, fy - 0.004, z + H * 0.48), trim, verts=16, bevel=0.006, rot=FRONT))
        parts.append(cyl(f'{p}cone{sx}', 0.085 * s, 0.03 * s, (cx, fy - 0.012, z + H * 0.48), 'ink', verts=16, bevel=0.01, r2=0.05 * s, rot=FRONT))
        parts.append(cyl(f'{p}cap{sx}', 0.03 * s, 0.02 * s, (cx, fy - 0.026, z + H * 0.48), body, verts=12, bevel=0.006, rot=FRONT))
    # The cassette deck between the speakers, a dial strip over it and a row of keys on top.
    parts.append(box(f'{p}deck', (0.15 * s, 0.02 * s, 0.11 * s), (x, fy - 0.006, z + H * 0.4), trim, bevel=0.008))
    parts.append(box(f'{p}tape', (0.1 * s, 0.01 * s, 0.055 * s), (x, fy - 0.016, z + H * 0.4), 'paper', bevel=0.004))
    parts.append(box(f'{p}dial', (0.15 * s, 0.012 * s, 0.035 * s), (x, fy - 0.004, z + H * 0.78), 'screen_amber', bevel=0.004))
    parts.append(box(f'{p}needle_led', (0.006 * s, 0.006 * s, 0.03 * s), (x + 0.02 * s, fy - 0.011, z + H * 0.78), 'led_red', bevel=0))
    for i in range(5):
        parts.append(box(f'{p}key{i}', (0.035 * s, 0.05 * s, 0.018 * s), (x - 0.09 * s + i * 0.045 * s, y - 0.02 * s, z + H + 0.008 * s), trim if i else 'alarm_red', bevel=0.005))
    # A carry handle arching over the top, and a telescopic aerial at an angle.
    parts.append(torus(f'{p}handle', 0.2 * s, 0.017 * s, (x, y + 0.03 * s, z + H), trim, rot=(math.pi / 2, 0, 0), major_seg=20, minor_seg=6))
    parts.append(cyl(f'{p}aerial', 0.006 * s, 0.42 * s, (x + 0.24 * s, y + 0.05 * s, z + H + 0.18 * s), 'metal_soft', verts=6, bevel=0, rot=(0, 0.45, 0)))
    parts.append(uvsphere(f'{p}aerialtip', 0.012 * s, (x + 0.33 * s, y + 0.05 * s, z + H + 0.37 * s), 'metal_soft', seg=8, rings=5))
    return parts


def l1():
    # A red milk crate, open slats on the sides, a few tapes in it.
    parts = []
    C, Hc = 0.46, 0.34
    parts.append(box('crate_floor', (C, C, 0.03), (0, 0.1, 0.015), 'summons_red', bevel=0.008))
    parts.append(box('crate_top', (C, C, 0.03), (0, 0.1, Hc), 'summons_red', bevel=0.008))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(f'crate_post{sx}{sy}', (0.04, 0.04, Hc), (sx * (C / 2 - 0.02), 0.1 + sy * (C / 2 - 0.02), Hc / 2), 'summons_red', bevel=0.006, segments=1))
    for k in range(2):
        z = 0.11 + k * 0.12
        for sy in (-1, 1):
            parts.append(box(f'crate_slatx{k}{sy}', (C - 0.04, 0.025, 0.04), (0, 0.1 + sy * (C / 2 - 0.0125), z), 'summons_red', bevel=0.005, segments=1))
        for sx in (-1, 1):
            parts.append(box(f'crate_slaty{k}{sx}', (0.025, C - 0.04, 0.04), (sx * (C / 2 - 0.0125), 0.1, z), 'summons_red', bevel=0.005, segments=1))
    for i, c in enumerate(('marker_blue', 'fabric_mustard', 'paper')):
        parts.append(box(f'tape{i}', (0.11, 0.018, 0.07), (-0.1 + i * 0.03, 0.1 + i * 0.03, 0.08), c, bevel=0.004, rot=(0, 0, 0.3 * i)))
    parts += boombox('b_', 0, 0.1, Hc + 0.015)
    return parts


def l2():
    # A low two-drawer side cabinet, a boombox in teal on it and a stack of tapes beside.
    parts = []
    Wc, Dc, Hc = 0.82, 0.42, 0.42
    parts.append(box('cab', (Wc, Dc, Hc), (0, 0.22, Hc / 2 + 0.03), 'wood_light', bevel=0.02))
    parts.append(box('cab_top', (Wc + 0.03, Dc + 0.03, 0.03), (0, 0.22, Hc + 0.045), 'wood_honey', bevel=0.01))
    for k in range(2):
        z = 0.14 + k * 0.19
        parts.append(box(f'drawer{k}', (Wc - 0.08, 0.012, 0.15), (0, 0.22 - Dc / 2 - 0.004, z), 'wood_honey', bevel=0.01))
        parts.append(box(f'pull{k}', (0.12, 0.02, 0.02), (0, 0.22 - Dc / 2 - 0.016, z + 0.03), 'metal_dark', bevel=0.006))
    for sx in (-1, 1):
        parts.append(box(f'foot{sx}', (0.04, Dc - 0.04, 0.03), (sx * (Wc / 2 - 0.05), 0.22, 0.015), 'metal_dark', bevel=0.006))
    top = Hc + 0.06
    parts += boombox('b_', -0.08, 0.2, top, body='fabric_teal', s=1.0)
    for i, c in enumerate(('marker_orange', 'paper', 'screen_pink')):
        parts.append(box(f'tape{i}', (0.11, 0.07, 0.018), (0.32, 0.12, top + 0.009 + i * 0.019), c, bevel=0.004, rot=(0, 0, 0.15 * (i - 1))))
    return parts


def l3():
    # A walnut record console: grille cloth front, tapered legs, a turntable under an open lid,
    # and a record sleeve leaning on its side.
    parts = []
    W, D, H, legs = 0.9, 0.44, 0.38, 0.2
    cz = legs + H / 2
    parts.append(box('console', (W, D, H), (0, 0.2, cz), 'wood_walnut', bevel=0.025))
    fy = 0.2 - D / 2
    for sx in (-1, 1):
        parts.append(box(f'grille{sx}', (0.3, 0.012, H - 0.09), (sx * 0.24, fy - 0.004, cz), 'fabric_mustard', bevel=0.008))
        for k in range(4):
            parts.append(box(f'slat{sx}{k}', (0.286, 0.014, 0.012), (sx * 0.24, fy - 0.008, cz - 0.11 + k * 0.073), 'wood_walnut', bevel=0.003))
    parts.append(box('dialpanel', (0.12, 0.012, H - 0.09), (0, fy - 0.004, cz), 'wood_dark', bevel=0.006))
    for k in range(2):
        parts.append(cyl(f'knob{k}', 0.022, 0.025, (0, fy - 0.016, cz - 0.06 + k * 0.1), 'gold', verts=12, bevel=0.005, rot=FRONT))
    parts.append(box('tune_led', (0.05, 0.006, 0.012), (0, fy - 0.012, cz + 0.11), 'led_amber', bevel=0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cyl(f'leg{sx}{sy}', 0.022, legs + 0.02, (sx * (W / 2 - 0.07), 0.2 + sy * (D / 2 - 0.06), legs / 2), 'wood_dark', verts=8, bevel=0.004, r2=0.014))
    top = legs + H
    # The turntable: a plinth, a platter, a black record with a red label, and the tone arm.
    parts.append(box('plinth', (0.42, 0.36, 0.03), (-0.14, 0.2, top + 0.015), 'wood_dark', bevel=0.008))
    parts.append(cyl('platter', 0.15, 0.022, (-0.17, 0.2, top + 0.041), 'metal_soft', verts=24, bevel=0.004))
    parts.append(cyl('record', 0.145, 0.006, (-0.17, 0.2, top + 0.055), 'ink', verts=24, bevel=0.001))
    parts.append(cyl('label', 0.045, 0.004, (-0.17, 0.2, top + 0.059), 'alarm_red', verts=16, bevel=0))
    parts.append(cyl('arm_base', 0.025, 0.03, (0.03, 0.32, top + 0.045), 'metal_dark', verts=10, bevel=0.004))
    parts.append(box('arm', (0.012, 0.2, 0.012), (0.0, 0.24, top + 0.068), 'metal_soft', bevel=0.003, rot=(0, 0, 0.35)))
    parts.append(box('cart', (0.03, 0.04, 0.018), (-0.035, 0.14, top + 0.064), 'ink', bevel=0.004, rot=(0, 0, 0.35)))
    # The dust lid, propped open behind the turntable.
    parts.append(box('lid', (0.42, 0.012, 0.3), (-0.14, 0.4, top + 0.17), 'glass', bevel=0.006, rot=(-0.22, 0, 0)))
    # A record sleeve and a small speaker on the right half.
    parts.append(box('sleeve', (0.26, 0.012, 0.26), (0.26, 0.33, top + 0.14), 'fabric_teal', bevel=0.004, rot=(-0.25, 0, 0)))
    parts.append(cyl('sleeve_dot', 0.06, 0.004, (0.26, 0.322, top + 0.15), 'fabric_mustard', verts=16, bevel=0, rot=(math.pi / 2 - 0.25, 0, 0)))
    return parts


for lvl, fn in ((1, l1), (2, l2), (3, l3)):
    build(lvl, fn, 'boombox')
