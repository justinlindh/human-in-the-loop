"""Two-seat lounge couch with plump cushions, a throw pillow, and wooden legs."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, D = 1.7, 0.82
parts = [box('base', (W, D, 0.22), (0, 0, 0.23), 'fabric_teal', bevel=0.05, segments=3)]
for sx in (-1, 1):
    parts.append(box(f'arm{sx}', (0.18, D, 0.44), (sx * (W / 2 - 0.09), 0, 0.34), 'fabric_teal', bevel=0.07, segments=3))
    parts.append(box(f'seat{sx}', ((W - 0.36) / 2 - 0.01, D - 0.22, 0.14), (sx * (W - 0.36) / 4, -0.08, 0.41), 'fabric_teal', bevel=0.06, segments=3))
    parts.append(box(f'back{sx}', ((W - 0.36) / 2 - 0.01, 0.2, 0.42), (sx * (W - 0.36) / 4, D / 2 - 0.13, 0.55), 'fabric_teal', bevel=0.08, segments=3, rot=(math.radians(-10), 0, 0)))
    for sy in (-1, 1):
        parts.append(cyl(f'leg{sx}{sy}', 0.03, 0.12, (sx * (W / 2 - 0.1), sy * (D / 2 - 0.1), 0.06), 'wood_dark', verts=8, bevel=0, r2=0.022))
parts.append(box('pillow', (0.3, 0.12, 0.3), (-0.5, 0.12, 0.62), 'fabric_mustard', bevel=0.06, segments=3, rot=(math.radians(-18), math.radians(10), 0)))
join(parts, 'couch')
export()
