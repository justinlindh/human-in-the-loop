"""Chunky era signage, with one lettering family and shared roadside proportions."""
from common import *


def lettering(name, text, loc, size, material='ink'):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body, curve.size = text, size
    curve.align_x = curve.align_y = 'CENTER'
    curve.resolution_u = 2
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (math.pi / 2, 0, 0)
    curve.materials.append(mat(material))
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def frame(name, width, height, depth=0.09):
    return [box(name + '_frame', (width, depth, height), (0, 0, height / 2), 'wood_honey', 0.025),
            box(name + '_face', (width - 0.10, 0.02, height - 0.10), (0, -depth / 2 - 0.012, height / 2), 'paper_sheet', 0.012)]


def billboard(kind):
    parts = []
    for x in (-1.05, 1.05):
        parts += [box('foot', (0.62, 0.65, 0.13), (x, 0, 0.065), 'slab_edge', 0.04),
                  box('post', (0.13, 0.15, 2.5), (x, 0.09, 1.35), 'wood_dark', 0.02)]
    depth = {'painted': 0.18, 'box': 0.36, 'led': 0.10}[kind]
    parts.append(box('sign_frame', (3.4, depth, 1.8), (0, 0, 2.05), 'wood_honey' if kind == 'painted' else 'metal_dark', 0.055))
    face_y = -depth / 2 - 0.022
    if kind == 'led':
        plane('advert_screen', 3.22, 1.62, (0, face_y, 2.05), 'screen')
    else:
        parts.append(box('sign_face', (3.25, 0.035, 1.65), (0, face_y, 2.05), 'wall_cream', 0.035))
    if kind == 'painted':
        tilt = math.atan2(0.48, 0.8)
        for i, x in enumerate((-1.1, 0, 1.1)):
            parts += [box(f'lamp_arm_{i}', (0.035, 0.6, 0.035), (x, -0.32, 3.02), 'metal_dark', 0.006, segments=1),
                      cyl(f'lamp_head_{i}', 0.09, 0.16, (x, -0.62, 3.05), 'metal_dark', verts=10, bevel=0, r2=0.06, rot=(tilt, 0, 0)),
                      cyl(f'lamp_lens_{i}', 0.082, 0.012, (x, -0.577, 2.979), 'lamp_warm', verts=10, bevel=0, rot=(tilt, 0, 0))]
    return parts, face_y - 0.025


def finish(parts, name, budget=3000, path=None):
    join(parts, name)
    count = tri_count()
    if count >= budget:
        raise ValueError(f'{name}: {count} triangles exceeds {budget}')
    export(path)
