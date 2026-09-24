'''Rolling waffle station: a steel cart on casters with a waffle iron, a tall stack of waffles,
syrup, whipped cream, and a bowl of berries. Front faces -Y.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
W, D, H = 0.9, 0.5, 0.82
parts = [
    box('top', (W, D, 0.04), (0, 0, H - 0.02), 'metal_soft', bevel=0.012),
    box('shelf', (W - 0.06, D - 0.06, 0.03), (0, 0, 0.2), 'metal_soft', bevel=0.01),
    box('skirt', (W, 0.02, 0.12), (0, -D / 2 + 0.01, H - 0.1), 'role_designer', bevel=0.008),
    box('handle', (0.03, 0.03, 0.3), (W / 2 + 0.04, 0, H + 0.02), 'metal_dark', bevel=0.008),
]
for sx in (-1, 1):
    for sy in (-1, 1):
        parts.append(cyl(f'post{sx}{sy}', 0.018, H - 0.1, (sx * (W / 2 - 0.04), sy * (D / 2 - 0.04), 0.1 + (H - 0.1) / 2 - 0.02), 'metal_dark', verts=8, bevel=0))
        parts.append(uvsphere(f'wheel{sx}{sy}', 0.045, (sx * (W / 2 - 0.04), sy * (D / 2 - 0.04), 0.045), 'plastic_charcoal', seg=10, rings=6))
top = H
# Waffle iron with the lid up.
parts += [
    box('iron_base', (0.26, 0.26, 0.07), (-0.25, 0.05, top + 0.035), 'plastic_charcoal', bevel=0.02),
    box('iron_plate', (0.22, 0.22, 0.012), (-0.25, 0.05, top + 0.076), 'metal_dark', bevel=0),
    box('iron_lid', (0.26, 0.05, 0.24), (-0.25, 0.2, top + 0.17), 'plastic_charcoal', bevel=0.02, rot=(math.radians(-12), 0, 0)),
]
# Waffle stack on a plate.
parts.append(cyl('plate', 0.13, 0.015, (0.12, -0.02, top + 0.008), 'paper', verts=20, bevel=0.004))
for k in range(6):
    parts.append(box(f'waffle{k}', (0.17, 0.17, 0.028), (0.12 + (k % 2) * 0.008, -0.02, top + 0.03 + k * 0.03), 'wood_honey', bevel=0.008, segments=1, rot=(0, 0, 0.12 * k)))
parts.append(uvsphere('cream', 0.06, (0.12, -0.02, top + 0.22), 'paper', seg=12, rings=8, scale=(1, 1, 0.8)))
parts.append(uvsphere('berry', 0.018, (0.13, -0.03, top + 0.265), 'fabric_terracotta', seg=8, rings=5))
# Syrup bottle and a bowl of berries.
parts += [
    cyl('syrup', 0.035, 0.15, (0.34, 0.12, top + 0.075), 'wood_walnut', verts=12, bevel=0.01),
    cyl('syrup_cap', 0.02, 0.03, (0.34, 0.12, top + 0.165), 'fabric_mustard', verts=10, bevel=0.005),
    cyl('bowl', 0.07, 0.05, (0.34, -0.12, top + 0.025), 'pot_cream', verts=16, bevel=0.012, r2=0.05),
]
for k in range(5):
    a = k * 1.3
    parts.append(uvsphere(f'bb{k}', 0.017, (0.34 + math.cos(a) * 0.03, -0.12 + math.sin(a) * 0.03, top + 0.056), 'role_engineer' if k % 2 else 'fabric_terracotta', seg=8, rings=5))
# A little sign on a stick.
parts.append(cyl('signpost', 0.006, 0.26, (-0.4, -0.15, top + 0.13), 'metal_dark', verts=6, bevel=0))
parts.append(box('sign', (0.16, 0.012, 0.1), (-0.4, -0.155, top + 0.28), 'paper_sheet', bevel=0.004))
join(parts, 'waffle_station')
export()
