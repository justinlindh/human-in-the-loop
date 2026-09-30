"""A hooded street payphone with a chunky handset and one curved cord."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = [box('foot', (0.54, 0.50, 0.10), (0, 0, 0.05), 'slab_edge', 0.03),
         box('pedestal', (0.18, 0.20, 0.84), (0, 0.08, 0.50), 'metal_dark', 0.025),
         box('back', (0.55, 0.11, 0.76), (0, 0.15, 1.16), 'wall_warm', 0.045),
         box('hood', (0.64, 0.50, 0.13), (0, -0.045, 1.56), 'fabric_teal', 0.045),
         box('phone_case', (0.39, 0.15, 0.52), (0, 0.035, 1.15), 'metal_soft', 0.025),
         box('coin_slot', (0.085, 0.015, 0.014), (0.085, -0.05, 1.31), 'ink', 0.003),
         box('handset', (0.06, 0.08, 0.27), (-0.12, -0.085, 1.18), 'plastic_charcoal', 0.025),
         lettering('phone_label', 'PHONE', (0, -0.302, 1.56), 0.096)]
for z in (1.06, 1.31):
    parts.append(box('receiver', (0.11, 0.10, 0.075), (-0.12, -0.096, z), 'plastic_charcoal', 0.027))
for x in (0.03, 0.105):
    for z in (1.09, 1.16, 1.23):
        parts.append(box('key', (0.045, 0.017, 0.032), (x, -0.052, z), 'wall_cream', 0.005, segments=1))
parts.append(torus('cord', 0.083, 0.013, (-0.07, -0.063, 0.94), 'plastic_charcoal', rot=(math.pi/2, 0, 0), major_seg=12, minor_seg=4))
finish(parts, 'era_payphone')
