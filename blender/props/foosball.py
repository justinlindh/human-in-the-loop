'''Foosball table: a wooden cabinet on legs, a green pitch, four rods with little players in two team colors.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
L, W, H = 0.9, 0.55, 0.58
parts = [
    box('cab', (L, W, 0.16), (0, 0, H - 0.08), 'wood_honey', bevel=0.02),
    box('pitch', (L - 0.08, W - 0.08, 0.01), (0, 0, H - 0.005), 'leaf_dark', bevel=0),
    box('line', (0.01, W - 0.1, 0.002), (0, 0, H + 0.002), 'paper', bevel=0),
]
for sx in (-1, 1):
    parts.append(box(f'goal{sx}', (0.03, 0.16, 0.06), (sx * (L / 2 - 0.02), 0, H - 0.02), 'plastic_charcoal', bevel=0.008))
    for sy in (-1, 1):
        parts.append(box(f'leg{sx}{sy}', (0.06, 0.06, H - 0.16), (sx * (L / 2 - 0.08), sy * (W / 2 - 0.08), (H - 0.16) / 2), 'wood_dark', bevel=0.012))
# Rods run across the table and stick out both long sides; handles alternate by team.
xs = [-0.3, -0.1, 0.1, 0.3]
for i, x in enumerate(xs):
    team = 'fabric_mustard' if i % 2 == 0 else 'fabric_teal'
    parts.append(cyl(f'rod{i}', 0.008, W + 0.3, (x, 0, H + 0.03), 'metal_soft', verts=8, bevel=0, rot=(math.pi / 2, 0, 0)))
    side = -1 if i % 2 == 0 else 1
    parts.append(cyl(f'handle{i}', 0.022, 0.1, (x, side * (W / 2 + 0.12), H + 0.03), 'plastic_charcoal', verts=10, bevel=0.006, rot=(math.pi / 2, 0, 0)))
    n = 2 if i in (0, 3) else 3
    for k in range(n):
        y = (k - (n - 1) / 2) * 0.14
        parts.append(box(f'man{i}{k}', (0.03, 0.035, 0.07), (x, y, H + 0.02), team, bevel=0.008, segments=1))
        parts.append(sphere(f'head{i}{k}', 0.018, (x, y, H + 0.065), 'paper', subdiv=1))
join(parts, 'foosball')
export()
