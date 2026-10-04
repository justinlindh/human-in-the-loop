"""Period clothes in the chibi kit's waist, hip and neck pivot spaces, with flat shirt artwork."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
import bmesh
from mathutils import Vector
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
                0.009, 1, rot=(0, s * math.radians(28), 0)) for s in (-1, 1)]


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
fleece += [box('zip', (0.012, 0.012, 0.15), (0, -0.113, 0.172), 'wall_trim', 0.004, 1),
           box('zip_pull', (0.02, 0.012, 0.026), (0, -0.13, 0.227), 'metal_soft', 0.004, 1)]
for s in (-1, 1):
    fleece.append(box('fleece_pocket', (0.063, 0.012, 0.015), (s * 0.08, -0.106, 0.073), 'ink', 0.005, 1,
                      rot=(0, s * math.radians(-18), 0)))
join(fleece, 'attire_fleece')

for kind, radius in [('khaki', 0.058), ('cargo_l', 0.051), ('cargo_r', 0.051), ('jeans', 0.046)]:
    parts = [cyl(kind, radius, 0.25, (0, 0, -0.125), pants, verts=12, bevel=0.028, segments=1)]
    if kind == 'khaki':
        for x in (-0.021, 0.021):
            parts.append(box('pleat', (0.006, 0.01, 0.12), (x, -0.058, -0.082), 'baseboard', 0.003, 1))
    if kind.startswith('cargo'):
        for s in (-1,) if kind == 'cargo_l' else (1,):
            parts += [box('cargo_pocket', (0.018, 0.048, 0.082), (s * 0.046, 0, -0.125), pants, 0.008, 1),
                      box('cargo_flap', (0.018, 0.048, 0.018), (s * 0.046, 0, -0.087), 'baseboard', 0.006, 1)]
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
    join(parts, 'badge_' + name)


print_design('parcel_paws', 'PARCEL', 'PAWS', 'cat', 'fabric_sage')
print_design('onlineland', 'OnlineLand', '50 FREE HOURS', 'floppy', 'fabric_teal')
print_design('y2k', 'Y2K', 'COMPLIANT', 'seal', 'fabric_teal')
print_design('shoutbook', 'Shoutbook', '(beta)', 'bubble', 'fabric_slate')
print_design('tuesday', 'Disrupting', 'Tuesday', 'calendar', 'fabric_mustard')
print_design('beta_forever', 'BETA', 'FOREVER', 'beta', 'fabric_teal')
print_design('weekend', '404', 'WEEKEND', 'floppy', 'fabric_slate')
print_design('ship_it', 'SHIP IT', '*ish', 'seal', 'fabric_mustard')


def ink(name, parts):
    # Only overlapping colours need separate depth; empty areas are bare fabric.
    bpy.context.view_layer.update()
    layers = []
    for ob in parts:
        corners = [ob.matrix_world @ Vector(v) for v in ob.bound_box]
        bounds = (min(v.x for v in corners), max(v.x for v in corners), min(v.z for v in corners), max(v.z for v in corners))
        depth = 0
        for (x0, x1, z0, z1), layer in layers:
            if bounds[0] < x1 and bounds[1] > x0 and bounds[2] < z1 and bounds[3] > z0:
                depth = max(depth, layer + 1)
        ob.location.y = -depth * 0.0008
        layers.append((bounds, depth))
    return join(parts, 'print_' + name)


def tee_text(text, x, z, size, color):
    curve = bpy.data.curves.new('tee_text', 'FONT')
    curve.body, curve.size = text, size
    curve.align_x = curve.align_y = 'CENTER'
    curve.resolution_u = 2
    curve.offset = size * 0.02
    ob = bpy.data.objects.new('tee_text', curve)
    bpy.context.collection.objects.link(ob)
    ob.location = (x, 0, z)
    ob.rotation_euler = (math.pi / 2, 0, 0)
    curve.materials.append(mat(color))
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def word(text, x, z, width, height, color):
    ob = tee_text(text, x, z, 1, color)
    ob.scale.x = width / (max(v.co.x for v in ob.data.vertices) - min(v.co.x for v in ob.data.vertices))
    ob.scale.y = height / (max(v.co.y for v in ob.data.vertices) - min(v.co.y for v in ob.data.vertices))
    return ob


def arch(text, z, radius, size, color):
    parts = []
    for i, char in enumerate(text):
        angle = (i / (len(text) - 1) - 0.5) * 1.65
        if char == ' ':
            continue
        ob = tee_text(char, math.sin(angle) * radius, z + math.cos(angle) * radius, size, color)
        ob.rotation_euler.y = angle
        parts.append(ob)
    return parts


ink('parcel_paws', [
    flat('sock', [(-0.032, 0.079), (-0.051, 0.096), (-0.049, 0.163), (-0.067, 0.208),
                  (-0.052, 0.24), (-0.021, 0.215), (0.02, 0.217), (0.052, 0.24),
                  (0.068, 0.207), (0.05, 0.165), (0.033, 0.136), (0.065, 0.112),
                  (0.069, 0.09), (0.05, 0.077)], 'paper'),
    flat('ear_l', [(-0.052, 0.228), (-0.041, 0.207), (-0.059, 0.208)], 'fabric_terracotta'),
    flat('ear_r', [(0.052, 0.228), (0.041, 0.207), (0.059, 0.208)], 'fabric_terracotta'),
    disc('eye_l', -0.024, 0.193, 0.007, 'ink'), disc('eye_r', 0.024, 0.193, 0.007, 'ink'),
    flat('nose', [(-0.008, 0.179), (0.008, 0.179), (0, 0.169)], 'fabric_terracotta'),
    rect('sock_stripe', -0.006, 0.139, 0.072, 0.015, 'fabric_mustard'),
    rect('sock_stripe', -0.006, 0.116, 0.074, 0.012, 'fabric_terracotta'),
])

ink('onlineland', [
    flat('disk', [(0.01, 0.135), (0.098, 0.135), (0.098, 0.216), (0.082, 0.232), (0.01, 0.232)], 'fabric_teal'),
    rect('disk_slide', 0.054, 0.217, 0.046, 0.024, 'paper'),
    rect('disk_label', 0.054, 0.163, 0.062, 0.03, 'paper'),
])

ink('y2k', [word('Y2K', 0, 0.165, 0.213, 0.093, 'ink')])

ink('shoutbook', [
    flat('pocket', [(0.008, 0.232), (0.104, 0.232), (0.1, 0.138), (0.056, 0.118), (0.012, 0.138)], 'fabric_teal'),
    rect('pocket_hem', 0.056, 0.225, 0.096, 0.01, 'paper'),
    disc('bubble', 0.056, 0.18, 0.027, 'paper'),
    flat('tail', [(0.04, 0.172), (0.036, 0.143), (0.062, 0.162)], 'paper'),
])

ink('tuesday', [
    *arch('TUESDAY', 0.145, 0.09, 0.034, 'paper'),
    disc('mug_handle', 0.04, 0.139, 0.025, 'paper'),
    disc('handle_hole', 0.041, 0.139, 0.014, 'fabric_terracotta'),
    flat('mug', [(-0.041, 0.162), (0.035, 0.162), (0.03, 0.102), (-0.027, 0.102)], 'paper'),
    rect('sleepy_eye', -0.016, 0.141, 0.016, 0.005, 'ink'),
    rect('sleepy_eye', 0.016, 0.141, 0.016, 0.005, 'ink'),
    word('DISRUPTED', 0, 0.075, 0.161, 0.021, 'paper'),
])

pattern = []
for row, z in enumerate((0.055, 0.118, 0.181, 0.244)):
    for col, x in enumerate((-0.09, -0.028, 0.04, 0.101)):
        if row in (0, 3) and col == 3:
            continue
        if (row + col) % 2:
            pattern.append(flat('confetti', [(x - 0.021, z - 0.018), (x + 0.023, z), (x - 0.013, z + 0.024)], 'fabric_mustard'))
        else:
            pattern += [flat('zig', [(x - 0.03, z + 0.01), (x - 0.012, z + 0.024), (x + 0.012, z - 0.001),
                                      (x + 0.025, z + 0.014), (x + 0.035, z + 0.002), (x + 0.012, z - 0.02),
                                      (x - 0.013, z + 0.006), (x - 0.024, z - 0.004)], 'paper')]
ink('beta_forever', pattern)

ink('weekend', [
    word('404', 0, 0.176, 0.21, 0.1, 'wall_cream'),
    word('WEEKEND', 0, 0.093, 0.168, 0.025, 'wall_cream'),
    flat('crack', [(-0.084, 0.224), (-0.068, 0.178), (-0.059, 0.17), (-0.047, 0.119),
                   (-0.057, 0.164), (-0.074, 0.18), (-0.092, 0.224)], 'plastic_charcoal'),
    flat('crack', [(0.063, 0.22), (0.05, 0.181), (0.058, 0.162), (0.042, 0.126),
                   (0.065, 0.164), (0.056, 0.182), (0.068, 0.22)], 'plastic_charcoal'),
    rect('wear', 0.011, 0.207, 0.018, 0.005, 'plastic_charcoal'),
    rect('wear', -0.017, 0.155, 0.012, 0.007, 'plastic_charcoal'),
])

ink('ship_it', [
    *arch('SHIP IT', 0.145, 0.093, 0.035, 'fabric_teal'),
    flat('plane', [(-0.081, 0.171), (0.075, 0.204), (0.007, 0.09), (-0.014, 0.135)], 'fabric_teal'),
    flat('fold', [(-0.014, 0.135), (0.075, 0.204), (-0.007, 0.15), (-0.008, 0.107)], 'fabric_mustard'),
    word('*ish', 0.04, 0.078, 0.059, 0.025, 'ink'),
])

# The tee arm shares the chibi arm envelope; the extra ring is a fabric-to-skin boundary.
arm = cyl('attire_tee_arm', 0.047, 0.2, (0, 0, -0.1), shirt, verts=12, bevel=0.03, segments=2)
bpy.context.view_layer.objects.active = arm
for modifier in list(arm.modifiers):
    bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
arm.data.materials.append(mat('skin_1'))
bm = bmesh.new()
bm.from_mesh(arm.data)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                      plane_co=(0, 0, -0.105), plane_no=(0, 0, 1), dist=0.00001)
for face in bm.faces:
    if face.calc_center_median().z < -0.105:
        face.material_index = 1
bm.to_mesh(arm.data)
bm.free()

trim = slot('trim', 'wall_cream')
neckline = []
for i in range(12):
    a, b = math.pi + i * math.pi / 12, math.pi + (i + 1) * math.pi / 12
    pts = [(math.cos(t) * r, 0.278 + math.sin(t) * r * 0.37) for t, r in ((a, 0.082), (b, 0.082), (b, 0.064), (a, 0.064))]
    ob = flat('neck', pts, 'paper')
    ob.data.materials[0] = trim
    neckline.append(ob)
join(neckline, 'attire_ringer')
# Shoulder colour wraps the torso's sides and back along a diagonal raglan cut.
for build, (w, d) in enumerate(((0.26, 0.19), (0.3, 0.21), (0.36, 0.24))):
    raglan = []
    for s in (-1, 1):
        ob = box('raglan', (w, d, 0.3), (0, 0, 0.15), trim, bevel=0)
        soften(ob, min(w, d) * 0.45, 3, hard=False)
        bpy.context.view_layer.objects.active = ob
        for modifier in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                              plane_co=(0, 0, 0.225 / 0.65), plane_no=(s * 0.3 / w, 0, 0.65), dist=0.00001)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if s * f.calc_center_median().x * 0.3 / w + 0.65 * f.calc_center_median().z < 0.225], context='FACES')
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * 0.0015
        bm.to_mesh(ob.data)
        bm.free()
        raglan.append(ob)
    join(raglan, 'attire_raglan_' + str(build))

sleeve = []
for angle in range(0, 360, 60):
    for z in (-0.055, -0.135):
        a = math.radians(angle) + (0.35 if z < -0.1 else 0)
        ob = flat('sleeve_motif', [(-0.014, z - 0.012), (0.014, z), (-0.008, z + 0.014)],
                  'fabric_mustard' if angle % 120 else 'paper')
        for v in ob.data.vertices:
            t = a + v.co.x / 0.048
            v.co.x, v.co.y = math.sin(t) * 0.0485, -math.cos(t) * 0.0485
        sleeve.append(ob)
join(sleeve, 'attire_pattern_sleeve')

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
