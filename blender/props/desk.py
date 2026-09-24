"""Work desk: thick honey top, charcoal sled frames, cable tray and a dropped cable."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, D, H, T = 1.3, 0.7, 0.62, 0.06
parts = [box('top', (W, D, T), (0, 0, H - T / 2), 'wood_honey', bevel=0.022)]
for sx in (-1, 1):
    x = sx * (W / 2 - 0.1)
    for sy in (-1, 1):
        parts.append(box(f'leg{sx}{sy}', (0.05, 0.05, H - T), (x, sy * (D / 2 - 0.09), (H - T) / 2), 'metal_dark', bevel=0.012))
    parts.append(box(f'foot{sx}', (0.06, D - 0.1, 0.035), (x, 0, 0.0175), 'metal_dark', bevel=0.012))
    parts.append(box(f'rail{sx}', (0.04, D - 0.14, 0.04), (x, 0, H - T - 0.03), 'metal_dark', bevel=0.01))
parts.append(box('tray', (W - 0.4, 0.12, 0.07), (0, D / 2 - 0.14, H - T - 0.08), 'metal_soft', bevel=0.012))
parts.append(cyl('cable', 0.012, H - T - 0.1, (0.28, D / 2 - 0.12, (H - T - 0.1) / 2), 'plastic_charcoal', verts=8, bevel=0))
parts.append(cyl('grommet', 0.03, 0.01, (0.28, D / 2 - 0.12, H + 0.001), 'plastic_charcoal', verts=16, bevel=0))
join(parts, 'desk')
export()
