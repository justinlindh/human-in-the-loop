"""Reusable furniture builders shared by props and tiered shop items.

Every builder takes a name prefix p (keeps object names unique inside one file) plus a
placement x, y, rz, and returns the list of static parts to join. Parts that the game animates
(screens, LEDs) are created as separate named objects and are not returned.
"""
import math
import random
from common import box, cyl, sphere, uvsphere, torus, plane, lathe, prism, place, displace_noise

BOOKS = ['fabric_teal', 'fabric_mustard', 'fabric_terracotta', 'fabric_slate', 'fabric_sage', 'paper_sheet', 'wood_dark', 'cardboard']


def desk(p, x=0, y=0, rz=0, W=1.3, D=0.7, H=0.62, top='wood_honey', frame='metal_dark', tray=True):
    T = 0.06
    parts = [box(f'{p}top', (W, D, T), (0, 0, H - T / 2), top, bevel=0.022, segments=3)]
    for sx in (-1, 1):
        lx = sx * (W / 2 - 0.1)
        for sy in (-1, 1):
            parts.append(box(f'{p}leg{sx}{sy}', (0.05, 0.05, H - T), (lx, sy * (D / 2 - 0.09), (H - T) / 2), frame, bevel=0.012))
        parts.append(box(f'{p}foot{sx}', (0.06, D - 0.1, 0.035), (lx, 0, 0.0175), frame, bevel=0.012))
        parts.append(box(f'{p}rail{sx}', (0.04, D - 0.14, 0.04), (lx, 0, H - T - 0.03), frame, bevel=0.01))
    if tray:
        parts.append(box(f'{p}tray', (W - 0.4, 0.12, 0.07), (0, D / 2 - 0.14, H - T - 0.08), 'metal_soft', bevel=0.012))
        parts.append(cyl(f'{p}cable', 0.012, H - T - 0.1, (0.28, D / 2 - 0.12, (H - T - 0.1) / 2), 'plastic_charcoal', verts=8, bevel=0))
    return place(parts, x, y, rz)


def monitor(p, x=0, y=0, z=0, rz=0, W=0.62, H=0.38, screen='monitor_screen'):
    Z = z + 0.37 * H / 0.38
    parts = [
        box(f'{p}mbase', (0.24, 0.17, 0.018), (0, 0.02, z + 0.009), 'plastic_charcoal', bevel=0.008),
        box(f'{p}mneck', (0.05, 0.03, Z - z - 0.15), (0, 0.05, z + (Z - z - 0.15) / 2 + 0.01), 'metal_soft', bevel=0.01),
        box(f'{p}bezel', (W, 0.035, H), (0, 0, Z), 'plastic_charcoal', bevel=0.012),
        box(f'{p}hump', (W * 0.42, 0.05, H * 0.47), (0, 0.035, Z), 'plastic_charcoal', bevel=0.02),
    ]
    place(parts, x, y, rz)
    scr = plane(screen, W - 0.04, H - 0.05, (0, -0.0182, Z + 0.006), 'screen')
    place([scr], x, y, rz)
    return parts


def laptop(p, x=0, y=0, z=0, rz=0, screen='laptop_screen'):
    W, D = 0.34, 0.24
    tilt = math.radians(-18)
    parts = [
        box(f'{p}lbase', (W, D, 0.018), (0, 0, z + 0.009), 'metal_soft', bevel=0.006),
        box(f'{p}lkeys', (W - 0.05, D * 0.45, 0.003), (0, 0.02, z + 0.019), 'plastic_charcoal', bevel=0),
    ]
    hz = z + 0.018 + 0.11 * math.cos(tilt)
    hy = D / 2 + 0.11 * math.sin(-tilt) - 0.005
    parts.append(box(f'{p}lid', (W, 0.012, 0.22), (0, hy, hz), 'metal_soft', bevel=0.005, rot=(tilt, 0, 0)))
    place(parts, x, y, rz)
    # The screen sits just proud of the lid's inner face, along the lid's tilted normal.
    scr = plane(screen, W - 0.03, 0.19, (0, hy - 0.0078 * math.cos(tilt), hz + 0.0078 * math.sin(-tilt)), 'screen', rot=(math.pi / 2 + tilt, 0, 0))
    place([scr], x, y, rz)
    return parts


