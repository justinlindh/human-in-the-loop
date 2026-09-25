'''Foosball table: a wooden cabinet on legs, a green pitch, four rods with little players in two team colors.
Each rod with its handle and players is its own object, foosball_rod0..3, with its origin on the rod
axis, so the game can spin and slide it; the rest is one static object.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
L, W, H = 0.9, 0.55, 0.58
parts = [
    box('cab', (L, W, 0.16), (0, 0, H - 0.08), 'wood_honey', bevel=0.02),
    # The field sits clearly above the cabinet top (no shared depth), inside a low rim.
    box('pitch', (L - 0.08, W - 0.08, 0.008), (0, 0, H + 0.006), 'leaf_dark', bevel=0),
    box('line', (0.012, W - 0.12, 0.003), (0, 0, H + 0.0115), 'paper', bevel=0),
]
for sy in (-1, 1):
    parts.append(box(f'rim_y{sy}', (L, 0.035, 0.05), (0, sy * (W / 2 - 0.0175), H + 0.025), 'wood_honey', bevel=0.008, segments=1))
for sx in (-1, 1):
    parts.append(box(f'rim_x{sx}', (0.035, W - 0.07, 0.05), (sx * (L / 2 - 0.0175), 0, H + 0.025), 'wood_honey', bevel=0.008, segments=1))
for sx in (-1, 1):
    parts.append(box(f'goal{sx}', (0.02, 0.16, 0.045), (sx * (L / 2 - 0.036), 0, H + 0.03), 'plastic_charcoal', bevel=0.006))
    for sy in (-1, 1):
        parts.append(box(f'leg{sx}{sy}', (0.06, 0.06, H - 0.16), (sx * (L / 2 - 0.08), sy * (W / 2 - 0.08), (H - 0.16) / 2), 'wood_dark', bevel=0.012))
join(parts, 'foosball')
# Rods run across the table and stick out both long sides; handles alternate by team.
xs = [-0.3, -0.1, 0.1, 0.3]
for i, x in enumerate(xs):
    team = 'fabric_mustard' if i % 2 == 0 else 'fabric_teal'
    rod = [cyl(f'rod{i}', 0.008, W + 0.3, (x, 0, H + 0.06), 'metal_soft', verts=8, bevel=0, rot=(math.pi / 2, 0, 0))]
    side = -1 if i % 2 == 0 else 1
    rod.append(cyl(f'handle{i}', 0.022, 0.1, (x, side * (W / 2 + 0.12), H + 0.06), 'plastic_charcoal', verts=10, bevel=0.006, rot=(math.pi / 2, 0, 0)))
    n = 2 if i in (0, 3) else 3
    for k in range(n):
        y = (k - (n - 1) / 2) * 0.14
        rod.append(box(f'man{i}{k}', (0.03, 0.035, 0.07), (x, y, H + 0.05), team, bevel=0.008, segments=1))
        rod.append(sphere(f'head{i}{k}', 0.018, (x, y, H + 0.095), 'paper', subdiv=1))
    o = join(rod, f'foosball_rod{i}')
    # Origin on the rod axis: the game turns the rod about it.
    bpy.context.scene.cursor.location = (x, 0, H + 0.06)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.context.scene.cursor.location = (0, 0, 0)
require_parts([f'foosball_rod{i}' for i in range(4)])
export()
