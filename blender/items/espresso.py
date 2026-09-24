"""Office shop: espresso. l1 drip pot on a cart, l2 prosumer machine and grinder, l3 chrome bar."""
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
    parts = []
    for z in (0.12, 0.62):
        parts.append(box(f'shelf{z}', (0.7, 0.45, 0.04), (0, 0.1, z), 'wood_honey', bevel=0.012))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(f'post{sx}{sy}', (0.035, 0.035, 0.62), (sx * 0.32, 0.1 + sy * 0.2, 0.37), 'metal_dark', bevel=0.008))
            parts.append(uvsphere(f'wheel{sx}{sy}', 0.04, (sx * 0.32, 0.1 + sy * 0.2, 0.04), 'plastic_charcoal', seg=8, rings=5))
    parts.append(box('dripbase', (0.2, 0.24, 0.05), (-0.12, 0.12, 0.665), 'plastic_charcoal', bevel=0.015))
    parts.append(box('driptower', (0.2, 0.08, 0.32), (-0.12, 0.2, 0.8), 'plastic_charcoal', bevel=0.02))
    parts.append(box('driphead', (0.2, 0.2, 0.06), (-0.12, 0.13, 0.93), 'plastic_charcoal', bevel=0.02))
    parts.append(lathe('carafe', [(0.001, 0.69), (0.07, 0.69), (0.08, 0.74), (0.07, 0.8), (0.05, 0.84), (0.001, 0.84)], (-0.12, 0.08, 0), 'glass_frame', steps=16))
    parts.append(cyl('coffee_in', 0.065, 0.05, (-0.12, 0.08, 0.72), 'coffee', verts=16, bevel=0))
    parts.append(cyl('cups', 0.04, 0.2, (0.18, 0.2, 0.74), 'paper_sheet', verts=12, bevel=0.005))
    parts += kit.mug('m1', 0.12, -0.02, 0.64)
    parts.append(box('box', (0.3, 0.22, 0.16), (0.05, 0.1, 0.22), 'cardboard', bevel=0.01))
    return parts


def l2():
    parts = kit.counter('c_', 0, 0.2, W=1.1)
    parts += kit.espresso_machine('e_', -0.2, 0.2, 0.845, body='metal_soft')
    parts += kit.grinder('g_', 0.2, 0.25, 0.845)
    parts += kit.mug('m1', 0.38, 0.08, 0.845) + kit.mug('m2', 0.44, 0.22, 0.845)
    parts.append(box('knock', (0.12, 0.14, 0.1), (0.35, 0.3, 0.895), 'plastic_charcoal', bevel=0.02))
    return parts


def l3():
    parts = kit.counter('c_', 0, 0.2, W=1.9, body='metal_soft', top='wood_walnut', doors=4)
    parts += kit.espresso_machine('e_', -0.35, 0.22, 0.845, s=1.15, body='metal_soft', groups=2)
    parts += kit.grinder('g1', 0.3, 0.28, 0.845, s=1.1, body='metal_dark')
    parts += kit.grinder('g2', 0.5, 0.28, 0.845, s=1.1, body='metal_dark')
    # Back shelf with a row of cups and a tiny sign
    parts.append(box('backshelf', (1.7, 0.18, 0.035), (0, 0.42, 1.55), 'wood_walnut', bevel=0.01))
    for sx in (-0.7, 0.7):
        parts.append(box(f'bracket{sx}', (0.03, 0.14, 0.12), (sx, 0.44, 1.49), 'metal_dark', bevel=0.006))
    for i in range(7):
        parts.append(cyl(f'sm{i}', 0.038, 0.09, (-0.6 + i * 0.2, 0.4, 1.612), 'mug' if i % 3 else 'fabric_teal', verts=10, bevel=0))
    parts.append(box('menu', (0.5, 0.03, 0.34), (0.5, 0.47, 1.9), 'plastic_charcoal', bevel=0.012))
    for i in range(3):
        parts.append(box(f'menul{i}', (0.3 - i * 0.05, 0.004, 0.02), (0.45, 0.452, 1.98 - i * 0.07), 'paper', bevel=0))
    parts += kit.stool('s1', -0.55, -0.55) + kit.stool('s2', 0.25, -0.55)
    return parts


for lvl, fn in ((1, l1), (2, l2), (3, l3)):
    build(lvl, fn, 'espresso')
