"""Agent monitoring wall: big display on posts over a low console. wall_screen is a UV'd quad
(pal_screen); wall_led_0..2 are status LEDs."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, H, Z = 2.3, 1.2, 1.38
parts = [
    box('bezel', (W, 0.08, H), (0, 0.06, Z), 'plastic_charcoal', bevel=0.025),
    box('back', (W - 0.4, 0.1, H - 0.4), (0, 0.13, Z), 'metal_dark', bevel=0.03),
    box('console', (W - 0.3, 0.5, 0.6), (0, -0.18, 0.3), 'plastic_charcoal', bevel=0.03),
    box('console_top', (W - 0.26, 0.54, 0.04), (0, -0.18, 0.61), 'wood_walnut', bevel=0.015),
    box('console_face', (W - 0.5, 0.02, 0.36), (0, -0.44, 0.3), 'metal_dark', bevel=0.01),
]
for sx in (-1, 1):
    parts.append(box(f'post{sx}', (0.08, 0.08, Z - H / 2 + 0.1), (sx * (W / 2 - 0.3), 0.13, (Z - H / 2 + 0.1) / 2), 'metal_dark', bevel=0.015))
for i in range(3):
    parts.append(box(f'kbd{i}', (0.36, 0.14, 0.02), (-0.7 + i * 0.7, -0.26, 0.64), 'metal_soft', bevel=0.006))
join(parts, 'monitoring_wall')
plane('wall_screen', W - 0.1, H - 0.1, (0, 0.018, Z), 'screen')
for i in range(3):
    box(f'wall_led_{i}', (0.035, 0.012, 0.035), (-0.3 + i * 0.3, -0.455, 0.42), 'led', bevel=0)
export()
