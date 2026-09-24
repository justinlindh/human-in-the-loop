"""Open laptop. laptop_screen is a separate UV'd quad (material pal_screen)."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, D = 0.34, 0.24
tilt = math.radians(-18)
parts = [
    box('base', (W, D, 0.018), (0, 0, 0.009), 'metal_soft', bevel=0.006),
    box('keys', (W - 0.05, D * 0.45, 0.003), (0, 0.02, 0.019), 'plastic_charcoal', bevel=0),
    box('pad', (0.09, 0.05, 0.002), (0, -0.07, 0.0185), 'metal_dark', bevel=0),
]
hz = 0.018 + 0.11 * math.cos(tilt)
hy = D / 2 + 0.11 * math.sin(-tilt) - 0.005
parts.append(box('lid', (W, 0.012, 0.22), (0, hy, hz), 'metal_soft', bevel=0.005, rot=(tilt, 0, 0)))
join(parts, 'laptop')
o = plane('laptop_screen', W - 0.03, 0.19, (0, hy - 0.0065 * math.cos(tilt), hz - 0.0065 * math.sin(-tilt)), 'screen', rot=(math.pi / 2 + tilt, 0, 0))
export()
