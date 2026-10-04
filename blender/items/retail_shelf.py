"""Office shop: retail_shelf. l1 a display table of boxed software, l2 a store endcap of face-out
boxes under a header, l3 a double endcap with a lit header and a giant cardboard box standee.
Each box is one colour with loud front art (sun, stripe, title band), as on era_retail_boxes.
Palette materials only, so the batch draws them in buckets the office already has."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

# Shop item tiers share one footprint: back edge near y = +0.5 (against a wall), front faces -Y.
BUDGET = {1: 3000, 2: 4000, 3: 6000}
COLOURS = ['fabric_slate', 'fabric_teal', 'fabric_terracotta', 'fabric_mustard', 'plastic_charcoal']
ACCENT = {'fabric_slate': 'fabric_mustard', 'fabric_teal': 'fabric_mustard', 'fabric_terracotta': 'fabric_teal',
          'fabric_mustard': 'fabric_terracotta', 'plastic_charcoal': 'fabric_teal'}


def boxed(p, x, y, z, i, W=0.2, D=0.06, H=0.27, lean=0.0):
    """A face-out software box standing at (x, y, z), front toward -Y, tipped back by lean."""
    col = COLOURS[i % len(COLOURS)]
    acc = ACCENT[col]
    c, s = math.cos(lean), math.sin(lean)

    def on(dx, dz, out):
        return (x + dx, y - D / 2 - out * c + dz * s, z + dz * c + out * s)

    rot = (-lean, 0, 0)
    parts = [box(f'{p}body', (W, D, H), on(0, H / 2, -D / 2), col, 0.006, 1, rot=rot)]
    if i % 2:
        parts.append(cyl(f'{p}sun', W * 0.28, 0.004, on(W * 0.12, H * 0.66, 0.003), acc, verts=10, bevel=0,
                         rot=(math.pi / 2 - lean, 0, 0)))
    else:
        parts.append(box(f'{p}stripe', (W * 1.0, 0.004, H * 0.14), on(0, H * 0.6, 0.003), acc, 0, rot=(-lean, 0.5, 0)))
    parts.append(box(f'{p}title', (W * 0.82, 0.004, H * 0.2), on(0, H * 0.2, 0.004), 'paper_sheet', 0, rot=rot))
    parts.append(box(f'{p}type', (W * 0.55, 0.003, H * 0.05), on(-W * 0.06, H * 0.22, 0.007), 'ink', 0, rot=rot))
    return parts


def flat_stack(p, x, y, z, n, start, turn=0.0):
    """Boxes lying flat, the top one showing its cover."""
    parts = []
    for k in range(n):
        col = COLOURS[(start + k) % len(COLOURS)]
        parts.append(box(f'{p}{k}', (0.2, 0.27, 0.06), (x, y, z + 0.03 + k * 0.061), col, 0.006, 1,
                         rot=(0, 0, turn + (0.05 if k % 2 else -0.03))))
    top = z + n * 0.061 + 0.002
    parts.append(box(f'{p}band', (0.16, 0.06, 0.003), (x, y - 0.08, top), 'paper_sheet', 0, rot=(0, 0, turn)))
    return parts


def gondola(p, x, W=1.0, H=1.55, shelves=(0.12, 0.55, 0.98), header='fabric_terracotta', start=0):
    """A store endcap: back panel, shelves with lips and a header, filled with face-out boxes."""
    y = 0.28
    parts = [box(f'{p}back', (W - 0.06, 0.05, H - 0.1), (x, y + 0.14, 0.1 + (H - 0.1) / 2), 'metal_dark', 0.01, 1),
             box(f'{p}base', (W - 0.06, 0.36, 0.1), (x, y, 0.05), 'metal_dark', 0.01, 1)]
    for sx in (-1, 1):
        parts.append(box(f'{p}side{sx}', (0.03, 0.34, H - 0.004), (x + sx * (W / 2 - 0.015), y, H / 2 + 0.002), 'metal_soft', 0.006, 1))
    per = max(2, int((W - 0.1) / 0.23))
    n = start
    for r, sz in enumerate(shelves):
        parts += [box(f'{p}shelf{r}', (W - 0.06, 0.32, 0.025), (x, y, sz), 'metal_soft', 0.004, 1),
                  box(f'{p}lip{r}', (W - 0.06, 0.012, 0.04), (x, y - 0.16, sz + 0.012), 'fabric_mustard', 0)]
        for k in range(per):
            bx = x + (k - (per - 1) / 2) * ((W - 0.1) / per)
            parts += boxed(f'{p}b{r}{k}', bx, y - 0.02, sz + 0.0125, n, lean=0.08)
            n += 1
    parts += [box(f'{p}header', (W + 0.04, 0.08, 0.26), (x, y + 0.1, H + 0.13), header, 0.012, 1),
              box(f'{p}header_band', (W * 0.7, 0.004, 0.09), (x, y + 0.058, H + 0.13), 'paper_sheet', 0),
              box(f'{p}header_type', (W * 0.5, 0.004, 0.035), (x, y + 0.054, H + 0.13), 'ink', 0)]
    return parts


def l1():
    parts = kit.desk('tbl_', 0, 0.12, W=1.3, D=0.62, H=0.72, top='wood_honey', frame='wood_dark', tray=False)
    parts.append(box('riser', (0.9, 0.18, 0.1), (0, 0.32, 0.77), 'wood_dark', 0.01, 1))
    for k, x in enumerate((-0.3, 0.0, 0.3)):
        parts += boxed(f'up{k}_', x, 0.33, 0.82, k, lean=0.12)
    parts += flat_stack('fa_', -0.38, 0.0, 0.72, 3, 1, turn=0.08)
    parts += flat_stack('fb_', 0.36, -0.02, 0.72, 2, 3, turn=-0.1)
    return parts


def l2():
    parts = gondola('g_', 0, W=1.5)
    parts += flat_stack('fa_', -0.45, -0.22, 0.0, 4, 2, turn=0.1)
    parts += flat_stack('fb_', 0.45, -0.22, 0.0, 3, 0, turn=-0.12)
    return parts


def l3():
    parts = gondola('ga_', -0.49, W=0.95, header='fabric_teal', start=0)
    parts += gondola('gb_', 0.49, W=0.95, header='fabric_terracotta', start=3)
    # The lit sign bridging both endcaps.
    parts += [box('bridge', (1.95, 0.06, 0.08), (0, 0.38, 1.98), 'metal_dark', 0.01, 1)]
    parts += boxed('standee_', 0.62, -0.18, 0.0, 3, W=0.42, D=0.14, H=0.62, lean=0.0)
    parts += flat_stack('fa_', -0.6, -0.22, 0.0, 4, 1, turn=0.1)
    return parts


def l3_lights():
    return [box('retail_shelf_header_glow', (1.8, 0.02, 0.025), (0, 0.33, 1.93), 'lamp', bevel=0)]


reset(); join(l1(), 'retail_shelf_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'retail_shelf_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'retail_shelf_l3'); l3_lights(); export(tier_path(3), budget=BUDGET[3])
