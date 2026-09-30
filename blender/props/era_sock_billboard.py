"""Parcel Paws: an original sock-cat courier on a chunky roadside billboard."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
parts = []
for x in (-1.05, 1.05):
    parts += [box(f'foot_{x}', (0.62, 0.65, 0.13), (x, 0, 0.065), 'slab_edge', 0.04),
              box(f'post_{x}', (0.13, 0.15, 2.5), (x, 0.09, 1.35), 'wood_dark', 0.02)]
parts += [
    box('sign_frame', (3.4, 0.18, 1.8), (0, 0, 2.05), 'wood_honey', 0.06),
    box('sign_face', (3.25, 0.035, 1.65), (0, -0.106, 2.05), 'wall_cream', 0.035),
    box('sign_rule', (1.68, 0.02, 0.06), (0.63, -0.132, 1.57), 'fabric_mustard', 0.015),
    box('sock_cuff', (0.60, 0.075, 0.17), (-0.92, -0.17, 1.48), 'fabric_teal', 0.04),
    uvsphere('sock_body', 1, (-0.92, -0.195, 1.89), 'fabric_sage', seg=12, rings=8, scale=(0.28, 0.075, 0.40)),
    uvsphere('sock_toe', 1, (-0.80, -0.21, 2.30), 'paper_sheet', seg=12, rings=8, scale=(0.42, 0.085, 0.25)),
    uvsphere('sock_heel', 1, (-1.14, -0.204, 1.78), 'paper_sheet', seg=10, rings=6, scale=(0.18, 0.075, 0.17)),
    uvsphere('sock_mouth', 1, (-0.69, -0.3, 2.16), 'ink', seg=12, rings=6, scale=(0.18, 0.018, 0.035)),
    box('parcel', (0.39, 0.06, 0.31), (-0.68, -0.27, 1.84), 'cardboard', 0.025, rot=(0, -0.13, 0)),
    box('parcel_tape', (0.07, 0.012, 0.29), (-0.68, -0.307, 1.84), 'paper_sheet', 0.005),
    uvsphere('nose', 1, (-0.49, -0.30, 2.30), 'fabric_teal', seg=10, rings=6, scale=(0.09, 0.04, 0.063)),
]
for i, x in enumerate((-1.04, -0.63)):
    ear = prism(f'cat_ear_{i}', [(-0.11, 0), (0, 0.25), (0.11, 0)], 0.065,
                (x, -0.21, 2.43), 'fabric_sage', 0.012)
    ear.rotation_euler[2] = math.pi / 2
    parts.append(ear)
for i, x in enumerate((-0.97, -0.72)):
    parts.append(uvsphere(f'button_eye_{i}', 1, (x, -0.298, 2.39), 'ink', seg=10, rings=6, scale=(0.047, 0.018, 0.055)))
    parts.append(box(f'cuff_rib_{i}', (0.022, 0.013, 0.11), (-1.03 + i * 0.21, -0.213, 1.48), 'wall_cream', 0.004))

def lettering(name, text, loc, size, material):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = text
    curve.size = size
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
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

parts += [lettering('brand_top', 'PARCEL', (0.61, -0.14, 2.45), 0.38, 'fabric_teal'),
          lettering('brand_bottom', 'PAWS', (0.61, -0.14, 2.04), 0.44, 'fabric_teal'),
          lettering('tagline', 'PET DELIVERY', (0.59, -0.14, 1.76), 0.18, 'wood_dark')]
join(parts, 'era_sock_billboard')
export()