def rack(p, x=0, y=0, rz=0, W=0.6, D=0.68, H=1.56, glass_door=False, led=None):
    """Server rack. LEDs are named <led>_NN (default rack_led_NN)."""
    led = led or 'rack_led'
    parts = [
        box(f'{p}body', (W, D, H - 0.06), (0, 0, 0.06 + (H - 0.06) / 2), 'plastic_charcoal', bevel=0.03),
        box(f'{p}plinth', (W - 0.06, D - 0.06, 0.07), (0, 0, 0.035), 'metal_dark', bevel=0.01),
        box(f'{p}cap', (W - 0.08, D - 0.08, 0.03), (0, 0, H + 0.005), 'metal_dark', bevel=0.01),
    ]
    n = 6
    step = (H - 0.3) / n
    face = -D / 2 - 0.005 + (0.03 if glass_door else 0)
    for i in range(n):
        z = 0.25 + i * step
        parts.append(box(f'{p}unit{i}', (W - 0.1, 0.03, step * 0.83), (0, face, z), 'metal_dark' if i % 2 else 'metal_soft', bevel=0.008, segments=1))
        for v in range(4):
            parts.append(box(f'{p}vent{i}{v}', (0.022, 0.006, step * 0.5), (-0.04 + v * 0.045, face - 0.017, z), 'plastic_charcoal', bevel=0))
        if not glass_door:
            parts.append(box(f'{p}handle{i}', (0.025, 0.02, step * 0.4), (W / 2 - 0.08, face - 0.023, z), 'metal_soft', bevel=0.006, segments=1))
    if glass_door:
        fz = 0.06 + (H - 0.06) / 2
        for sx in (-1, 1):
            parts.append(box(f'{p}dframe{sx}', (0.04, 0.03, H - 0.1), (sx * (W / 2 - 0.02), -D / 2 - 0.01, fz), 'metal_soft', bevel=0.008))
        parts.append(box(f'{p}dhandle', (0.02, 0.03, 0.3), (W / 2 - 0.07, -D / 2 - 0.04, fz), 'metal_soft', bevel=0.006))
    place(parts, x, y, rz)
    leds = []
    for i in range(n):
        z = 0.25 + i * step
        for j in range(2):
            leds.append(box(f'{led}_{i * 2 + j:02d}', (0.028, 0.012, 0.028), (-W / 2 + 0.1 + j * 0.05, face - 0.019, z + step * 0.2), 'led', bevel=0))
    place(leds, x, y, rz)
    if glass_door:
        pane = plane(f'{p}glass', W - 0.08, H - 0.14, (0, -D / 2 - 0.012, 0.06 + (H - 0.06) / 2), 'glass')
        place([pane], x, y, rz)
    return parts


def bookshelf(p, x=0, y=0, rz=0, W=0.95, D=0.34, H=1.6, seed=11, wood='wood_honey'):
    rnd = random.Random(seed)
    T = 0.035
    parts = [box(f'{p}back', (W, 0.02, H), (0, D / 2 - 0.01, H / 2), 'wood_light', bevel=0.005)]
    for sx in (-1, 1):
        parts.append(box(f'{p}side{sx}', (T, D, H), (sx * (W / 2 - T / 2), 0, H / 2), wood, bevel=0.012))
    n = max(3, round(H / 0.38))
    shelves = [0.06 + i * (H - 0.06 - T / 2) / n for i in range(n)] + [H - T / 2]
    for i, z in enumerate(shelves):
        parts.append(box(f'{p}shelf{i}', (W - 2 * T + 0.002, D, T), (0, 0, z), wood, bevel=0.01))
    for s in range(len(shelves) - 1):
        z0 = shelves[s] + T / 2
        room = shelves[s + 1] - z0 - T / 2
        xx = -W / 2 + T + 0.02
        end = W / 2 - T - 0.02
        while xx < end - 0.05:
            kind = rnd.random()
            if kind < 0.12 and xx < end - 0.2:
                for k in range(3):
                    parts.append(box(f'{p}stack{s}_{k}_{xx:.2f}', (0.18, 0.22, 0.04), (xx + 0.09, -0.02, z0 + 0.02 + k * 0.042), rnd.choice(BOOKS), bevel=0))
                xx += 0.2
                continue
            w = rnd.uniform(0.03, 0.055)
            h = min(room - 0.02, rnd.uniform(0.2, 0.3))
            lean = math.radians(12) if kind > 0.9 else 0
            parts.append(box(f'{p}book{s}_{xx:.3f}', (w, rnd.uniform(0.2, 0.26), h), (xx + w / 2 + (h / 2) * math.sin(lean), -0.02, z0 + h / 2 * math.cos(lean)), rnd.choice(BOOKS), bevel=0, rot=(0, lean, 0)))
            xx += w + 0.004 + (h * math.sin(lean))
            if rnd.random() < 0.1:
                xx += 0.08
    return place(parts, x, y, rz)


