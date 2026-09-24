"""Office shop: monitoring_wall. l1 single screen on a stand, l2 wall display over a console, l3 tiled video wall."""
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
    parts = kit.monitor_wall('mw_', 0, 0.25, W=1.1, H=0.64, Z=1.1, console=False)
    parts += kit.desk('d_', 0, -0.3, W=1.0, D=0.55, tray=False)
    parts += kit.laptop('l_', 0, -0.35, 0.62, screen='wall_laptop_screen')
    return parts


def l2():
    return kit.monitor_wall('mw_', 0, 0.25)


def l3():
    parts = kit.monitor_wall('mw_', 0, 0.25, W=2.6, H=1.5, Z=1.3, tiles=(3, 2), leds=5)
    for sx in (-1, 1):
        parts += kit.monitor('m%d' % sx, sx * 0.62, -0.25, 0.64, rz=sx * math.radians(-12), W=0.48, H=0.3, screen=f'wall_side{(sx + 1) // 2}_screen')
    parts.append(box('beacon_post', (0.04, 0.04, 0.3), (1.28, 0.3, 2.2), 'metal_dark', bevel=0.008))
    return parts


reset(); join(l1(), 'monitoring_wall_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'monitoring_wall_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'monitoring_wall_l3')
uvsphere('wall_beacon_led', 0.06, (1.28, 0.3, 2.38), 'led_amber', seg=10, rings=6)
export(tier_path(3), budget=BUDGET[3])
