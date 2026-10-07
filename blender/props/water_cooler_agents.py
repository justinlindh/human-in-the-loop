'''Water cooler (Agents era): a "hydration station", a tall white panel with a touch screen, a QR code
to log your water, a lit spout niche and a rack of reusable bottles; paper cups on the side shelf.

Fills a 2x1 footprint with its back to the wall (back edge near y = +0.25), front toward -Y.
'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
SX = -0.25
parts = [
    box('panel', (0.62, 0.3, 1.62), (SX, 0.08, 0.81), 'plastic_white', bevel=0.04),
    box('niche', (0.36, 0.08, 0.34), (SX, -0.06, 0.82), 'plastic_charcoal', bevel=0.02),
    box('niche_light', (0.32, 0.01, 0.02), (SX, -0.03, 0.98), 'screen_cyan', bevel=0),
    cyl('spout', 0.022, 0.06, (SX, -0.06, 0.95), 'metal_soft', verts=10, bevel=0.005),
    box('grate', (0.3, 0.1, 0.02), (SX, -0.07, 0.66), 'metal_soft', bevel=0.005),
    box('screen', (0.36, 0.012, 0.2), (SX, -0.072, 1.24), 'screen_cyan', bevel=0.006),
    box('strip', (0.02, 0.012, 1.4), (SX - 0.28, -0.07, 0.8), 'screen_cyan', bevel=0),
    # The QR code plate on the front, beside the screen.
    box('qr_plate', (0.16, 0.01, 0.16), (SX, -0.072, 1.47), 'paper', bevel=0.004),
]
QR = ['11101', '10011', '01110', '11001', '10111']
for r, row in enumerate(QR):
    for c, bit in enumerate(row):
        if bit == '1':
            parts.append(box(f'qr{r}{c}', (0.024, 0.006, 0.024), (SX - 0.052 + c * 0.026, -0.08, 1.522 - r * 0.026), 'ink', bevel=0))
# The side shelf: a slim rack of reusable bottles and a stack of paper cups.
parts.append(box('shelf', (0.6, 0.3, 0.03), (0.4, 0.08, 0.9), 'plastic_white', bevel=0.01))
parts.append(box('shelf_low', (0.6, 0.3, 0.03), (0.4, 0.08, 0.5), 'plastic_white', bevel=0.01))
for sx in (-1, 1):
    parts.append(box(f'shelf_side{sx}', (0.03, 0.3, 0.9), (0.4 + sx * 0.29, 0.08, 0.45), 'plastic_white', bevel=0.01))
for i, (bx, col) in enumerate([(0.22, 'role_engineer'), (0.34, 'leaf_light'), (0.46, 'marker_orange')]):
    parts.append(cyl(f'bottle{i}', 0.04, 0.22, (bx, 0.08, 0.625), col, verts=10, bevel=0.006))
    parts.append(cyl(f'bottlecap{i}', 0.03, 0.03, (bx, 0.08, 0.75), 'plastic_charcoal', verts=10, bevel=0.005))
parts.append(cyl('cups', 0.04, 0.2, (0.5, 0.06, 1.015), 'paper_sheet', verts=12, bevel=0.004))
parts.append(cyl('cup_bin', 0.1, 0.3, (0.4, 0.1, 0.15), 'plastic_charcoal', verts=12, bevel=0.008, r2=0.09))
join(parts, 'water_cooler_agents')
# A 2x1 shop item, like the espresso tiers.
export(budget=4000)
