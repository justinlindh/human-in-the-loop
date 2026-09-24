"""Office shop: standing_desk. l1 box on a desk, l2 motorized desk, l3 treadmill desk."""
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
    parts = kit.desk('d_', 0, 0.1, W=1.2)
    parts.append(box('box', (0.46, 0.34, 0.26), (0.05, 0.12, 0.75), 'cardboard', bevel=0.012))
    parts.append(box('tape', (0.46, 0.06, 0.004), (0.05, 0.12, 0.882), 'wood_light', bevel=0))
    parts += kit.laptop('l_', 0.05, 0.1, 0.88, screen='standing_screen')
    parts += kit.mug('m', -0.45, 0.0, 0.62)
    return parts


def motor_desk(z0=0.0, H=0.82):
    W, D, T = 1.35, 0.72, 0.05
    parts = [box('top', (W, D, T), (0, 0.1, z0 + H - T / 2), 'wood_light', bevel=0.02, segments=3)]
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.16)
        parts += [
            box(f'col_lo{sx}', (0.08, 0.06, 0.4), (x, 0.1, z0 + 0.22), 'metal_dark', bevel=0.012),
            box(f'col_hi{sx}', (0.065, 0.048, H - 0.42), (x, 0.1, z0 + 0.42 + (H - 0.47) / 2), 'metal_soft', bevel=0.01),
            box(f'foot{sx}', (0.08, D - 0.04, 0.05), (x, 0.1, z0 + 0.025), 'metal_dark', bevel=0.015),
        ]
    parts.append(box('beam', (W - 0.3, 0.06, 0.05), (0, 0.1, z0 + H - T - 0.04), 'metal_dark', bevel=0.01))
    parts.append(box('keypad', (0.12, 0.05, 0.03), (0.45, 0.1 - D / 2 - 0.01, z0 + H - T - 0.02), 'plastic_charcoal', bevel=0.008))
    parts += kit.monitor('m_', 0, 0.3, z0 + H, screen='standing_screen')
    parts += kit.pot_plant('pp', -0.52, 0.25, pot='pot_cream', s=0.45, seed=6, z=z0 + H)
    return parts


def l2():
    parts = motor_desk()
    parts.append(box('mat', (0.9, 0.5, 0.02), (0, -0.45, 0.01), 'plastic_charcoal', bevel=0.01))
    return parts


def l3():
    base = 0.14
    parts = motor_desk(z0=0.0, H=0.82 + base)
    parts += [
        box('tread_frame', (0.8, 1.2, 0.12), (0, -0.55, 0.06), 'metal_soft', bevel=0.03),
        box('belt', (0.62, 1.1, 0.02), (0, -0.55, 0.125), 'plastic_charcoal', bevel=0.006),
        box('motor', (0.8, 0.22, 0.16), (0, 0.02, 0.08), 'plastic_charcoal', bevel=0.03),
    ]
    for sx in (-1, 1):
        parts.append(box(f'rail{sx}', (0.035, 0.8, 0.035), (sx * 0.36, -0.55, 0.2), 'metal_soft', bevel=0.01))
    return parts


reset(); join(l1(), 'standing_desk_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'standing_desk_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'standing_desk_l3'); box('standing_desk_led', (0.08, 0.01, 0.03), (0, -0.01, 0.12), 'led', bevel=0); export(tier_path(3), budget=BUDGET[3])
