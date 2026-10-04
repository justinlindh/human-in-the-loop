"""Modern-era street life outside the office: a food-delivery bike with its rider, a hire scooter,
a parcel drone, and a neighbourhood data centre in three states (going up, running, overgrown).
Each model is its own .glb. Vehicles face +X (the direction they drive); buildings face the
street (-Y here, +Z in the game)."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
from mathutils import Vector


def path(name):
    return os.path.join(os.path.dirname(out_path()), name + '.glb')


def wheel(p, x, z, r=0.2):
    return [cyl(p, r, 0.05, (x, 0, z), 'ink', verts=12, bevel=0, rot=(math.pi / 2, 0, 0)),
            cyl(p + '_hub', r * 0.35, 0.06, (x, 0, z), 'metal_soft', verts=8, bevel=0, rot=(math.pi / 2, 0, 0))]


def rod(p, a, b, r, material):
    """A thin cylinder from point a to point b."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = cyl(p, r, length, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), material, verts=6, bevel=0)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)).normalized())
    return o


# The delivery bike: a city bike, a rider leaning on the bars, and the insulated cube on their back.
# The cube is its own part (bike_box) so a plain cyclist can leave it off.
def delivery_bike():
    parts = wheel('wheel_f', 0.45, 0.2) + wheel('wheel_r', -0.45, 0.2)
    frame = [((-0.45, 0, 0.2), (0.0, 0, 0.2)), ((0.0, 0, 0.2), (0.3, 0, 0.62)), ((-0.45, 0, 0.2), (-0.15, 0, 0.6)),
             ((-0.15, 0, 0.6), (0.3, 0, 0.62)), ((0.0, 0, 0.2), (-0.15, 0, 0.6)), ((0.45, 0, 0.2), (0.32, 0, 0.72))]
    parts += [rod(f'frame{i}', a, b, 0.022, 'fabric_terracotta') for i, (a, b) in enumerate(frame)]
    parts += [box('bars', (0.04, 0.42, 0.03), (0.32, 0, 0.76), 'plastic_charcoal', 0.01, 1),
              box('saddle', (0.18, 0.08, 0.04), (-0.17, 0, 0.66), 'plastic_charcoal', 0.015, 1)]
    # Rider: legs to the pedals, a forward-leaning jacket, arms to the bars, a helmet.
    for s in (-1, 1):
        parts += [rod(f'thigh{s}', (-0.12, s * 0.09, 0.7), (0.05, s * 0.1, 0.5), 0.05, 'plastic_charcoal'),
                  rod(f'shin{s}', (0.05, s * 0.1, 0.5), (0.0, s * 0.1, 0.25), 0.045, 'plastic_charcoal'),
                  rod(f'arm{s}', (0.0, s * 0.15, 1.05), (0.3, s * 0.18, 0.78), 0.04, 'fabric_slate')]
    parts += [box('torso', (0.24, 0.3, 0.42), (-0.06, 0, 0.92), 'fabric_slate', 0.06, 2, rot=(0, math.radians(28), 0)),
              sphere('head', 0.12, (0.1, 0, 1.2), 'skin_2', subdiv=1),
              sphere('helmet', 0.135, (0.09, 0, 1.24), 'wall_cream', subdiv=1, scale=(1.05, 0.95, 0.75))]
    join(parts, 'era_delivery_bike')
    box_parts = [box('cube', (0.4, 0.4, 0.42), (-0.24, 0, 1.12), 'fabric_teal', 0.03, 1, rot=(0, math.radians(14), 0)),
                 box('cube_band', (0.41, 0.41, 0.06), (-0.24, 0, 1.17), 'paper_sheet', 0.01, 1, rot=(0, math.radians(14), 0))]
    join(box_parts, 'bike_box')


