"""Stacked optical media on a sturdy spindle with one cool reflection."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = [cyl('base', 0.115, 0.026, (0, 0, 0.013), 'plastic_charcoal', verts=16, bevel=0.006, segments=1)]
for i in range(4):
    parts.append(cyl(f'disc_{i}', 0.104, 0.012, (0, 0, 0.034 + i * 0.016), 'metal_soft' if i % 2 else 'glass', verts=16, bevel=0.002, segments=1))
parts += [cyl('hub', 0.027, 0.12, (0, 0, 0.079), 'wall_cream', verts=12, bevel=0.005, segments=1),
          box('reflection', (0.060, 0.013, 0.003), (-0.049, 0.01, 0.090), 'paper_sheet', 0.003, segments=1)]
finish(parts, 'era_cd_spindle', budget=1100)
