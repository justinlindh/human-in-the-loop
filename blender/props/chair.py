'''Office chair: five-star base with casters, gas lift, cushioned seat and backrest.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
parts = []
for i in range(5):
    a = math.radians(90 + i * 72)
    cx, cy = math.cos(a) * 0.14, math.sin(a) * 0.14
    parts.append(box(f'arm{i}', (0.28, 0.045, 0.035), (cx, cy, 0.065), 'plastic_charcoal', bevel=0.012, segments=2, rot=(0, 0, a)))
    parts.append(uvsphere(f'caster{i}', 0.032, (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.032), 'plastic_charcoal', seg=8, rings=5))
parts.append(cyl('hub', 0.05, 0.05, (0, 0, 0.07), 'plastic_charcoal', verts=16, bevel=0.01))
parts.append(cyl('lift', 0.022, 0.24, (0, 0, 0.2), 'metal_soft', verts=12, bevel=0.005))
parts.append(box('seatpan', (0.4, 0.38, 0.03), (0, 0, 0.33), 'plastic_charcoal', bevel=0.01))
parts.append(box('seat', (0.46, 0.44, 0.08), (0, -0.01, 0.385), 'fabric_slate', bevel=0.035, segments=3))
parts.append(box('spine', (0.05, 0.03, 0.26), (0, 0.22, 0.44), 'plastic_charcoal', bevel=0.01, rot=(math.radians(-8), 0, 0)))
parts.append(box('back', (0.44, 0.07, 0.4), (0, 0.25, 0.72), 'fabric_slate', bevel=0.03, segments=3, rot=(math.radians(-8), 0, 0)))
for sx in (-1, 1):
    parts.append(box(f'armpost{sx}', (0.03, 0.03, 0.16), (sx * 0.22, 0.02, 0.47), 'plastic_charcoal', bevel=0.008))
    parts.append(box(f'armpad{sx}', (0.06, 0.24, 0.03), (sx * 0.22, 0.0, 0.56), 'plastic_charcoal', bevel=0.012))
join(parts, 'chair')
export()
