'''Water cooler (pre-internet): a glass jug with a spigot on a wooden stand, beside a cupboard with
upturned glasses and a stack of paper cups.

Fills a 2x1 footprint with its back to the wall (back edge near y = +0.25), front toward -Y.
'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
JX = -0.38
parts = []
# The stand: a small wooden table on four legs with a lower shelf.
parts.append(box('stand_top', (0.46, 0.4, 0.04), (JX, 0.02, 0.78), 'wood_dark', bevel=0.012))
parts.append(box('stand_shelf', (0.4, 0.34, 0.03), (JX, 0.02, 0.24), 'wood_dark', bevel=0.01))
for sx in (-1, 1):
    for sy in (-1, 1):
        parts.append(box(f'leg{sx}{sy}', (0.04, 0.04, 0.78), (JX + sx * 0.19, 0.02 + sy * 0.16, 0.39), 'wood_dark', bevel=0.008))
# The jug: a fat glass bottle with the water showing through, and a brass spigot at the front.
parts.append(lathe('jug', [(0.001, 0.8), (0.12, 0.8), (0.16, 0.86), (0.17, 0.98), (0.16, 1.1), (0.1, 1.17), (0.06, 1.2), (0.06, 1.24), (0.001, 1.24)], (JX, 0.04, 0), 'glass', steps=16))
parts.append(lathe('jug_water', [(0.001, 0.82), (0.12, 0.82), (0.15, 0.87), (0.155, 1.02), (0.001, 1.02)], (JX, 0.04, 0), 'water', steps=14))
parts.append(cyl('cap', 0.065, 0.04, (JX, 0.04, 1.25), 'wood_honey', verts=14, bevel=0.008))
parts.append(cyl('spigot', 0.02, 0.1, (JX, -0.12, 0.86), 'gold', verts=10, bevel=0.004, rot=(math.pi / 2, 0, 0)))
parts.append(box('spigot_lever', (0.012, 0.012, 0.06), (JX, -0.16, 0.9), 'gold', bevel=0.003))
parts.append(cyl('basin', 0.07, 0.03, (JX, -0.12, 0.815), 'metal_soft', verts=14, bevel=0.006))
# The cupboard: a painted cabinet with two doors, glasses upside down on a tray and paper cups.
parts.append(box('cupboard', (0.62, 0.38, 0.74), (0.3, 0.04, 0.37), 'fabric_sage', bevel=0.02))
parts.append(box('cupboard_top', (0.66, 0.42, 0.035), (0.3, 0.04, 0.755), 'wood_honey', bevel=0.01))
for sx in (-1, 1):
    parts.append(box(f'knob{sx}', (0.03, 0.03, 0.03), (0.3 + sx * 0.05, -0.155, 0.48), 'gold', bevel=0.008))
parts.append(box('door_split', (0.006, 0.005, 0.6), (0.3, -0.152, 0.37), 'wood_dark', bevel=0))
parts.append(box('tray', (0.34, 0.24, 0.02), (0.2, 0.02, 0.783), 'metal_soft', bevel=0.006))
for i, (gx, gy) in enumerate([(0.1, -0.03), (0.2, 0.06), (0.3, -0.03)]):
    parts.append(cyl(f'glass{i}', 0.038, 0.1, (gx, gy, 0.843), 'glass_frame', verts=12, bevel=0.004, r2=0.03))
parts.append(cyl('cups', 0.04, 0.18, (0.5, 0.06, 0.863), 'paper_sheet', verts=12, bevel=0.004))
join(parts, 'water_cooler_jug')
export()
