"""Office shop: dotcom_banner (Banner Rotation Server). l1 a beige tower and a CRT on a steel cart under
a wall banner ad, l2 two towers and a second banner, l3 a server cabinet beside a three-sided rotating
sign of prisms. The banners are bright stripes with a glowing red CLICK button and no text, so they read
as a web ad from the overhead camera. Palette materials only, so the batch draws them in buckets the
office already has."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

# Shop item tiers share one footprint: back edge near y = +0.5 (against a wall), front faces -Y.
BUDGET = {1: 3000, 2: 4000, 3: 6000}
BEIGE = 'wall_cream'


def tower(p, x, y, z, W=0.22, D=0.42, H=0.46):
    """A beige 1999 tower: drive bays at the top, a power button, two LEDs."""
    fy = y - D / 2
    parts = [box(f'{p}case', (W, D, H), (x, y, z + H / 2), BEIGE, 0.012, 1)]
    for i in range(2):
        parts.append(box(f'{p}bay{i}', (W - 0.04, 0.01, 0.045), (x, fy - 0.004, z + H - 0.06 - i * 0.06), 'plastic_white', 0.003, 1))
    parts += [box(f'{p}floppy', (W - 0.08, 0.01, 0.025), (x, fy - 0.004, z + H - 0.19), 'plastic_charcoal', 0.002, 1),
              cyl(f'{p}power', 0.02, 0.012, (x, fy - 0.006, z + 0.12), 'plastic_charcoal', verts=10, bevel=0, rot=(math.pi / 2, 0, 0)),
              box(f'{p}a_led', (0.02, 0.008, 0.012), (x - 0.04, fy - 0.006, z + 0.06), 'led', 0),
              box(f'{p}b_led', (0.02, 0.008, 0.012), (x + 0.04, fy - 0.006, z + 0.06), 'led_amber', 0)]
    return parts


def crt(p, x, y, z, s=1.0, ad='neon_pink'):
    """A beige CRT whose screen shows the banner ad: a pink field, a pale headline bar, a cyan button."""
    W, H, D = 0.42 * s, 0.36 * s, 0.4 * s
    fy = y - D / 2
    parts = [box(f'{p}shell', (W, D * 0.55, H), (x, y - D * 0.2, z + H / 2 + 0.03), BEIGE, 0.02, 1),
             box(f'{p}tube', (W * 0.7, D * 0.5, H * 0.72), (x, y + D * 0.25, z + H * 0.45 + 0.03), BEIGE, 0.03, 1),
             box(f'{p}foot', (W * 0.5, D * 0.5, 0.03), (x, y, z + 0.015), BEIGE, 0.008, 1),
             box(f'{p}glass', (W * 0.82, 0.01, H * 0.74), (x, fy + D * 0.02, z + H / 2 + 0.04), ad, 0),
             box(f'{p}headline', (W * 0.6, 0.006, H * 0.12), (x - W * 0.06, fy + D * 0.01, z + H * 0.62), 'paper_sheet', 0),
             box(f'{p}button', (W * 0.26, 0.006, H * 0.14), (x + W * 0.2, fy + D * 0.01, z + H * 0.36), 'neon_cyan', 0)]
    return parts


def banner(p, x, z, W=1.5, H=0.2, y=0.44, colours=('screen_pink', 'fabric_mustard', 'screen_cyan')):
    """A wall banner in web-ad proportions: a dark frame, three bright stripes (unlit, so bloom keeps them apart), a pale headline bar and a
    red CLICK button."""
    fy = y - 0.03
    parts = [box(f'{p}frame', (W + 0.06, 0.04, H + 0.06), (x, y, z), 'plastic_charcoal', 0.01, 1)]
    # Free-standing on two poles with feet, so it stands anywhere, not only against a wall.
    for sx in (-1, 1):
        px = x + sx * (W / 2 - 0.04)
        parts += [cyl(f'{p}pole{sx}', 0.018, z - H / 2, (px, y + 0.03, (z - H / 2) / 2), 'metal_dark', verts=8, bevel=0),
                  box(f'{p}foot{sx}', (0.07, 0.24, 0.025), (px, y - 0.04, 0.0125), 'metal_dark', 0.006, 1)]
    w = W / len(colours)
    for i, c in enumerate(colours):
        parts.append(box(f'{p}stripe{i}', (w, 0.012, H), (x - W / 2 + w * (i + 0.5), fy, z), c, 0))
    parts += [box(f'{p}headline', (W * 0.5, 0.008, H * 0.3), (x - W * 0.12, fy - 0.009, z + H * 0.12), 'paper_sheet', 0),
              box(f'{p}click_led', (W * 0.16, 0.01, H * 0.42), (x + W * 0.33, fy - 0.01, z - H * 0.08), 'led_red', 0.004, 1)]
    return parts


def prism_sign(p, x, z, W=1.3, H=0.42, y=0.4, n=9):
    """A three-sided rotating sign: vertical triangular prisms caught mid-turn, each face a different
    ad colour, in a frame on two posts."""
    parts = [box(f'{p}top', (W + 0.08, 0.1, 0.05), (x, y, z + H / 2 + 0.025), 'metal_dark', 0.01, 1),
             box(f'{p}bottom', (W + 0.08, 0.1, 0.05), (x, y, z - H / 2 - 0.025), 'metal_dark', 0.01, 1)]
    for sx in (-1, 1):
        parts.append(box(f'{p}post{sx}', (0.05, 0.05, z - H / 2 - 0.05), (x + sx * (W / 2 + 0.02), y, (z - H / 2 - 0.05) / 2), 'metal_dark', 0.006, 1))
    step = W / n
    faces = ('screen_pink', 'screen_cyan', 'fabric_mustard')
    for i in range(n):
        # Each prism is a 3-sided cylinder; the first few are caught turning so two faces show.
        turn = 0.5 if i < 3 else 0.0
        parts.append(cyl(f'{p}prism{i}', step * 0.62, H, (x - W / 2 + step * (i + 0.5), y - 0.01, z), faces[0] if i >= 3 else faces[1],
                         verts=3, bevel=0, rot=(0, 0, math.pi / 2 + turn)))
    parts.append(box(f'{p}click_led', (step * 1.6, 0.012, H * 0.3), (x + W * 0.3, y - 0.07, z - H * 0.2), 'led_red', 0.004, 1))
    return parts


def cart(p, x, W=0.9, H=0.62):
    return kit.desk(p, x, 0.15, W=W, D=0.55, H=H, top='metal_soft', frame='metal_dark', tray=False)


def l1():
    parts = cart('c_', 0.2)
    parts += tower('t0_', -0.1, 0.18, 0.62) + crt('m0_', 0.32, 0.12, 0.62)
    parts += banner('b0_', 0.0, 1.45)
    return parts


def l2():
    parts = cart('c_', 0.0, W=1.5)
    parts += tower('t0_', -0.55, 0.18, 0.62) + tower('t1_', -0.28, 0.18, 0.62) + crt('m0_', 0.2, 0.12, 0.62)
    parts += [box('printout', (0.22, 0.3, 0.05), (0.58, 0.05, 0.645), 'paper_sheet', 0.004, 1)]
    parts += banner('b0_', -0.15, 1.5, W=1.6) + banner('b1_', 0.25, 1.2, W=1.0, H=0.14, colours=('screen_cyan', 'screen_pink'))
    return parts


def l3():
    parts = kit.rack('r0_', -0.7, 0.15, H=1.3, led='rack0_led')
    parts += cart('c_', 0.0, W=0.6)
    parts += crt('m0_', 0.0, 0.12, 0.62, s=1.1)
    parts += prism_sign('s0_', 0.42, 1.25, W=1.0)
    return parts


reset(); join(l1(), 'dotcom_banner_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'dotcom_banner_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'dotcom_banner_l3'); export(tier_path(3), budget=BUDGET[3])
