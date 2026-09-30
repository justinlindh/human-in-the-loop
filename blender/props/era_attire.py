"""Period clothes in the chibi kit's waist, hip and neck pivot spaces, with flat shirt artwork."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()


def slot(name, color):
    m = mat(color).copy()
    m.name = 'pal_' + name
    return m


shirt = slot('shirt', 'paper')
pants = slot('pants', 'wall_trim')
role = slot('role', 'fabric_teal')


def collar(name):
    return [box(name + str(s), (0.075, 0.025, 0.068), (s * 0.047, -0.098, 0.263), shirt,
                0.009, 2, rot=(0, s * math.radians(28), 0)) for s in (-1, 1)]


join(collar('collar') + [
    box('placket', (0.014, 0.016, 0.20), (0, -0.106, 0.15), 'wall_trim', 0.004),
    box('tie_knot', (0.035, 0.012, 0.032), (0, -0.110, 0.263), role, 0.006),
    box('tie_blade', (0.042, 0.008, 0.16), (0, -0.111, 0.169), role, 0.004),
    box('belt', (0.22, 0.016, 0.026), (0, -0.083, 0.055), 'wood_walnut', 0.009),
    box('buckle', (0.04, 0.014, 0.024), (0, -0.097, 0.055), 'gold', 0.006),
], 'attire_shirt')

join(collar('polo_collar') + [
    box('polo_buttons', (0.018, 0.015, 0.07), (0, -0.11, 0.224), 'wall_trim', 0.004),
], 'attire_polo')

# The fleece leaves the polo's collar visible and stops inside the existing shoulder envelope.
fleece = [box('fleece_body', (0.312, 0.222, 0.30), (0, 0, 0.15), 'fabric_slate', 0.10, 3)]
fleece += collar('fleece_collar')
fleece += [box('zip', (0.012, 0.012, 0.15), (0, -0.113, 0.172), 'wall_trim', 0.004),
           box('zip_pull', (0.02, 0.012, 0.026), (0, -0.13, 0.227), 'metal_soft', 0.004)]
for s in (-1, 1):
    fleece.append(box('fleece_pocket', (0.063, 0.012, 0.015), (s * 0.08, -0.106, 0.073), 'ink', 0.005, 1,
                      rot=(0, s * math.radians(-18), 0)))
join(fleece, 'attire_fleece')

for kind, radius in [('khaki', 0.058), ('cargo_l', 0.051), ('cargo_r', 0.051), ('jeans', 0.046)]:
    parts = [cyl(kind, radius, 0.25, (0, 0, -0.125), pants, verts=12, bevel=0.028, segments=2)]
    if kind == 'khaki':
        for x in (-0.021, 0.021):
            parts.append(box('pleat', (0.006, 0.01, 0.12), (x, -0.058, -0.082), 'baseboard', 0.003, 1))
    if kind.startswith('cargo'):
        for s in (-1,) if kind == 'cargo_l' else (1,):
            parts += [box('cargo_pocket', (0.018, 0.048, 0.082), (s * 0.046, 0, -0.125), pants, 0.008),
                      box('cargo_flap', (0.018, 0.048, 0.018), (s * 0.046, 0, -0.087), 'baseboard', 0.006)]
    if kind == 'jeans':
        parts.append(cyl('cuff', 0.048, 0.025, (0, 0, -0.232), 'fabric_slate', verts=12, bevel=0.005, segments=1))
    join(parts, 'attire_' + kind)

# Open frames preserve both eyes; the thick brow is the period cue.
frames = []
for s in (-1, 1):
    frames.append(torus('frame', 0.057, 0.009, (s * 0.072, -0.207, 0.21), 'wood_walnut',
                        rot=(math.pi / 2, 0, 0), major_seg=12, minor_seg=4))
frames.append(box('bridge', (0.035, 0.012, 0.012), (0, -0.221, 0.225), 'wood_walnut', 0.004))
join(frames, 'attire_glasses')

cyl('attire_cuff', 0.049, 0.028, (0, 0, -0.11), role, verts=12, bevel=0.005, segments=1)
lanyard = []
for s in (-1, 1):
    lanyard.append(box('strap', (0.009, 0.008, 0.11), (s * 0.03, -0.114, 0.245), role, 0.003, 1,
                       rot=(0, s * math.radians(25), 0)))
lanyard += [box('id_card', (0.053, 0.012, 0.06), (0, -0.128, 0.171), 'paper', 0.006),
            box('id_stripe', (0.041, 0.003, 0.012), (0, -0.136, 0.186), role, 0.003)]
join(lanyard, 'attire_lanyard')


def flat(name, pts, color):
    if sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) < 0:
        pts = list(reversed(pts))
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, 0, z) for x, z in pts], [], [tuple(range(len(pts)))])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat(color))
    return ob


def disc(name, x, z, radius, color):
    return flat(name, [(x + radius * math.cos(i * math.tau / 12), z + radius * math.sin(i * math.tau / 12)) for i in range(12)], color)


def rect(name, x, z, w, h, color):
    return flat(name, [(x-w/2, z-h/2), (x+w/2, z-h/2), (x+w/2, z+h/2), (x-w/2, z+h/2)], color)


def print_design(name, title, subtitle, kind, accent):
    parts = [rect('field', 0, 0.145, 0.166, 0.157, 'paper')]
    if kind == 'cat':
        parts += [disc('cat', 0, 0.17, 0.031, accent),
                  flat('ears', [(-0.03, 0.178), (-0.028, 0.213), (0, 0.193), (0.028, 0.213), (0.03, 0.178)], accent),
                  disc('muzzle', 0, 0.16, 0.015, 'wall_cream')]
        for s in (-1, 1):
            parts.append(disc('eye', s * 0.011, 0.178, 0.004, 'ink'))
        parts.append(rect('parcel', 0, 0.139, 0.04, 0.026, 'cardboard'))
    elif kind == 'floppy':
        parts += [rect('disk', 0, 0.18, 0.07, 0.057, accent), rect('slot', 0, 0.197, 0.035, 0.019, 'paper'),
                  rect('label', 0, 0.162, 0.05, 0.015, 'wall_trim')]
    elif kind == 'bubble':
        parts += [rect('bubble', 0, 0.186, 0.085, 0.04, accent),
                  flat('tail', [(-0.024, 0.17), (-0.03, 0.155), (0, 0.17)], accent)]
        for x in (-0.025, 0, 0.025):
            parts.append(disc('dot', x, 0.186, 0.005, 'paper'))
    elif kind == 'calendar':
        parts += [rect('calendar', 0, 0.182, 0.066, 0.052, accent), rect('date', 0, 0.174, 0.056, 0.026, 'paper'),
                  lettering('day', 'TUE', (0, 0, 0.175), 0.019)]
    else:
        parts += [disc('seal', 0, 0.183, 0.03, accent),
                  lettering('symbol', 'OK' if kind == 'seal' else 'B', (0, 0, 0.183), 0.023, 'paper')]
    parts += [lettering('title', title, (0, 0, 0.12), 0.029), lettering('subtitle', subtitle, (0, 0, 0.09), 0.021)]
    # Each ink layer has a distinct depth before it is projected onto a curved shirt.
    for i, ob in enumerate(parts):
        ob.location.y -= i * 0.0008
    join(parts, 'print_' + name)


print_design('parcel_paws', 'PARCEL', 'PAWS', 'cat', 'fabric_sage')
print_design('onlineland', 'OnlineLand', '50 FREE HOURS', 'floppy', 'fabric_teal')
print_design('y2k', 'Y2K', 'COMPLIANT', 'seal', 'fabric_teal')
print_design('shoutbook', 'Shoutbook', '(beta)', 'bubble', 'fabric_slate')
print_design('tuesday', 'Disrupting', 'Tuesday', 'calendar', 'fabric_mustard')
print_design('beta_forever', 'BETA', 'FOREVER', 'beta', 'fabric_teal')
print_design('weekend', '404', 'WEEKEND', 'floppy', 'fabric_slate')
print_design('ship_it', 'SHIP IT', '*ish', 'seal', 'fabric_mustard')

# A kit part scales around its animated pivot, including when it contains several materials.
for ob in bpy.context.scene.objects:
    if ob.type != 'MESH':
        continue
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if ob.name == 'attire_glasses':
        for v in ob.data.vertices:
            k = 1 - (v.co.x / 0.2226) ** 2 - ((v.co.z - 0.22) / 0.2016) ** 2
            v.co.y = -0.21 * math.sqrt(max(0, k)) - 0.003 + (v.co.y + 0.207) * 0.15
        ob.data.update()

export(budget=8000, zfight_kit=True)