# A dockless hire scooter, parked: deck, stem, bars, two small wheels and a kickstand lean.
def hire_scooter():
    parts = wheel('wheel_f', 0.32, 0.09, r=0.09) + wheel('wheel_r', -0.32, 0.09, r=0.09)
    parts += [box('deck', (0.62, 0.15, 0.05), (0, 0, 0.12), 'plastic_charcoal', 0.015, 1),
              rod('stem', (0.32, 0, 0.12), (0.26, 0, 1.0), 0.025, 'fabric_mustard'),
              box('bars', (0.04, 0.42, 0.03), (0.26, 0, 1.0), 'plastic_charcoal', 0.01, 1),
              box('lamp', (0.04, 0.07, 0.05), (0.3, 0, 0.92), 'lamp', 0),
              box('plate', (0.02, 0.1, 0.12), (0.31, 0, 0.5), 'fabric_mustard', 0.005, 1)]
    ob = join(parts, 'era_hire_scooter')
    ob.rotation_euler = (math.radians(8), 0, 0)


# A quadcopter carrying a parcel, with lit arm tips.
def drone():
    parts = [box('body', (0.32, 0.32, 0.1), (0, 0, 0.36), 'wall_cream', 0.03, 1)]
    for i, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        parts += [rod(f'arm{i}', (0, 0, 0.38), (sx * 0.3, sy * 0.3, 0.4), 0.018, 'plastic_charcoal'),
                  cyl(f'rotor{i}', 0.15, 0.01, (sx * 0.3, sy * 0.3, 0.44), 'metal_soft', verts=12, bevel=0),
                  box(f'tip{i}', (0.04, 0.04, 0.03), (sx * 0.3, sy * 0.3, 0.41), 'led' if sx > 0 else 'led_red', 0)]
    parts += [rod('tether', (0, 0, 0.31), (0, 0, 0.2), 0.008, 'ink'),
              box('parcel', (0.26, 0.22, 0.2), (0, 0, 0.1), 'cardboard', 0.01, 1),
              box('tape', (0.27, 0.05, 0.205), (0, 0, 0.1), 'wall_cream', 0)]
    join(parts, 'era_drone')


# The data centre: 6 m long, 4.5 m deep, 3.2 m tall, front toward -Y. A windowless shed with
# vertical fins, a loading door, rooftop chillers and a lit status strip.
W, D, H = 6.0, 4.5, 3.2


def dc_shell(wall='wall_cream', fins='metal_soft'):
    parts = [box('shell', (W, D, H), (0, 0, H / 2), wall, 0.05, 1),
             box('plinth', (W + 0.1, D + 0.1, 0.25), (0, 0, 0.125), 'slab_edge', 0.03, 1),
             box('parapet', (W + 0.06, D + 0.06, 0.15), (0, 0, H + 0.075), 'metal_dark', 0.02, 1),
             box('door', (1.2, 0.05, 2.0), (-1.6, -D / 2 - 0.02, 1.0), 'metal_dark', 0.01, 1)]
    for i in range(9):
        parts.append(box(f'fin{i}', (0.08, 0.12, H - 0.5), (-0.6 + i * 0.4, -D / 2 - 0.05, H / 2 + 0.05), fins, 0.01, 1))
    for i in range(3):
        x = -1.6 + i * 1.6
        parts += [box(f'chiller{i}', (1.2, 1.2, 0.55), (x, 0.4, H + 0.42), 'metal_soft', 0.03, 1),
                  cyl(f'fan{i}', 0.42, 0.04, (x, 0.4, H + 0.71), 'metal_dark', verts=12, bevel=0)]
    return parts


def datacentre():
    parts = dc_shell()
    parts += [box('status', (3.6, 0.03, 0.08), (0.6, -D / 2 - 0.12, H - 0.15), 'led', 0),
              box('sign', (1.0, 0.04, 0.3), (-1.6, -D / 2 - 0.05, 2.35), 'fabric_teal', 0.01, 1)]
    join(parts, 'era_datacentre')


