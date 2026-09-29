"""Office shop: noc. l1 a TV on a rolling cart with a pager, l2 a dark corner with a wall of screens and a curved
desk, l3 a full operations wall with a two-tier desk and a beacon.

Screens the game draws: noc_wallN_screen (the dashboards), noc_deskN_screen (desk monitors) and noc_sign_screen
(the days-since sign). The beacon is noc_beacon_led. Sitters and chairs are placed by the renderer."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

# Shop item tiers share one footprint: back edge near y = +0.5 (against a wall), front faces -Y.
# Levels 2 and 3 have a front zone, so their desk may reach a little past y = -0.5.
BUDGET = {1: 3000, 2: 5000, 3: 7500}


def build(level, fn, name):
    reset()
    join(fn(), f'{name}_l{level}')
    export(tier_path(level), budget=BUDGET[level])


def screen_panel(name, w, h, x, y, z, bezel='plastic_charcoal'):
    """A flat display facing -Y: a bezel box with its screen quad just proud of the front."""
    parts = [box(f'{name}_bezel', (w, 0.06, h), (x, y, z), bezel, bevel=0.012 if w > 0.6 else 0.006, segments=1 if w <= 0.6 else 2)]
    plane(f'{name}_screen', w - 0.05, h - 0.05, (x, y - 0.0315, z), 'screen')
    return parts


def sign(w, h, x, y, z):
    parts = [box('sign_frame', (w + 0.05, 0.03, h + 0.05), (x, y + 0.005, z), 'metal_dark', bevel=0.008)]
    plane('noc_sign_screen', w, h, (x, y - 0.0115, z), 'screen')
    return parts


def caster(p, x, y):
    return [cyl(f'{p}wheel', 0.035, 0.03, (x, y, 0.035), 'plastic_charcoal', verts=8, bevel=0, rot=(0, math.pi / 2, 0)),
            box(f'{p}fork', (0.04, 0.04, 0.04), (x, y, 0.08), 'metal_soft', bevel=0.005)]


def l1():
    parts = []
    # The AV cart: two shelves on four posts and casters.
    cx, cy = -0.25, 0.05
    for i, z in enumerate((0.18, 0.62, 0.95)):
        parts.append(box(f'cart_shelf{i}', (0.8, 0.5, 0.03), (cx, cy, z), 'metal_soft', bevel=0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(f'cart_post{sx}{sy}', (0.03, 0.03, 0.86), (cx + sx * 0.37, cy + sy * 0.22, 0.54), 'metal_dark', bevel=0))
            parts += caster(f'cart_c{sx}{sy}', cx + sx * 0.35, cy + sy * 0.2)
    # A too-big TV strapped on top, showing a green dashboard.
    parts.append(box('tv_foot', (0.3, 0.2, 0.04), (cx, cy + 0.05, 0.985), 'plastic_charcoal', bevel=0.01))
    parts.append(box('tv_neck', (0.06, 0.04, 0.12), (cx, cy + 0.08, 1.06), 'plastic_charcoal', bevel=0.01))
    parts += screen_panel('noc_wall0', 1.0, 0.6, cx, cy + 0.02, 1.42)
    parts.append(box('tv_strap', (1.02, 0.07, 0.03), (cx, cy + 0.03, 1.2), 'role_marketer', bevel=0))
    # The pager in its cradle, a coiled cable and a mug on the middle shelf; a cable box below.
    parts.append(box('cradle', (0.16, 0.12, 0.04), (cx + 0.2, cy - 0.08, 0.655), 'plastic_charcoal', bevel=0))
    parts.append(box('pager', (0.11, 0.05, 0.14), (cx + 0.2, cy - 0.08, 0.73), 'plastic_charcoal', bevel=0.015))
    plane('noc_desk0_screen', 0.08, 0.05, (cx + 0.2, cy - 0.106, 0.755), 'screen')
    parts.append(torus('coil', 0.07, 0.012, (cx - 0.18, cy - 0.05, 0.645), 'plastic_charcoal', major_seg=12, minor_seg=4))
    parts += kit.mug('mug_', cx - 0.02, cy - 0.12, 0.635)
    parts.append(box('cablebox', (0.5, 0.3, 0.12), (cx, cy, 0.255), 'plastic_charcoal', bevel=0.015))
    # The days-since sign, taped to the cart's front edge.
    parts += sign(0.42, 0.14, cx, cy - 0.26, 0.82)
    # One person's kit: a folding chair angled at the TV and a laptop bag against it.
    fx, fy, rz = 0.85, -0.2, math.radians(35)
    chair = [box('fc_seat', (0.4, 0.38, 0.03), (0, 0, 0.45), 'metal_soft', bevel=0),
             box('fc_back', (0.4, 0.03, 0.3), (0, 0.19, 0.72), 'metal_soft', bevel=0)]
    for sx in (-1, 1):
        chair.append(box(f'fc_legf{sx}', (0.025, 0.025, 0.52), (sx * 0.18, -0.12, 0.23), 'metal_dark', bevel=0, rot=(math.radians(-12), 0, 0)))
        chair.append(box(f'fc_legb{sx}', (0.025, 0.025, 0.9), (sx * 0.18, 0.16, 0.45), 'metal_dark', bevel=0, rot=(math.radians(8), 0, 0)))
    parts += place(chair, fx, fy, rz)
    parts.append(box('bag', (0.34, 0.12, 0.26), (fx + 0.35, fy + 0.25, 0.13), 'fabric_slate', bevel=0.04))
    return parts


def curved_desk(p, R, a0, a1, n, y0, H=0.72, D=0.42, top='wood_walnut'):
    """A desk bent on a circle of radius R centred at (0, y0 + R), spanning angles a0..a1 (0 is straight ahead)."""
    parts = []
    step = (a1 - a0) / n
    seg_w = 2 * R * math.sin(step / 2) + 0.03
    for i in range(n):
        a = a0 + (i + 0.5) * step
        x, y = R * math.sin(a), y0 + R - R * math.cos(a)
        parts.append(box(f'{p}top{i}', (seg_w, D, 0.05), (x, y, H), top, bevel=0.012, rot=(0, 0, a)))
        parts.append(box(f'{p}body{i}', (seg_w, D - 0.08, H - 0.1), (x - math.sin(a) * 0.04 * 0, y + 0.04, (H - 0.1) / 2 + 0.02), 'plastic_charcoal', bevel=0.012, rot=(0, 0, a)))
        parts.append(box(f'{p}face{i}', (seg_w - 0.06, 0.02, 0.4), (x + math.sin(a) * -0.19, y - math.cos(a) * 0.19 + 0.02, 0.36), 'metal_dark', bevel=0.004, rot=(0, 0, a)))
    return parts


def desk_monitors(p, R, angles, y0, z, start=0, W=0.42, H=0.26):
    parts = []
    for k, a in enumerate(angles):
        x, y = R * math.sin(a), y0 + R - R * math.cos(a) + 0.08
        parts += kit.monitor(f'{p}{k}', x, y, z, rz=a, W=W, H=H, screen=f'noc_desk{start + k}_screen')
    return parts


def dark_backdrop(W, H, y):
    parts = [box('backdrop', (W, 0.06, H), (0, y, H / 2), 'plastic_charcoal', bevel=0.02)]
    # The blue glow: light strips along the top and the floor edge of the screen wall.
    for sx in (-1, 1):
        parts.append(box(f'glow_side{sx}', (0.03, 0.03, H - 0.5), (sx * (W / 2 - 0.07), y - 0.05, H / 2 + 0.1), 'neon_cyan', bevel=0))
    parts.append(box('glow_low', (W - 0.2, 0.03, 0.03), (0, y - 0.05, 0.32), 'neon_cyan', bevel=0))
    return parts


def l2():
    parts = dark_backdrop(2.9, 2.1, 0.44)
    # A 3 x 2 wall of screens.
    i = 0
    for row, z in enumerate((1.5, 0.98)):
        for col, x in enumerate((-0.88, 0.0, 0.88)):
            parts += screen_panel(f'noc_wall{i}', 0.84, 0.5, x, 0.38, z)
            i += 1
    parts += sign(1.0, 0.3, 0.0, 0.39, 1.93)
    # The curved desk, in the front of the footprint.
    parts += curved_desk('cd_', 2.6, -0.42, 0.42, 6, -0.5)
    parts += desk_monitors('dm', 2.6, (-0.26, 0.0, 0.26), -0.5, 0.745)
    for k, a in enumerate((-0.13, 0.13)):
        parts.append(box(f'kbd{k}', (0.34, 0.12, 0.02), (2.6 * math.sin(a), -0.5 + 2.6 - 2.6 * math.cos(a) - 0.08, 0.755), 'metal_soft', bevel=0, rot=(0, 0, a)))
    parts += kit.mug('mug_', 0.55, -0.4, 0.745)
    return parts


def l3():
    parts = dark_backdrop(2.94, 2.4, 0.46)
    # The operations wall: a big centre screen flanked by 2 x 2 tiles each side.
    parts += screen_panel('noc_wall0', 1.2, 0.8, 0.0, 0.4, 1.55)
    i = 1
    for side in (-1, 1):
        for row, z in enumerate((1.8, 1.3)):
            for col in range(2):
                x = side * (0.9 + col * 0.46)
                parts += screen_panel(f'noc_wall{i}', 0.44, 0.44, x, 0.4, z)
                i += 1
    # A ticker strip under the big screen.
    parts += screen_panel('noc_wall9', 1.2, 0.14, 0.0, 0.4, 1.04)
    parts += sign(1.1, 0.34, 0.0, 0.41, 2.18)
    # The beacon on a post at the right end.
    parts.append(box('beacon_post', (0.05, 0.05, 0.3), (1.35, 0.3, 2.45), 'metal_dark', bevel=0.008))
    # Two tiers: a raised back rail behind the curved front desk.
    parts.append(box('tier_rail', (2.4, 0.12, 0.95), (0, 0.18, 0.475), 'plastic_charcoal', bevel=0.02))
    parts.append(box('tier_top', (2.44, 0.2, 0.04), (0, 0.18, 0.97), 'wood_walnut', bevel=0.012))
    for k, x in enumerate((-0.84, -0.28, 0.28, 0.84)):
        parts += kit.monitor(f'tm{k}', x, 0.2, 0.99, W=0.4, H=0.24, screen=f'noc_desk{4 + k}_screen')
    parts += curved_desk('cd_', 2.4, -0.48, 0.48, 7, -0.52)
    parts += desk_monitors('dm', 2.4, (-0.32, -0.11, 0.11, 0.32), -0.52, 0.745)
    for k, a in enumerate((-0.22, 0.0, 0.22)):
        parts.append(box(f'kbd{k}', (0.34, 0.12, 0.02), (2.4 * math.sin(a), -0.52 + 2.4 - 2.4 * math.cos(a) - 0.08, 0.755), 'metal_soft', bevel=0, rot=(0, 0, a)))
    return parts


build(1, l1, 'noc')
build(2, l2, 'noc')
reset()
join(l3(), 'noc_l3')
uvsphere('noc_beacon_led', 0.07, (1.35, 0.3, 2.64), 'led_red', seg=10, rings=6)
export(tier_path(3), budget=BUDGET[3])
