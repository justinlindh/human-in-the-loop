"""Small floor plant: cream pot with a round leafy bush."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
parts = [
    lathe('pot', [(0.001, 0), (0.12, 0), (0.13, 0.015), (0.15, 0.2), (0.165, 0.22), (0.16, 0.24), (0.14, 0.23), (0.001, 0.23)], (0, 0, 0), 'pot_cream', steps=20),
    cyl('soil', 0.135, 0.015, (0, 0, 0.225), 'soil', verts=16, bevel=0.006),
]
for i, (loc, r, m) in enumerate([((0, 0, 0.36), 0.18, 'leaf'), ((0.09, -0.06, 0.3), 0.12, 'leaf_light'), ((-0.08, 0.05, 0.31), 0.13, 'leaf_dark')]):
    o = sphere(f'leaf{i}', r, loc, m, subdiv=2, scale=(1, 1, 0.85))
    displace_noise(o, strength=r * 0.3, size=0.2, seed=i + 7)
    parts.append(o)
join(parts, 'plant_small')
export()