def couch(p, x=0, y=0, rz=0, W=1.7, D=0.82, fabric='fabric_teal', pillow='fabric_mustard'):
    parts = [box(f'{p}base', (W, D, 0.22), (0, 0, 0.23), fabric, bevel=0.05, segments=3)]
    for sx in (-1, 1):
        parts.append(box(f'{p}arm{sx}', (0.18, D, 0.44), (sx * (W / 2 - 0.09), 0, 0.34), fabric, bevel=0.07, segments=3))
        parts.append(box(f'{p}seat{sx}', ((W - 0.36) / 2 - 0.01, D - 0.22, 0.14), (sx * (W - 0.36) / 4, -0.08, 0.41), fabric, bevel=0.06, segments=3))
        parts.append(box(f'{p}back{sx}', ((W - 0.36) / 2 - 0.01, 0.2, 0.42), (sx * (W - 0.36) / 4, D / 2 - 0.13, 0.55), fabric, bevel=0.08, segments=3, rot=(math.radians(-10), 0, 0)))
        for sy in (-1, 1):
            parts.append(cyl(f'{p}leg{sx}{sy}', 0.03, 0.12, (sx * (W / 2 - 0.1), sy * (D / 2 - 0.1), 0.06), 'wood_dark', verts=8, bevel=0, r2=0.022))
    if pillow:
        parts.append(box(f'{p}pillow', (0.3, 0.12, 0.3), (-W / 2 + 0.36, 0.12, 0.62), pillow, bevel=0.06, segments=3, rot=(math.radians(-18), math.radians(10), 0)))
    return place(parts, x, y, rz)


def armchair(p, x=0, y=0, rz=0, fabric='fabric_terracotta', seg=3):
    W, D = 0.8, 0.78
    parts = [box(f'{p}base', (W, D, 0.22), (0, 0, 0.23), fabric, bevel=0.05, segments=seg)]
    for sx in (-1, 1):
        parts.append(box(f'{p}arm{sx}', (0.16, D, 0.42), (sx * (W / 2 - 0.08), 0, 0.33), fabric, bevel=0.07, segments=seg))
        for sy in (-1, 1):
            parts.append(cyl(f'{p}leg{sx}{sy}', 0.028, 0.12, (sx * (W / 2 - 0.09), sy * (D / 2 - 0.09), 0.06), 'wood_dark', verts=8, bevel=0, r2=0.02))
    parts.append(box(f'{p}seat', (W - 0.34, D - 0.2, 0.14), (0, -0.07, 0.41), fabric, bevel=0.06, segments=seg))
    parts.append(box(f'{p}back', (W - 0.1, 0.2, 0.5), (0, D / 2 - 0.12, 0.58), fabric, bevel=0.08, segments=seg, rot=(math.radians(-10), 0, 0)))
    return place(parts, x, y, rz)


def side_table(p, x=0, y=0, rz=0, r=0.22, h=0.48, top='wood_honey'):
    parts = [
        cyl(f'{p}ttop', r, 0.04, (0, 0, h - 0.02), top, verts=24, bevel=0.012),
        cyl(f'{p}tstem', 0.03, h - 0.06, (0, 0, (h - 0.04) / 2 + 0.02), 'metal_dark', verts=10, bevel=0),
        cyl(f'{p}tfoot', r * 0.7, 0.025, (0, 0, 0.0125), 'metal_dark', verts=20, bevel=0.008),
    ]
    return place(parts, x, y, rz)


def mug(p, x, y, z, material='mug'):
    parts = [
        lathe(f'{p}mug', [(0.001, 0), (0.035, 0), (0.042, 0.01), (0.045, 0.09), (0.04, 0.09), (0.037, 0.02), (0.001, 0.02)], (x, y, z), material, steps=12),
        torus(f'{p}mugh', 0.022, 0.007, (x + 0.05, y, z + 0.05), material, rot=(math.pi / 2, 0, 0), major_seg=10, minor_seg=5),
    ]
    return parts


