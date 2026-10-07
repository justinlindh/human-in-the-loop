'''Water cooler (dot-com and Classic): a blue-bottle cooler beside a low cabinet with the paper cups.

Fills a 2x1 footprint with its back to the wall (back edge near y = +0.25), front toward -Y.
'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
CX = -0.38
parts = [
    box('cab', (0.34, 0.34, 0.95), (CX, 0, 0.475), 'plastic_white', bevel=0.03),
    box('recess', (0.24, 0.05, 0.2), (CX, -0.16, 0.62), 'metal_dark', bevel=0.012),
    box('drip', (0.22, 0.08, 0.02), (CX, -0.17, 0.53), 'metal_soft', bevel=0.006),
    cyl('collar', 0.1, 0.04, (CX, 0, 0.97), 'plastic_white', verts=20, bevel=0.01),
    cyl('tap_a', 0.018, 0.05, (CX - 0.05, -0.17, 0.68), 'role_engineer', verts=10, bevel=0.004, rot=(math.pi / 2, 0, 0)),
    cyl('tap_b', 0.018, 0.05, (CX + 0.05, -0.17, 0.68), 'alarm_red', verts=10, bevel=0.004, rot=(math.pi / 2, 0, 0)),
    lathe('bottle', [(0.001, 0.97), (0.05, 0.97), (0.05, 1.0), (0.13, 1.06), (0.14, 1.1), (0.14, 1.38), (0.12, 1.42), (0.001, 1.43)], (CX, 0, 0), 'marker_blue', steps=24),
    # The cup cabinet: a low laminate box with a cup dispenser and a stack of paper cups on top.
    box('side', (0.62, 0.36, 0.7), (0.28, 0.02, 0.35), 'laminate', bevel=0.02),
    box('side_top', (0.66, 0.4, 0.035), (0.28, 0.02, 0.715), 'wood_honey', bevel=0.01),
    box('door_line', (0.004, 0.005, 0.56), (0.28, -0.162, 0.34), 'metal_dark', bevel=0),
    cyl('dispenser', 0.045, 0.32, (0.06, 0.12, 0.89), 'plastic_white', verts=14, bevel=0.006),
    cyl('cups_a', 0.04, 0.16, (0.22, -0.04, 0.81), 'paper_sheet', verts=12, bevel=0.004),
    cyl('cups_b', 0.04, 0.11, (0.32, 0.06, 0.785), 'paper_sheet', verts=12, bevel=0.004),
    cyl('bin', 0.12, 0.32, (0.5, 0.02, 0.89), 'plastic_charcoal', verts=16, bevel=0.01, r2=0.1),
    # A spare bottle waiting on the floor.
    lathe('spare', [(0.001, 0.0), (0.13, 0.0), (0.14, 0.04), (0.14, 0.32), (0.12, 0.36), (0.06, 0.4), (0.05, 0.44), (0.001, 0.44)], (0.76, 0.02, 0), 'marker_blue', steps=16),
]
join(parts, 'water_cooler')
export()
