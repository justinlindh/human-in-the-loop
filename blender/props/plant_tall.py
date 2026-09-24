"""Tall floor plant: terracotta pot, curved stems, lumpy leaf clusters."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
parts = [
    lathe('pot', [(0.001, 0), (0.17, 0), (0.19, 0.02), (0.22, 0.34), (0.245, 0.35), (0.25, 0.4), (0.225, 0.41), (0.205, 0.38), (0.001, 0.38)], (0, 0, 0), 'pot_terracotta', steps=24),
    cyl('soil', 0.2, 0.02, (0, 0, 0.37), 'soil', verts=20, bevel=0.006),
]
stems = [((0, 0, 0.38), (0.05, -0.02, 1.2), 0.025), ((0, 0, 0.38), (-0.18, 0.08, 0.95), 0.02), ((0, 0, 0.38), (0.16, 0.12, 0.8), 0.018)]
for i, (a, b, r) in enumerate(stems):
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = cyl(f'stem{i}', r, L, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), 'wood_dark', verts=8, bevel=0,
            rot=(-math.atan2(dy, dz), math.atan2(dx, math.sqrt(dy * dy + dz * dz)), 0))
    parts.append(o)
clusters = [((0.05, -0.02, 1.28), 0.3, 'leaf'), ((-0.2, 0.08, 1.0), 0.26, 'leaf_dark'), ((0.18, 0.12, 0.86), 0.22, 'leaf'),
            ((0.12, -0.1, 1.05), 0.2, 'leaf_light'), ((-0.08, -0.08, 1.45), 0.18, 'leaf_light')]
for i, (loc, r, m) in enumerate(clusters):
    o = sphere(f'leaf{i}', r, loc, m, subdiv=2, scale=(1, 1, 0.82))
    displace_noise(o, strength=r * 0.35, size=0.25, seed=i + 1)
    parts.append(o)
join(parts, 'plant_tall')
export()
