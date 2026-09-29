"""Office shop: office_robot, the robot's charging dock (the robot itself is robot.glb and roams).

One tile. A floor pad the robot parks on (centre at y = -0.1) and a charging tower at the back:
l1 a plain tower with a charge light, l2 adds a coffee hopper and a hook with a spare watering can,
l3 a taller tower with a status screen and a pod carousel. The charge light is office_robot_charge_led;
the l3 screen is office_robot_screen."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

BUDGET = {1: 1500, 2: 2200, 3: 3500}


def pad():
    return [cyl('pad', 0.34, 0.03, (0, -0.1, 0.015), 'plastic_charcoal', verts=24, bevel=0.01),
            torus('pad_ring', 0.27, 0.012, (0, -0.1, 0.03), 'fabric_teal', major_seg=24, minor_seg=4),
            box('pad_arrow', (0.08, 0.1, 0.006), (0, -0.33, 0.032), 'fabric_teal', bevel=0, rot=(0, 0, math.pi / 4))]


def tower(H, W=0.36):
    parts = [box('tower', (W, 0.2, H), (0, 0.36, H / 2), 'plastic_white', bevel=0.05, segments=3),
             box('tower_face', (W - 0.1, 0.02, 0.28), (0, 0.255, H - 0.2), 'plastic_charcoal', bevel=0.01),
             box('tower_stripe', (W + 0.004, 0.204, 0.035), (0, 0.36, 0.2), 'fabric_teal', bevel=0.01),
             # Charging contacts at bumper height.
             box('contacts', (0.14, 0.05, 0.04), (0, 0.24, 0.07), 'metal_soft', bevel=0.01)]
    return parts


def charge_led(z):
    join([box('led', (0.16, 0.012, 0.03), (0, 0.243, z), 'led_green', bevel=0.006)], 'office_robot_charge_led')


def l1():
    return pad() + tower(0.62)


def hopper(z):
    return [box('hopper', (0.26, 0.2, 0.18), (0, 0.36, z), 'plastic_charcoal', bevel=0.03),
            cyl('hopper_lid', 0.1, 0.03, (0, 0.36, z + 0.1), 'metal_soft', verts=16, bevel=0.008),
            box('beans', (0.18, 0.02, 0.08), (0, 0.259, z), 'coffee', bevel=0.005)]


def spare_can(W):
    """A spare watering can hanging from a hook on the tower's right side."""
    x = W / 2 + 0.06
    return [box('hook', (0.08, 0.02, 0.02), (W / 2 + 0.03, 0.36, 0.5), 'metal_dark', bevel=0),
            box('hook_tip', (0.02, 0.02, 0.05), (x, 0.36, 0.48), 'metal_dark', bevel=0),
            cyl('spare_can', 0.05, 0.1, (x, 0.36, 0.4), 'fabric_mustard', verts=12, bevel=0.01),
            cyl('spare_spout', 0.01, 0.1, (x, 0.29, 0.43), 'fabric_mustard', verts=6, bevel=0, r2=0.016, rot=(math.radians(-55), 0, 0))]


def l2():
    return pad() + tower(0.72) + hopper(0.84) + spare_can(0.36) + kit.mug('m_', -0.1, 0.36, 0.93)


def l3():
    parts = pad() + tower(1.0, W=0.42) + spare_can(0.42)
    plane('office_robot_screen', 0.26, 0.16, (0, 0.243, 0.86), 'screen')
    parts.append(box('screen_bezel', (0.3, 0.012, 0.2), (0, 0.25, 0.86), 'metal_dark', bevel=0.004))
    # Pod carousel on top: a turntable with coffee pods.
    parts.append(cyl('carousel', 0.16, 0.04, (0, 0.36, 1.02), 'metal_soft', verts=20, bevel=0.01))
    for i in range(8):
        a = i * math.pi / 4
        parts.append(cyl(f'pod{i}', 0.025, 0.035, (0.11 * math.cos(a), 0.36 + 0.11 * math.sin(a), 1.055), ('fabric_terracotta', 'gold', 'fabric_teal')[i % 3], verts=8, bevel=0.004))
    return parts


for level, fn, z in ((1, l1, 0.36), (2, l2, 0.46), (3, l3, 0.71)):
    reset()
    join(fn(), f'office_robot_l{level}')
    charge_led(z)
    export(tier_path(level), budget=BUDGET[level])