def stack_books(p, x, y, z, n=3, seed=3):
    rnd = random.Random(seed)
    return [box(f'{p}sb{k}', (rnd.uniform(0.16, 0.22), rnd.uniform(0.2, 0.25), 0.04), (x, y, z + 0.02 + k * 0.042), rnd.choice(BOOKS), bevel=0.006, segments=1, rot=(0, 0, rnd.uniform(-0.3, 0.3))) for k in range(n)]


def pot_plant(p, x=0, y=0, rz=0, s=1.0, pot='pot_terracotta', seed=1, tall=False, z=0.0, detail=2):
    """Potted plant; s scales the whole thing. tall=True gives stems and several clusters."""
    parts = []
    if pot == 'pot_terracotta':
        prof = [(0.001, 0), (0.17, 0), (0.19, 0.02), (0.22, 0.34), (0.245, 0.35), (0.25, 0.4), (0.225, 0.41), (0.205, 0.38), (0.001, 0.38)]
        top = 0.38
    else:
        prof = [(0.001, 0), (0.12, 0), (0.13, 0.015), (0.15, 0.2), (0.165, 0.22), (0.16, 0.24), (0.14, 0.23), (0.001, 0.23)]
        top = 0.23
    prof = [(r * s, z * s) for r, z in prof]
    top *= s
    rs = prof[4][0]
    parts.append(lathe(f'{p}pot', prof, (0, 0, 0), pot, steps=20 if detail > 1 else 12))
    parts.append(cyl(f'{p}soil', rs * 0.85, 0.02 * s, (0, 0, top - 0.005 * s), 'soil', verts=16 if detail > 1 else 10, bevel=0.006 * s if detail > 1 else 0))
    rnd = random.Random(seed)
    if tall:
        stems = [((0.05, -0.02), 1.2), ((-0.18, 0.08), 0.95), ((0.16, 0.12), 0.8)]
        for i, ((sx, sy), h) in enumerate(stems):
            dx, dy, dz = sx * s, sy * s, (h - 0.38) * s
            L = math.sqrt(dx * dx + dy * dy + dz * dz)
            parts.append(cyl(f'{p}stem{i}', 0.02 * s, L, (dx / 2, dy / 2, top + dz / 2), 'wood_dark', verts=8, bevel=0,
                             rot=(-math.atan2(dy, dz), math.atan2(dx, math.sqrt(dy * dy + dz * dz)), 0)))
        clusters = [((0.05, -0.02, 1.28), 0.3, 'leaf'), ((-0.2, 0.08, 1.0), 0.26, 'leaf_dark'), ((0.18, 0.12, 0.86), 0.22, 'leaf'),
                    ((0.12, -0.1, 1.05), 0.2, 'leaf_light'), ((-0.08, -0.08, 1.45), 0.18, 'leaf_light')]
    else:
        clusters = [((0, 0, 0.36), 0.18, 'leaf'), ((0.09, -0.06, 0.3), 0.12, 'leaf_light'), ((-0.08, 0.05, 0.31), 0.13, 'leaf_dark')]
        clusters = [((cx, cy, cz - 0.23 + 0.23), r, m) for (cx, cy, cz), r, m in clusters]
    for i, ((cx, cy, cz), r, m) in enumerate(clusters):
        o = sphere(f'{p}leaf{i}', r * s, (cx * s, cy * s, cz * s if tall else top + (cz - 0.23) * s), m, subdiv=detail, scale=(1, 1, 0.84))
        displace_noise(o, strength=r * s * 0.33, size=0.25 * s, seed=seed * 7 + i)
        parts.append(o)
    for o in parts:
        o.location.z += z
    return place(parts, x, y, rz)


def trailing_plant(p, x, y, z, s=1.0, seed=2):
    """Small pot with vines hanging over the front edge (for shelves)."""
    parts = [cyl(f'{p}tp', 0.09 * s, 0.14 * s, (0, 0, z + 0.07 * s), 'pot_cream', verts=12, bevel=0.01, segments=1)]
    o = sphere(f'{p}tpl', 0.12 * s, (0, 0, z + 0.17 * s), 'leaf', subdiv=1, scale=(1, 1, 0.7))
    displace_noise(o, strength=0.04 * s, size=0.2, seed=seed)
    parts.append(o)
    for k in range(3):
        v = sphere(f'{p}vine{k}', 0.05 * s, ((k - 1) * 0.07 * s, -0.1 * s, z + (0.02 - k * 0.04) * s), 'leaf_dark' if k % 2 else 'leaf_light', subdiv=1, scale=(1, 0.8, 1.6))
        parts.append(v)
    return place(parts, x, y, 0)