def datacentre_overgrown():
    # Dark and quiet: no status light, ivy climbing the fins, planters on the roof, a bike rack out front.
    parts = dc_shell(wall='wall_sage', fins='leaf_dark')
    for i, (x, z, w, h) in enumerate(((-2.6, 1.6, 1.2, 3.0), (2.4, 1.3, 1.6, 2.4), (-0.4, 2.4, 1.0, 1.5))):
        parts.append(box(f'ivy{i}', (w, 0.1, h), (x, -D / 2 - 0.1, z), 'leaf', 0.04, 1))
    for i, x in enumerate((-2.2, 2.4)):
        parts += [box(f'bed{i}', (1.0, 0.8, 0.3), (x, -1.2, H + 0.3), 'wood_honey', 0.02, 1),
                  sphere(f'shrub{i}', 0.42, (x, -1.2, H + 0.6), 'leaf', subdiv=1, scale=(1.1, 0.9, 0.7))]
    join(parts, 'era_datacentre_overgrown')


def datacentre_build():
    # Going up: the slab, a steel frame two bays high, half the cladding, and a tower crane.
    parts = [box('slab', (W + 0.1, D + 0.1, 0.25), (0, 0, 0.125), 'slab_edge', 0.03, 1)]
    for i, x in enumerate((-W / 2, -W / 6, W / 6, W / 2)):
        for j, y in enumerate((-D / 2, D / 2)):
            parts.append(box(f'col{i}{j}', (0.14, 0.14, H), (x, y, H / 2), 'fabric_terracotta', 0, 1))
    for z in (H / 2, H):
        for y in (-D / 2, D / 2):
            parts.append(box(f'beam{z}{y}', (W, 0.12, 0.14), (0, y, z), 'fabric_terracotta', 0, 1))
        for x in (-W / 2, W / 2):
            parts.append(box(f'tie{z}{x}', (0.12, D, 0.14), (x, 0, z), 'fabric_terracotta', 0, 1))
    parts.append(box('cladding', (W / 3 - 0.1, 0.06, H - 0.3), (-W / 3, -D / 2, H / 2 + 0.05), 'wall_cream', 0.01, 1))
    # The crane: a lattice mast drawn as a tall box with braces, a jib, a counterweight and a hook.
    mx, my = W / 2 + 0.9, D / 2 - 0.4
    mast_h = 9.0
    parts.append(box('mast', (0.5, 0.5, mast_h), (mx, my, mast_h / 2), 'fabric_mustard', 0, 1))
    for k in range(6):
        z = 0.8 + k * 1.4
        parts.append(rod(f'brace{k}', (mx - 0.26, my - 0.26, z), (mx + 0.26, my - 0.26, z + 1.3), 0.03, 'ink'))
    parts += [box('jib', (7.5, 0.4, 0.4), (mx - 2.6, my, mast_h + 0.2), 'fabric_mustard', 0, 1),
              box('cab', (0.7, 0.6, 0.6), (mx + 0.2, my - 0.5, mast_h - 0.3), 'wall_cream', 0.03, 1),
              box('counter', (1.0, 0.7, 0.6), (mx + 1.3, my, mast_h - 0.1), 'slab_edge', 0.02, 1),
              rod('cable', (mx - 4.5, my, mast_h), (mx - 4.5, my, 4.6), 0.015, 'ink'),
              box('load', (1.4, 0.2, 0.2), (mx - 4.5, my, 4.5), 'fabric_terracotta', 0, 1),
              box('tip_light', (0.12, 0.12, 0.12), (mx - 6.3, my, mast_h + 0.45), 'led_red', 0)]
    join(parts, 'era_datacentre_build')


reset(); delivery_bike(); export(path('era_delivery_bike'), budget=2500)
reset(); hire_scooter(); export(path('era_hire_scooter'), budget=800)
reset(); drone(); export(path('era_drone'), budget=800)
reset(); datacentre(); export(path('era_datacentre'), budget=3000)
reset(); datacentre_overgrown(); export(path('era_datacentre_overgrown'), budget=3000)
reset(); datacentre_build(); export(path('era_datacentre_build'), budget=3000)
