'''Roll-up garage door set into a frame; fits a 2.7 m wide wall opening. Faces -Y.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, H, T = 2.4, 1.95, 0.1
parts = [
    box('jamb_l', (0.12, T + 0.06, H + 0.12), (-W / 2 - 0.06, 0, (H + 0.12) / 2), 'wood_light', bevel=0.015),
    box('jamb_r', (0.12, T + 0.06, H + 0.12), (W / 2 + 0.06, 0, (H + 0.12) / 2), 'wood_light', bevel=0.015),
    box('header', (W + 0.24, T + 0.06, 0.14), (0, 0, H + 0.07), 'wood_light', bevel=0.015),
    box('housing', (W, 0.22, 0.2), (0, 0.12, H - 0.1), 'metal_dark', bevel=0.03),
]
n = 6
ph = (H - 0.2) / n
for i in range(n):
    z = 0.02 + ph * (i + 0.5)
    parts.append(box(f'panel{i}', (W - 0.02, 0.05, ph - 0.012), (0, 0, z), 'metal_soft', bevel=0.012))
    parts.append(box(f'rib{i}', (W - 0.1, 0.012, 0.03), (0, -0.03, z), 'metal_soft', bevel=0.004, segments=1))
parts.append(box('handle', (0.3, 0.05, 0.04), (0, -0.05, 0.3), 'metal_dark', bevel=0.012))
parts.append(box('bottom_seal', (W - 0.02, 0.07, 0.03), (0, 0, 0.015), 'plastic_charcoal', bevel=0.008))
join(parts, 'garage_door')
export()