def espresso_machine(p, x, y, z, s=1.0, body='plastic_charcoal', groups=1, led='coffee_led'):
    W = 0.34 * s * (1 + 0.45 * (groups - 1))
    parts = [
        box(f'{p}m_body', (W, 0.32 * s, 0.44 * s), (0, 0.05 * s, z + 0.22 * s), body, bevel=0.035 * s),
        box(f'{p}m_face', (W - 0.04 * s, 0.02 * s, 0.18 * s), (0, -0.115 * s, z + 0.33 * s), 'metal_soft', bevel=0.012 * s),
        box(f'{p}m_hood', (W, 0.2 * s, 0.05 * s), (0, -0.12 * s, z + 0.4 * s), body, bevel=0.02 * s),
        box(f'{p}m_tray', (W - 0.06 * s, 0.14 * s, 0.03 * s), (0, -0.16 * s, z + 0.015 * s), 'metal_soft', bevel=0.01 * s),
    ]
    for g in range(groups):
        gx = (g - (groups - 1) / 2) * 0.2 * s
        parts.append(cyl(f'{p}m_group{g}', 0.04 * s, 0.05 * s, (gx, -0.17 * s, z + 0.35 * s), 'metal_soft', verts=16, bevel=0.008))
        parts.append(box(f'{p}m_handle{g}', (0.02 * s, 0.12 * s, 0.02 * s), (gx, -0.26 * s, z + 0.34 * s), 'plastic_charcoal', bevel=0.008))
        parts += mug(f'{p}m_cup{g}', gx, -0.16 * s, z + 0.03 * s)
    parts.append(cyl(f'{p}m_knob', 0.022 * s, 0.02 * s, (W / 2 - 0.07 * s, -0.13 * s, z + 0.33 * s), 'plastic_charcoal', verts=12, bevel=0.005, rot=(math.pi / 2, 0, 0)))
    place(parts, x, y, 0)
    if led:
        l = box(led, (0.025, 0.01, 0.025), (-W / 2 + 0.07 * s, -0.128 * s, z + 0.36 * s), 'led_amber', bevel=0)
        place([l], x, y, 0)
    return parts


def grinder(p, x, y, z, s=1.0, body='plastic_charcoal'):
    parts = [
        box(f'{p}g_base', (0.14 * s, 0.2 * s, 0.26 * s), (0, 0, z + 0.13 * s), body, bevel=0.025 * s),
        lathe(f'{p}g_hopper', [(0.001, 0.26 * s), (0.04 * s, 0.26 * s), (0.07 * s, 0.4 * s), (0.07 * s, 0.42 * s), (0.001, 0.42 * s)], (0, 0, z), 'glass_frame', steps=12),
    ]
    return place(parts, x, y, 0)


def counter(p, x=0, y=0, rz=0, W=0.95, D=0.56, H=0.82, body='laminate', top='wood_honey', doors=2):
    parts = [
        box(f'{p}cabinet', (W, D - 0.04, H - 0.06), (0, 0.02, 0.04 + (H - 0.06) / 2), body, bevel=0.02),
        box(f'{p}kick', (W - 0.06, D - 0.1, 0.06), (0, 0.05, 0.03), 'wood_walnut', bevel=0.008),
        box(f'{p}counter', (W + 0.04, D + 0.02, 0.05), (0, 0, H), top, bevel=0.018),
    ]
    dw = W / doors
    for i in range(doors):
        dx = -W / 2 + dw * (i + 0.5)
        parts.append(box(f'{p}door{i}', (dw - 0.03, 0.02, H - 0.16), (dx, -D / 2 + 0.005, 0.07 + (H - 0.16) / 2), body, bevel=0.012))
        parts.append(box(f'{p}knob{i}', (0.012, 0.03, 0.12), (dx + (dw / 2 - 0.06) * (1 if i % 2 == 0 else -1), -D / 2 - 0.012, H - 0.18), 'wood_dark', bevel=0.005))
    return place(parts, x, y, rz)


