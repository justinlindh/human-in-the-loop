"""Office shop: disk_duplicator. l1 one beige duplicator tower on a work table, l2 two towers with
spindles of blanks, l3 a floor-standing autoloader beside a packing table. Drive bays face the
camera with a lit LED each; blank diskettes sit in stacks. Palette materials only, so the batch
draws them in buckets the office already has."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

# Shop item tiers share one footprint: back edge near y = +0.5 (against a wall), front faces -Y.
BUDGET = {1: 3000, 2: 4000, 3: 6000}
BEIGE = 'wall_cream'


def tower(p, x, y, z, bays=4, W=0.34, D=0.40, bay_h=0.085):
    """A beige duplicator tower: stacked drive bays, a slot and LED in each, a control strip on top."""
    H = 0.08 + bays * bay_h + 0.06
    fy = y - D / 2
    parts = [box(f'{p}case', (W, D, H), (x, y, z + H / 2), BEIGE, 0.018, 1),
             box(f'{p}plinth', (W + 0.02, D + 0.02, 0.025), (x, y, z + 0.0125), 'plastic_charcoal', 0.006, 1)]
    for i in range(bays):
        bz = z + 0.06 + (i + 0.5) * bay_h
        # Black drive bezels on the beige case, each with a pale disc slot and a lit LED, so the
        # front reads as drives rather than drawers.
        parts += [box(f'{p}bay{i}', (W - 0.05, 0.012, bay_h - 0.02), (x, fy - 0.004, bz), 'plastic_charcoal', 0.003, 1),
                  box(f'{p}slot{i}', (W * 0.5, 0.006, 0.014), (x - W * 0.1, fy - 0.011, bz), 'metal_soft', 0),
                  box(f'{p}lamp{i}', (0.035, 0.008, 0.026), (x + W * 0.33, fy - 0.011, bz),
                      'led_amber' if i % 3 == 1 else 'led', 0)]
    top = z + H - 0.03
    parts += [box(f'{p}panel', (W - 0.08, 0.008, 0.04), (x, fy - 0.004, top), 'plastic_charcoal', 0.003, 1),
              box(f'{p}panel_text', (W * 0.45, 0.004, 0.024), (x - W * 0.1, fy - 0.01, top), 'screen_amber', 0)]
    return parts, z + H


def diskettes(p, x, y, z, n=4, turn=0.0):
    """A stack of 3.5 inch blanks with labels on the top one."""
    parts = []
    for i in range(n):
        parts.append(box(f'{p}disk{i}', (0.13, 0.135, 0.016), (x + (i % 2) * 0.008, y, z + 0.008 + i * 0.017),
                         'fabric_slate' if i % 3 == 1 else 'plastic_charcoal', 0.003, 1, rot=(0, 0, turn + (i % 2) * 0.08)))
    top = z + n * 0.017 + 0.001
    parts += [box(f'{p}label', (0.095, 0.06, 0.003), (x, y - 0.025, top), 'paper_sheet', 0, rot=(0, 0, turn)),
              box(f'{p}shutter', (0.07, 0.038, 0.003), (x, y + 0.045, top), 'metal_soft', 0, rot=(0, 0, turn))]
    return parts


def spindle(p, x, y, z, h=0.12):
    """A spindle of blank CDs: a clear stack read as a pale cylinder on a dark base."""
    return [cyl(f'{p}base', 0.07, 0.012, (x, y, z + 0.006), 'plastic_charcoal', verts=12, bevel=0),
            cyl(f'{p}stack', 0.06, h, (x, y, z + 0.012 + h / 2), 'metal_soft', verts=12, bevel=0),
            cyl(f'{p}post', 0.008, 0.03, (x, y, z + h + 0.027), 'plastic_charcoal', verts=6, bevel=0)]


def table(W, D=0.62, H=0.72):
    return kit.desk('tbl_', 0, 0.12, W=W, D=D, H=H, top='wood_honey', frame='metal_soft', tray=False)


def l1():
    parts = table(1.3)
    t, _ = tower('t0_', -0.22, 0.2, 0.72)
    parts += t
    parts += diskettes('d0_', 0.18, 0.05, 0.72, n=5, turn=0.12)
    parts += diskettes('d1_', 0.36, 0.12, 0.72, n=3, turn=-0.2)
    parts.append(box('out_tray', (0.2, 0.14, 0.04), (0.3, 0.3, 0.74), 'plastic_charcoal', 0.006, 1))
    return parts


def l2():
    parts = table(1.8)
    for i, x in enumerate((-0.58, -0.16)):
        t, top = tower(f't{i}_', x, 0.2, 0.72, bays=5)
        parts += t + spindle(f's{i}_', x, 0.22, top)
    parts += diskettes('d0_', 0.22, 0.04, 0.72, n=6, turn=0.1)
    parts += diskettes('d1_', 0.4, 0.14, 0.72, n=4, turn=-0.15)
    parts += diskettes('d2_', 0.62, 0.02, 0.72, n=3, turn=0.3)
    parts.append(box('out_tray', (0.22, 0.16, 0.05), (0.66, 0.3, 0.745), 'plastic_charcoal', 0.006, 1))
    return parts


def l3():
    # The autoloader: a tall cabinet of bays with input and output spindles and a picker arm on top.
    t, top = tower('t0_', -0.55, 0.15, 0.0, bays=8, W=0.62, D=0.6, bay_h=0.13)
    parts = t
    parts += spindle('in_', -0.73, 0.1, top, h=0.22) + spindle('out_', -0.37, 0.1, top, h=0.1)
    parts += [box('arm_post', (0.05, 0.05, 0.36), (-0.55, 0.35, top + 0.18), 'metal_dark', 0.008, 1),
              box('arm', (0.42, 0.06, 0.05), (-0.55, 0.2, top + 0.34), 'metal_dark', 0.008, 1, rot=(0, 0, 0.4)),
              box('arm_head', (0.08, 0.08, 0.06), (-0.66, 0.08, top + 0.3), BEIGE, 0.01, 1)]
    # The packing table: blanks, labelled stacks and sealed product boxes ready to ship.
    parts += kit.desk('pk_', 0.42, 0.12, W=1.05, D=0.62, H=0.72, top='wood_honey', frame='metal_soft', tray=False)
    parts += diskettes('d0_', 0.1, 0.02, 0.72, n=6, turn=0.1)
    parts += diskettes('d1_', 0.28, 0.1, 0.72, n=4, turn=-0.2)
    for i, (x, col) in enumerate(((0.55, 'fabric_teal'), (0.76, 'fabric_terracotta'))):
        parts += [box(f'box{i}', (0.19, 0.06, 0.25), (x, 0.28, 0.72 + 0.125), col, 0.008, 1),
                  box(f'box{i}_band', (0.15, 0.004, 0.05), (x, 0.248, 0.72 + 0.08), 'paper_sheet', 0)]
    parts += [box('crate', (0.5, 0.4, 0.3), (0.42, 0.12, 0.15), 'wood_honey', 0.01, 1),
              box('crate_label', (0.2, 0.004, 0.1), (0.42, -0.082, 0.18), 'paper_sheet', 0)]
    return parts


reset(); join(l1(), 'disk_duplicator_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'disk_duplicator_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'disk_duplicator_l3'); export(tier_path(3), budget=BUDGET[3])
