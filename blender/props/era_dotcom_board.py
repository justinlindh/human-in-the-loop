"""A static boom and bust graph, with the turning point impossible to miss."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = frame('market', 1.24, 0.76)
parts += [lettering('title', 'BOOM / BUST', (0, -0.078, 0.61), 0.12),
          box('axis', (0.98, 0.01, 0.016), (0, -0.08, 0.17), 'wood_dark', 0.003, segments=1)]
points = [(-0.45, 0.23), (-0.20, 0.30), (0.02, 0.49), (0.17, 0.23), (0.43, 0.19)]
for i, ((x, z), (xx, zz)) in enumerate(zip(points, points[1:])):
    parts.append(box(f'graph_{i}', (math.hypot(xx-x, zz-z), 0.016, 0.025), ((x+xx)/2, -0.083, (z+zz)/2), 'fabric_teal' if i < 2 else 'wood_dark', 0.006, segments=1, rot=(0, -math.atan2(zz-z, xx-x), 0)))
parts.append(cyl('peak_pin', 0.034, 0.018, (0.02, -0.098, 0.49), 'fabric_mustard', verts=12, bevel=0.003, segments=1, rot=(math.pi/2, 0, 0)))
finish(parts, 'era_dotcom_board')
