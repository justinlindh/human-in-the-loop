"""Office shop: server_rack. l1 one rack, l2 two racks with an overhead cable tray, l3 glass-door row with a cold-aisle glow.
LEDs are named rackN_led_NN so the game can blink them per rack."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

# Shop item tiers share one footprint: back edge near y = +0.5 (against a wall), front faces -Y.
BUDGET = {1: 3000, 2: 4000, 3: 6000}


def build(level, fn, name):
    reset()
    join(fn(), f'{name}_l{level}')
    export(tier_path(level), budget=BUDGET[level])


def tray(W, z, y):
    parts = []
    for sy in (-1, 1):
        parts.append(box(f'tr_side{sy}', (W, 0.02, 0.06), (0, y + sy * 0.14, z), 'metal_soft', bevel=0.005))
    for i in range(int(W / 0.2) + 1):
        parts.append(box(f'tr_rung{i}', (0.025, 0.28, 0.015), (-W / 2 + i * 0.2, y, z - 0.02), 'metal_soft', bevel=0))
    for i, c in enumerate(['marker_blue', 'role_marketer', 'plastic_charcoal']):
        parts.append(cyl(f'tr_cable{i}', 0.022, W - 0.1, (0, y - 0.07 + i * 0.07, z + 0.005), c, verts=8, bevel=0, rot=(0, math.pi / 2, 0)))
    return parts


def l1():
    return kit.rack('r0_', 0, 0.15, led='rack0_led')


def l2():
    parts = kit.rack('r0_', -0.34, 0.15, led='rack0_led') + kit.rack('r1_', 0.34, 0.15, led='rack1_led')
    parts += tray(1.5, 1.72, 0.15)
    for sx in (-0.34, 0.34):
        parts.append(box(f'drop{sx}', (0.08, 0.05, 0.12), (sx, 0.15, 1.64), 'plastic_charcoal', bevel=0.01))
    for sx in (-0.75, 0.75):
        parts.append(box(f'hanger{sx}', (0.02, 0.02, 0.4), (sx, 0.15, 1.95), 'metal_soft', bevel=0))
    return parts


def l3():
    parts = []
    for i, x in enumerate((-0.66, 0.0, 0.66)):
        parts += kit.rack(f'r{i}_', x, 0.15, glass_door=True, led=f'rack{i}_led')
    parts.append(box('roof', (2.1, 0.9, 0.05), (0, 0.1, 1.72), 'metal_dark', bevel=0.015))
    for sx in (-1, 1):
        parts.append(box(f'endcap{sx}', (0.04, 0.9, 1.7), (sx * 1.03, 0.1, 0.85), 'metal_dark', bevel=0.01))
    parts += tray(2.0, 1.86, 0.15)
    parts.append(box('floor_grate', (2.0, 0.5, 0.02), (0, -0.5, 0.01), 'metal_soft', bevel=0.006))
    return parts


reset(); join(l1(), 'server_rack_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'server_rack_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'server_rack_l3')
box('server_rack_aisle_glow', (1.9, 0.03, 0.02), (0, -0.26, 0.02), 'neon_cyan', bevel=0)
box('server_rack_roof_glow', (1.9, 0.02, 0.02), (0, -0.33, 1.69), 'neon_cyan', bevel=0)
export(tier_path(3), budget=BUDGET[3])
