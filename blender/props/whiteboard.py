"""Mobile whiteboard with marker scribbles, sticky notes, and a marker tray."""
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
rnd = random.Random(4)
W, H, Z = 1.4, 0.85, 1.0
parts = [
    box('board', (W, 0.04, H), (0, 0, Z), 'whiteboard', bevel=0.01),
    box('frame_t', (W + 0.04, 0.05, 0.035), (0, 0, Z + H / 2), 'metal_soft', bevel=0.012),
    box('frame_b', (W + 0.04, 0.05, 0.035), (0, 0, Z - H / 2), 'metal_soft', bevel=0.012),
    box('frame_l', (0.035, 0.05, H), (-W / 2, 0, Z), 'metal_soft', bevel=0.012),
    box('frame_r', (0.035, 0.05, H), (W / 2, 0, Z), 'metal_soft', bevel=0.012),
    box('tray', (0.6, 0.08, 0.02), (0, -0.05, Z - H / 2 - 0.01), 'metal_soft', bevel=0.006),
]
for sx in (-1, 1):
    parts.append(box(f'post{sx}', (0.04, 0.04, Z + H / 2 - 0.05), (sx * (W / 2 + 0.03), 0.03, (Z + H / 2 - 0.05) / 2 + 0.05), 'metal_soft', bevel=0.012))
    parts.append(box(f'foot{sx}', (0.06, 0.5, 0.04), (sx * (W / 2 + 0.03), 0.03, 0.07), 'metal_soft', bevel=0.015))
    for sy in (-1, 1):
        parts.append(uvsphere(f'wheel{sx}{sy}', 0.035, (sx * (W / 2 + 0.03), 0.03 + sy * 0.22, 0.035), 'plastic_charcoal', seg=10, rings=6))
fy = -0.021
# Scribbled boxes and arrows, like a system diagram
for i, (x, z, w, h, c) in enumerate([(-0.42, 1.2, 0.28, 0.15, 'marker_blue'), (0.0, 1.2, 0.28, 0.15, 'marker_green'), (-0.2, 0.9, 0.32, 0.15, 'marker_blue')]):
    for j, (dx, dz, sw, sh) in enumerate([(0, h / 2, w, 0.012), (0, -h / 2, w, 0.012), (-w / 2, 0, 0.012, h), (w / 2, 0, 0.012, h)]):
        parts.append(box(f'r{i}{j}', (sw, 0.004, sh), (x + dx, fy, z + dz), c, bevel=0))
parts.append(box('arrow1', (0.16, 0.004, 0.012), (-0.21, fy, 1.2), 'marker_orange', bevel=0))
parts.append(box('arrow2', (0.012, 0.004, 0.16), (-0.2, fy, 1.05), 'marker_orange', bevel=0))
for i in range(4):
    parts.append(box(f'line{i}', (rnd.uniform(0.12, 0.3), 0.004, 0.01), (0.42, fy, 1.3 - i * 0.07), 'marker_blue' if i else 'marker_orange', bevel=0))
for i, (x, z, c) in enumerate([(0.35, 0.92, 'rug_mustard'), (0.5, 0.87, 'fabric_sage'), (0.44, 0.76, 'role_designer')]):
    parts.append(box(f'note{i}', (0.1, 0.006, 0.1), (x, fy - 0.002, z), c, bevel=0, rot=(0, rnd.uniform(-0.15, 0.15), 0)))
for i, c in enumerate(['marker_blue', 'marker_green', 'marker_orange']):
    parts.append(cyl(f'marker{i}', 0.01, 0.12, (-0.12 + i * 0.07, -0.06, Z - H / 2 + 0.01), c, verts=8, bevel=0, rot=(0, math.pi / 2, 0)))
join(parts, 'whiteboard')
export()
