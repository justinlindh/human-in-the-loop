"""Office shop: library. l1 bookshelf, l2 bookshelf and armchair, l3 reading nook with lamp and rug."""
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
    return kit.bookshelf('b_', 0, 0.3)


def l2():
    parts = kit.bookshelf('b_', -0.45, 0.3)
    parts += kit.armchair('a_', 0.55, -0.1, rz=math.radians(-25))
    parts += kit.side_table('t_', 0.1, -0.45, r=0.18, h=0.45)
    parts += kit.stack_books('sb', 0.1, -0.45, 0.45, n=2, seed=5)
    return parts


def l3():
    parts = kit.bookshelf('b1', -0.55, 0.3, W=0.9, H=1.9, seed=11) + kit.bookshelf('b2', 0.4, 0.3, W=0.9, H=1.9, seed=17)
    parts.append(cyl('rug', 0.75, 0.015, (0.1, -0.4, 0.0075), 'rug_teal', verts=28, bevel=0))
    parts += kit.armchair('a_', 0.35, -0.45, rz=math.radians(-20), fabric='fabric_mustard', seg=2)
    parts.append(box('ottoman', (0.4, 0.34, 0.24), (0.25, -1.0, 0.12), 'fabric_mustard', bevel=0.06, segments=2))
    parts += kit.side_table('t_', -0.35, -0.55, r=0.2, h=0.46)
    parts += kit.stack_books('sb', -0.35, -0.55, 0.46, n=2, seed=8)
    parts += kit.mug('m', -0.25, -0.62, 0.46)
    parts += kit.floor_lamp('fl_', 0.95, -0.2, h=1.55)
    return parts


reset(); join(l1(), 'library_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'library_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'library_l3'); export(tier_path(3), budget=BUDGET[3])