def whiteboard_face(p, W, H, Z, fy, seed=4, density=1.0):
    """Marker diagrams and sticky notes on a board face at depth fy, centered at height Z."""
    rnd = random.Random(seed)
    parts = []
    nbox = max(2, int(3 * density * W / 1.4))
    for i in range(nbox):
        bx = -W / 2 + 0.25 + rnd.uniform(0, W * 0.55)
        bz = Z + rnd.uniform(-H * 0.25, H * 0.3)
        w, h = rnd.uniform(0.2, 0.32), rnd.uniform(0.1, 0.16)
        c = rnd.choice(['marker_blue', 'marker_green', 'marker_blue'])
        for j, (dx, dz, sw, sh) in enumerate([(0, h / 2, w, 0.012), (0, -h / 2, w, 0.012), (-w / 2, 0, 0.012, h), (w / 2, 0, 0.012, h)]):
            parts.append(box(f'{p}r{i}{j}', (sw, 0.004, sh), (bx + dx, fy, bz + dz), c, bevel=0))
        if i:
            parts.append(box(f'{p}a{i}', (0.012, 0.004, rnd.uniform(0.08, 0.16)), (bx - w / 2 - 0.02, fy, bz + 0.05), 'marker_orange', bevel=0, rot=(0, rnd.uniform(-1.2, 1.2), 0)))
    for i in range(int(4 * density)):
        parts.append(box(f'{p}line{i}', (rnd.uniform(0.1, 0.26), 0.004, 0.01), (W / 2 - 0.28, fy, Z + H * 0.35 - i * 0.07), 'marker_orange' if i == 0 else 'marker_blue', bevel=0))
    notes = ['rug_mustard', 'fabric_sage', 'role_designer', 'screen_amber', 'fabric_mustard']
    for i in range(int(3 * density)):
        parts.append(box(f'{p}note{i}', (0.09, 0.006, 0.09), (W / 2 - 0.35 + rnd.uniform(-0.1, 0.2), fy - 0.002, Z - H * 0.15 - rnd.uniform(0, H * 0.25)), notes[i % len(notes)], bevel=0, rot=(0, rnd.uniform(-0.15, 0.15), 0)))
    return parts


def mobile_whiteboard(p, x=0, y=0, rz=0, W=1.4, H=0.85, Z=1.0, seed=4):
    parts = [
        box(f'{p}board', (W, 0.04, H), (0, 0, Z), 'whiteboard', bevel=0.01),
        box(f'{p}frame_t', (W + 0.04, 0.05, 0.035), (0, 0, Z + H / 2), 'metal_soft', bevel=0.012),
        box(f'{p}frame_b', (W + 0.04, 0.05, 0.035), (0, 0, Z - H / 2), 'metal_soft', bevel=0.012),
        box(f'{p}frame_l', (0.035, 0.05, H), (-W / 2, 0, Z), 'metal_soft', bevel=0.012),
        box(f'{p}frame_r', (0.035, 0.05, H), (W / 2, 0, Z), 'metal_soft', bevel=0.012),
        box(f'{p}wtray', (0.6, 0.08, 0.02), (0, -0.05, Z - H / 2 - 0.01), 'metal_soft', bevel=0.006),
    ]
    for sx in (-1, 1):
        parts.append(box(f'{p}post{sx}', (0.04, 0.04, Z + H / 2 - 0.05), (sx * (W / 2 + 0.03), 0.03, (Z + H / 2 - 0.05) / 2 + 0.05), 'metal_soft', bevel=0.012))
        parts.append(box(f'{p}foot{sx}', (0.06, 0.5, 0.04), (sx * (W / 2 + 0.03), 0.03, 0.07), 'metal_soft', bevel=0.015))
        for sy in (-1, 1):
            parts.append(uvsphere(f'{p}wheel{sx}{sy}', 0.035, (sx * (W / 2 + 0.03), 0.03 + sy * 0.22, 0.035), 'plastic_charcoal', seg=8, rings=5))
    parts += whiteboard_face(p, W, H, Z, -0.021, seed)
    for i, c in enumerate(['marker_blue', 'marker_green', 'marker_orange']):
        parts.append(cyl(f'{p}marker{i}', 0.01, 0.12, (-0.12 + i * 0.07, -0.06, Z - H / 2 + 0.01), c, verts=8, bevel=0, rot=(0, math.pi / 2, 0)))
    return place(parts, x, y, rz)


