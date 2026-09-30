"""A small compliance seal with a single checkmark and dark lettering."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = [box('sticker', (0.34, 0.007, 0.19), (0, 0, 0.095), 'wall_sage', 0.012),
         lettering('year', 'Y2K', (0.025, -0.005, 0.128), 0.065),
         lettering('compliant', 'COMPLIANT', (0, -0.005, 0.058), 0.043)]
for i, (x, z, w, angle) in enumerate(((-0.122, 0.122, 0.032, -0.7), (-0.096, 0.135, 0.055, 0.8))):
    parts.append(box(f'check_{i}', (w, 0.004, 0.012), (x, -0.006, z), 'wood_dark', 0.003, segments=1, rot=(0, -angle, 0)))
finish(parts, 'era_y2k_sticker')
