'''Water cooler (Web 2.0): a reclaimed-wood counter with a chrome filtered-water tap, a kombucha keg
on its own tap, mason jars and paper cups.

Fills a 2x1 footprint with its back to the wall (back edge near y = +0.25), front toward -Y.
'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
parts = kit.counter('c_', 0, 0.04, W=1.5, D=0.44, H=0.82, body='fabric_slate', top='wood_walnut', doors=2)
TOP = 0.845
# The filtered tap: a chrome gooseneck on a slim filter canister, with a small drip tray.
parts.append(cyl('filter', 0.05, 0.3, (-0.48, 0.12, TOP + 0.15), 'plastic_white', verts=16, bevel=0.01))
parts.append(cyl('neck', 0.016, 0.34, (-0.3, 0.14, TOP + 0.17), 'metal_soft', verts=10, bevel=0.004))
parts.append(torus('goose', 0.08, 0.016, (-0.3, 0.06, TOP + 0.34), 'metal_soft', rot=(0, math.pi / 2, 0), major_seg=12, minor_seg=5))
parts.append(cyl('spout', 0.018, 0.06, (-0.3, -0.02, TOP + 0.3), 'metal_soft', verts=10, bevel=0.004))
parts.append(box('drip', (0.18, 0.12, 0.02), (-0.3, -0.03, TOP + 0.01), 'metal_dark', bevel=0.006))
parts.append(box('tag', (0.12, 0.006, 0.05), (-0.48, 0.065, TOP + 0.2), 'leaf_light', bevel=0.004))
# The kombucha keg: a steel keg on its side in a cradle, with an amber sight glass and a tap.
parts.append(cyl('keg', 0.15, 0.4, (0.3, 0.1, TOP + 0.2), 'metal_soft', verts=14, bevel=0.02, rot=(0, math.pi / 2, 0)))
for sx in (-1, 1):
    parts.append(box(f'cradle{sx}', (0.04, 0.3, 0.08), (0.3 + sx * 0.14, 0.1, TOP + 0.04), 'wood_dark', bevel=0.01))
    parts.append(torus(f'hoop{sx}', 0.152, 0.012, (0.3 + sx * 0.12, 0.1, TOP + 0.2), 'metal_dark', rot=(0, math.pi / 2, 0), major_seg=14, minor_seg=4))
parts.append(box('sight', (0.2, 0.006, 0.05), (0.3, -0.052, TOP + 0.24), 'screen_amber', bevel=0.004))
parts.append(cyl('keg_tap', 0.02, 0.08, (0.08, -0.02, TOP + 0.2), 'gold', verts=10, bevel=0.004, rot=(0, math.pi / 2, 0)))
parts.append(box('keg_handle', (0.03, 0.03, 0.12), (0.06, -0.02, TOP + 0.3), 'wood_honey', bevel=0.008))
parts.append(box('label', (0.16, 0.006, 0.08), (0.3, -0.055, TOP + 0.14), 'marker_orange', bevel=0.004))
# Mason jars and a stack of paper cups.
for i, jx in enumerate((-0.08, 0.02)):
    parts.append(cyl(f'jar{i}', 0.04, 0.11, (jx, -0.08, TOP + 0.055), 'glass', verts=12, bevel=0.006))
    parts.append(cyl(f'jarlid{i}', 0.042, 0.015, (jx, -0.08, TOP + 0.118), 'gold', verts=12, bevel=0.003))
parts.append(cyl('cups', 0.04, 0.18, (0.62, 0.0, TOP + 0.09), 'paper_sheet', verts=12, bevel=0.004))
join(parts, 'water_cooler_web2')
# A 2x1 shop item, like the espresso tiers.
export(budget=4000)
