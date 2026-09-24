"""Server rack with six units; rack_led_00..11 are separate so the game can blink them."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, D, H = 0.6, 0.68, 1.56
parts = [
    box('body', (W, D, H - 0.06), (0, 0, 0.06 + (H - 0.06) / 2), 'plastic_charcoal', bevel=0.03),
    box('plinth', (W - 0.06, D - 0.06, 0.07), (0, 0, 0.035), 'metal_dark', bevel=0.01),
    box('cap', (W - 0.08, D - 0.08, 0.03), (0, 0, H + 0.005), 'metal_dark', bevel=0.01),
]
for i in range(6):
    z = 0.25 + i * 0.205
    parts.append(box(f'unit{i}', (W - 0.1, 0.03, 0.17), (0, -D / 2 - 0.005, z), 'metal_dark' if i % 2 else 'metal_soft', bevel=0.008))
    for v in range(5):
        parts.append(box(f'vent{i}{v}', (0.018, 0.006, 0.1), (-0.05 + v * 0.035, -D / 2 - 0.022, z), 'plastic_charcoal', bevel=0))
    parts.append(box(f'handle{i}', (0.025, 0.02, 0.08), (W / 2 - 0.08, -D / 2 - 0.028, z), 'metal_soft', bevel=0.006))
join(parts, 'server_rack')
for i in range(6):
    z = 0.25 + i * 0.205
    for j in range(2):
        box(f'rack_led_{i * 2 + j:02d}', (0.028, 0.012, 0.028), (-W / 2 + 0.1 + j * 0.05, -D / 2 - 0.024, z + 0.04), 'led', bevel=0)
export()
