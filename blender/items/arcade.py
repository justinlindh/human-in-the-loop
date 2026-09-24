"""Office shop: arcade. l1 handheld on a side table with floor cushions, l2 cabinet, l3 two cabinets and a neon sign."""
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


def l1():
    parts = kit.side_table('t_', 0, 0.1, r=0.3, h=0.4, top='wood_light')
    parts += [
        box('handheld', (0.2, 0.1, 0.03), (0, 0.08, 0.415), 'plastic_white', bevel=0.012, rot=(0, 0, math.radians(20))),
        box('handscreen', (0.07, 0.05, 0.006), (0, 0.08, 0.432), 'plastic_charcoal', bevel=0, rot=(0, 0, math.radians(20))),
        cyl('cart', 0.05, 0.012, (0.18, 0.2, 0.41), 'role_designer', verts=4, bevel=0.003),
    ]
    for i, (x, y, c) in enumerate([(-0.55, -0.05, 'fabric_teal'), (0.55, -0.1, 'fabric_terracotta')]):
        o = box(f'cush{i}', (0.46, 0.46, 0.14), (x, y, 0.07), c, bevel=0.06, segments=3, rot=(0, 0, 0.3 * (i * 2 - 1)))
        parts.append(o)
    return parts


def l2():
    return kit.arcade_cabinet('a_', 0, 0.2, body='role_sales') + kit.stool('s_', 0.55, -0.35, h=0.5)


def l3():
    parts = kit.arcade_cabinet('a_', -0.45, 0.2, body='role_sales', screen='arcade_screen', marquee='neon_pink')
    parts += kit.arcade_cabinet('b_', 0.45, 0.2, body='role_engineer', screen='arcade_screen_2', marquee='neon_cyan')
    parts += kit.stool('s_', 0.0, -0.45, h=0.5, seat='fabric_mustard')
    parts.append(box('signback', (1.2, 0.04, 0.5), (0, 0.47, 2.15), 'plastic_charcoal', bevel=0.02))
    return parts


def neon():
    # A lightning bolt and underline, drawn with thin glowing bars.
    pts = [(-0.3, 2.3), (-0.05, 2.18), (-0.18, 2.1), (0.1, 1.98)]
    bars = []
    for i in range(len(pts) - 1):
        (x0, z0), (x1, z1) = pts[i], pts[i + 1]
        L = math.hypot(x1 - x0, z1 - z0)
        a = math.atan2(z1 - z0, x1 - x0)
        bars.append(box(f'neon_b{i}', (L + 0.02, 0.02, 0.025), ((x0 + x1) / 2, 0.44, (z0 + z1) / 2), 'neon_pink', bevel=0, rot=(0, -a, 0)))
    bars.append(box('neon_line', (0.8, 0.02, 0.025), (0.12, 0.44, 1.95), 'neon_cyan', bevel=0))
    for i, x in enumerate((0.25, 0.35, 0.45)):
        bars.append(box(f'neon_dot{i}', (0.05, 0.02, 0.05), (x, 0.44, 2.2), 'neon_cyan', bevel=0))
    join(bars, 'arcade_neon_glow')


reset(); join(l1(), 'arcade_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'arcade_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'arcade_l3'); neon(); export(tier_path(3), budget=BUDGET[3])
