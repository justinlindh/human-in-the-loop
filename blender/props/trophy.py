"""Award trophy: walnut plinth with a gold cup and handles."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
parts = [
    box('plinth', (0.2, 0.2, 0.08), (0, 0, 0.04), 'wood_walnut', bevel=0.012),
    box('plinth2', (0.15, 0.15, 0.05), (0, 0, 0.105), 'wood_walnut', bevel=0.01),
    box('plaque', (0.1, 0.005, 0.04), (0, -0.1, 0.04), 'gold', bevel=0),
    lathe('cup', [(0.001, 0.13), (0.05, 0.13), (0.05, 0.145), (0.015, 0.16), (0.015, 0.22), (0.03, 0.24), (0.075, 0.28), (0.1, 0.36), (0.105, 0.4), (0.095, 0.4), (0.001, 0.33)], (0, 0, 0), 'gold', steps=24),
]
for sx in (-1, 1):
    parts.append(torus(f'handle{sx}', 0.045, 0.011, (sx * 0.1, 0, 0.33), 'gold', rot=(math.pi / 2, 0, 0), major_seg=14, minor_seg=6))
parts.append(box('star', (0.04, 0.005, 0.04), (0, -0.09, 0.31), 'paper', bevel=0, rot=(0, math.pi / 4, 0)))
join(parts, 'trophy')
export()
