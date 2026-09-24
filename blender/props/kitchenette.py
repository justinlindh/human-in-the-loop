'''Garage kitchenette: a short counter with a drip coffee pot, kettle, and mugs, plus a mini fridge.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
parts = kit.counter('c_', -0.25, 0, W=1.0, body='plastic_white', top='wood_light', doors=2)
top = 0.845
# Drip coffee maker
parts += [
    box('drip_base', (0.22, 0.26, 0.05), (-0.45, 0.04, top + 0.025), 'plastic_charcoal', bevel=0.015),
    box('drip_tower', (0.22, 0.09, 0.36), (-0.45, 0.13, top + 0.2), 'plastic_charcoal', bevel=0.02),
    box('drip_head', (0.22, 0.22, 0.07), (-0.45, 0.05, top + 0.36), 'plastic_charcoal', bevel=0.02),
    lathe('carafe', [(0.001, 0.0), (0.075, 0.0), (0.085, 0.05), (0.075, 0.12), (0.05, 0.16), (0.001, 0.16)], (-0.45, -0.01, top + 0.05), 'glass_frame', steps=16),
    cyl('brew', 0.072, 0.06, (-0.45, -0.01, top + 0.09), 'coffee', verts=16, bevel=0),
]
# Kettle
parts.append(lathe('kettle', [(0.001, 0), (0.1, 0), (0.11, 0.05), (0.1, 0.16), (0.06, 0.2), (0.001, 0.21)], (-0.05, 0.05, top), 'role_marketer', steps=16))
parts.append(torus('kettle_handle', 0.07, 0.012, (-0.05, 0.05, top + 0.22), 'plastic_charcoal', rot=(math.pi / 2, 0, 0), major_seg=12, minor_seg=5))
parts += kit.mug('m1', 0.15, -0.1, top) + kit.mug('m2', 0.1, 0.12, top, material='fabric_teal')
# Mini fridge beside the counter
FX = 0.62
parts += [
    box('fridge', (0.56, 0.58, 0.86), (FX, 0, 0.45), 'plastic_white', bevel=0.05, segments=3),
    box('fridge_door', (0.52, 0.03, 0.8), (FX, -0.29, 0.46), 'plastic_white', bevel=0.02),
    box('fridge_handle', (0.03, 0.04, 0.3), (FX + 0.2, -0.32, 0.6), 'metal_soft', bevel=0.01),
    box('fridge_feet', (0.5, 0.5, 0.03), (FX, 0, 0.015), 'plastic_charcoal', bevel=0.01),
    box('magnet1', (0.08, 0.01, 0.06), (FX - 0.1, -0.31, 0.72), 'role_designer', bevel=0.004, segments=1),
    box('note1', (0.12, 0.006, 0.14), (FX - 0.05, -0.308, 0.62), 'paper_sheet', bevel=0),
]
parts.append(cyl('plant_pot', 0.08, 0.1, (FX + 0.1, 0.05, 0.95), 'pot_terracotta', verts=12, bevel=0.01))
o = sphere('plant_leaf', 0.11, (FX + 0.1, 0.05, 1.07), 'leaf', subdiv=2, scale=(1, 1, 0.8))
displace_noise(o, strength=0.035, size=0.2, seed=3)
parts.append(o)
join(parts, 'kitchenette')
export()
