'''Water cooler: white cabinet, taps, and an upturned bottle; cup dispenser on the side.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
parts = [
    box('cab', (0.34, 0.34, 0.95), (0, 0, 0.475), 'plastic_white', bevel=0.03),
    box('recess', (0.24, 0.05, 0.2), (0, -0.16, 0.62), 'metal_dark', bevel=0.012),
    box('drip', (0.22, 0.08, 0.02), (0, -0.17, 0.53), 'metal_soft', bevel=0.006),
    cyl('collar', 0.1, 0.04, (0, 0, 0.97), 'plastic_white', verts=20, bevel=0.01),
    cyl('tap_a', 0.018, 0.05, (-0.05, -0.17, 0.68), 'role_engineer', verts=10, bevel=0.004, rot=(math.pi / 2, 0, 0)),
    cyl('tap_b', 0.018, 0.05, (0.05, -0.17, 0.68), 'metal_soft', verts=10, bevel=0.004, rot=(math.pi / 2, 0, 0)),
    cyl('cups', 0.035, 0.22, (0.2, -0.05, 0.62), 'paper_sheet', verts=12, bevel=0.005),
]
join(parts, 'water_cooler')
bottle = lathe('bottle', [(0.001, 0.97), (0.05, 0.97), (0.05, 1.0), (0.13, 1.06), (0.14, 1.1), (0.14, 1.38), (0.12, 1.42), (0.001, 1.43)], (0, 0, 0), 'water', steps=24)
export()