def trophy(p, x, y, z, s=1.0, kind='cup'):
    seg = 1 if s < 1 else 2
    parts = [box(f'{p}plinth', (0.2 * s, 0.2 * s, 0.08 * s), (0, 0, z + 0.04 * s), 'wood_walnut', bevel=0.012 * s, segments=seg)]
    if kind == 'cup':
        prof = [(0.001, 0.08), (0.05, 0.08), (0.05, 0.095), (0.015, 0.11), (0.015, 0.17), (0.03, 0.19), (0.075, 0.23), (0.1, 0.31), (0.105, 0.35), (0.095, 0.35), (0.001, 0.28)]
        parts.append(lathe(f'{p}cup', [(r * s, zz * s) for r, zz in prof], (0, 0, z), 'gold', steps=12 if s < 1 else 16))
        for sx in (-1, 1):
            parts.append(torus(f'{p}handle{sx}', 0.045 * s, 0.011 * s, (sx * 0.1 * s, 0, z + 0.28 * s), 'gold', rot=(math.pi / 2, 0, 0), major_seg=10, minor_seg=4))
    elif kind == 'star':
        parts.append(cyl(f'{p}post', 0.015 * s, 0.14 * s, (0, 0, z + 0.15 * s), 'gold', verts=8, bevel=0))
        parts.append(cyl(f'{p}star', 0.09 * s, 0.03 * s, (0, 0, z + 0.3 * s), 'gold', verts=5, bevel=0.006, rot=(math.pi / 2, 0, 0)))
    elif kind == 'plaque':
        parts.append(box(f'{p}plq', (0.18 * s, 0.03 * s, 0.24 * s), (0, 0, z + 0.2 * s), 'wood_dark', bevel=0.01 * s, rot=(math.radians(-12), 0, 0)))
        parts.append(box(f'{p}plqg', (0.13 * s, 0.01 * s, 0.16 * s), (0, -0.02 * s, z + 0.2 * s), 'gold', bevel=0.004, rot=(math.radians(-12), 0, 0)))
    elif kind == 'orb':
        parts.append(cyl(f'{p}post', 0.03 * s, 0.1 * s, (0, 0, z + 0.13 * s), 'gold', verts=10, bevel=0.005, segments=seg))
        parts.append(uvsphere(f'{p}orb', 0.09 * s, (0, 0, z + 0.26 * s), 'gold', seg=16, rings=10))
    return place(parts, x, y, 0)


def floor_lamp(p, x, y, h=1.5, shade='paper_sheet'):
    parts = [
        cyl(f'{p}lbase', 0.14, 0.03, (0, 0, 0.015), 'metal_dark', verts=20, bevel=0.01),
        cyl(f'{p}lpole', 0.015, h - 0.2, (0, 0, (h - 0.2) / 2 + 0.03), 'metal_dark', verts=8, bevel=0),
        cyl(f'{p}lshade', 0.2, 0.26, (0, 0, h - 0.08), shade, verts=20, bevel=0.01, r2=0.13),
    ]
    place(parts, x, y, 0)
    bulb = uvsphere(f'{p}_lamp_glow', 0.07, (0, 0, h - 0.2), 'lamp', seg=10, rings=6)
    place([bulb], x, y, 0)
    return parts


def stool(p, x, y, h=0.62, seat='fabric_terracotta'):
    parts = [
        cyl(f'{p}sseat', 0.17, 0.06, (0, 0, h - 0.03), seat, verts=20, bevel=0.02),
        cyl(f'{p}spole', 0.025, h - 0.06, (0, 0, (h - 0.06) / 2), 'metal_soft', verts=10, bevel=0),
        cyl(f'{p}sfoot', 0.16, 0.025, (0, 0, 0.0125), 'metal_soft', verts=20, bevel=0.008),
        torus(f'{p}sring', 0.13, 0.012, (0, 0, h * 0.35), 'metal_soft', major_seg=16, minor_seg=5),
    ]
    return place(parts, x, y, 0)


