"""Kitchenette counter with an espresso machine, mugs, and a status LED (coffee_led)."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, D, H = 0.95, 0.56, 0.82
parts = [
    box('cabinet', (W, D - 0.04, H - 0.06), (0, 0.02, 0.04 + (H - 0.06) / 2), 'laminate', bevel=0.02),
    box('kick', (W - 0.06, D - 0.1, 0.06), (0, 0.05, 0.03), 'wood_walnut', bevel=0.008),
    box('counter', (W + 0.04, D + 0.02, 0.05), (0, 0, H), 'wood_honey', bevel=0.018),
]
for sx in (-1, 1):
    parts.append(box(f'door{sx}', (W / 2 - 0.03, 0.02, H - 0.16), (sx * W / 4, -D / 2 + 0.005, 0.07 + (H - 0.16) / 2), 'laminate', bevel=0.012))
    parts.append(box(f'knob{sx}', (0.012, 0.03, 0.12), (sx * 0.05, -D / 2 - 0.012, H - 0.18), 'wood_dark', bevel=0.005))
top = H + 0.025
mx = -0.15
parts += [
    box('m_body', (0.34, 0.32, 0.44), (mx, 0.05, top + 0.22), 'plastic_charcoal', bevel=0.035),
    box('m_face', (0.3, 0.02, 0.18), (mx, -0.115, top + 0.33), 'metal_soft', bevel=0.012),
    box('m_hood', (0.34, 0.2, 0.05), (mx, -0.12, top + 0.4), 'plastic_charcoal', bevel=0.02),
    box('m_tray', (0.28, 0.14, 0.03), (mx, -0.16, top + 0.015), 'metal_soft', bevel=0.01),
    cyl('m_group', 0.04, 0.05, (mx, -0.17, top + 0.35), 'metal_soft', verts=16, bevel=0.008),
    box('m_handle', (0.02, 0.12, 0.02), (mx, -0.26, top + 0.34), 'plastic_charcoal', bevel=0.008),
    cyl('m_knob', 0.022, 0.02, (mx + 0.1, -0.13, top + 0.33), 'plastic_charcoal', verts=12, bevel=0.005, rot=(math.pi / 2, 0, 0)),
    cyl('m_beans', 0.07, 0.1, (mx + 0.08, 0.1, top + 0.49), 'glass_frame', verts=16, bevel=0.01),
]
for i, (x, y) in enumerate([(mx, -0.16), (0.2, -0.08), (0.3, 0.05)]):
    parts.append(lathe(f'mug{i}', [(0.001, 0), (0.035, 0), (0.042, 0.01), (0.045, 0.09), (0.04, 0.09), (0.037, 0.02), (0.001, 0.02)], (x, y, top + (0.03 if i == 0 else 0)), 'mug', steps=12))
    parts.append(torus(f'mugh{i}', 0.022, 0.007, (x + 0.05, y, top + (0.03 if i == 0 else 0) + 0.05), 'mug', rot=(math.pi / 2, 0, 0), major_seg=10, minor_seg=5))
parts.append(cyl('jar', 0.06, 0.14, (0.33, 0.14, top + 0.07), 'wood_light', verts=16, bevel=0.012))
join(parts, 'coffee_machine')
box('coffee_led', (0.025, 0.01, 0.025), (mx - 0.1, -0.128, top + 0.36), 'led_amber', bevel=0)
export()
