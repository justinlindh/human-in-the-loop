"""Desk monitor. monitor_screen is a separate UV'd quad (material pal_screen) for canvas textures."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, H, Z = 0.62, 0.38, 0.37
parts = [
    box('base', (0.24, 0.17, 0.018), (0, 0.02, 0.009), 'plastic_charcoal', bevel=0.008),
    box('neck', (0.05, 0.03, 0.2), (0, 0.05, 0.11), 'metal_soft', bevel=0.01),
    box('bezel', (W, 0.035, H), (0, 0, Z), 'plastic_charcoal', bevel=0.012),
    box('hump', (0.26, 0.05, 0.18), (0, 0.035, Z), 'plastic_charcoal', bevel=0.02),
    box('chin', (0.05, 0.004, 0.01), (0, -0.0185, Z - H / 2 + 0.012), 'metal_soft', bevel=0),
]
join(parts, 'monitor')
plane('monitor_screen', W - 0.04, H - 0.05, (0, -0.0182, Z + 0.006), 'screen')
export()