def arcade_cabinet(p, x=0, y=0, rz=0, body='role_sales', trim='plastic_charcoal', screen='arcade_screen', marquee='neon_pink'):
    W = 0.66
    side = [(0.3, 0.0), (0.3, 1.72), (-0.08, 1.72), (-0.12, 1.5), (-0.02, 1.46), (-0.08, 1.05), (-0.32, 0.98), (-0.32, 0.86), (-0.12, 0.8), (-0.12, 0.0)]
    parts = [
        prism(f'{p}sideL', side, 0.05, (-W / 2 + 0.025, 0, 0), body, bevel=0.012),
        prism(f'{p}sideR', side, 0.05, (W / 2 - 0.025, 0, 0), body, bevel=0.012),
        box(f'{p}core', (W - 0.1, 0.36, 1.66), (0, 0.11, 0.83), trim, bevel=0.01),
        box(f'{p}kick', (W - 0.1, 0.02, 0.78), (0, -0.12, 0.4), body, bevel=0.01),
        box(f'{p}panel', (W - 0.08, 0.3, 0.05), (0, -0.2, 0.93), trim, bevel=0.012, rot=(math.radians(-12), 0, 0)),
        box(f'{p}coin', (0.14, 0.02, 0.1), (0, -0.13, 0.55), 'metal_soft', bevel=0.006),
        box(f'{p}bezel', (W - 0.08, 0.04, 0.46), (0, -0.05, 1.25), trim, bevel=0.01, rot=(math.radians(-14), 0, 0)),
    ]
    parts.append(cyl(f'{p}stick', 0.012, 0.08, (-0.14, -0.22, 1.0), 'metal_soft', verts=8, bevel=0))
    parts.append(uvsphere(f'{p}ball', 0.03, (-0.14, -0.22, 1.05), 'role_designer', seg=10, rings=6))
    for i, c in enumerate(['role_marketer', 'role_support', 'role_engineer']):
        parts.append(cyl(f'{p}btn{i}', 0.022, 0.02, (0.03 + i * 0.07, -0.22 + i * 0.012, 0.965 + i * 0.003), c, verts=12, bevel=0.004, rot=(math.radians(-12), 0, 0)))
    place(parts, x, y, rz)
    scr = plane(screen, W - 0.16, 0.36, (0, -0.075, 1.25), 'screen', rot=(math.pi / 2 - math.radians(14), 0, 0))
    mq = box(f'{p}_marquee', (W - 0.1, 0.03, 0.16), (0, -0.07, 1.6), marquee, bevel=0)
    place([scr, mq], x, y, rz)
    return parts


def monitor_wall(p, x=0, y=0, rz=0, W=2.3, H=1.2, Z=1.38, console=True, tiles=None, screen='wall_screen', led='wall_led', leds=3):
    """Big display on posts; tiles=(cols, rows) draws video-wall seams over one screen quad."""
    parts = [
        box(f'{p}bezel', (W, 0.08, H), (0, 0.06, Z), 'plastic_charcoal', bevel=0.025),
        box(f'{p}back', (W - 0.4, 0.1, H - 0.4), (0, 0.13, Z), 'metal_dark', bevel=0.03),
    ]
    for sx in (-1, 1):
        parts.append(box(f'{p}post{sx}', (0.08, 0.08, Z - H / 2 + 0.1), (sx * (W / 2 - 0.3), 0.13, (Z - H / 2 + 0.1) / 2), 'metal_dark', bevel=0.015))
    if tiles:
        cols, rows = tiles
        for i in range(1, cols):
            parts.append(box(f'{p}seamv{i}', (0.02, 0.01, H - 0.08), (-W / 2 + W * i / cols, 0.012, Z), 'plastic_charcoal', bevel=0))
        for j in range(1, rows):
            parts.append(box(f'{p}seamh{j}', (W - 0.08, 0.01, 0.02), (0, 0.012, Z - H / 2 + H * j / rows), 'plastic_charcoal', bevel=0))
    if console:
        cw = min(W - 0.3, 2.0)
        parts += [
            box(f'{p}console', (cw, 0.5, 0.6), (0, -0.18, 0.3), 'plastic_charcoal', bevel=0.03),
            box(f'{p}console_top', (cw + 0.04, 0.54, 0.04), (0, -0.18, 0.61), 'wood_walnut', bevel=0.015),
            box(f'{p}console_face', (cw - 0.2, 0.02, 0.36), (0, -0.44, 0.3), 'metal_dark', bevel=0.01),
        ]
        n = max(1, int(cw / 0.7))
        for i in range(n):
            parts.append(box(f'{p}kbd{i}', (0.36, 0.14, 0.02), ((i - (n - 1) / 2) * 0.7, -0.26, 0.64), 'metal_soft', bevel=0.006))
    place(parts, x, y, rz)
    dyn = [plane(screen, W - 0.1, H - 0.1, (0, 0.018, Z), 'screen')]
    if console:
        for i in range(leds):
            dyn.append(box(f'{led}_{i}', (0.035, 0.012, 0.035), ((i - (leds - 1) / 2) * 0.3, -0.455, 0.42), 'led', bevel=0))
    place(dyn, x, y, rz)
    return parts
