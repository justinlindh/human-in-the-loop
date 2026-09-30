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
    box('sign_rule', (1.68, 0.02, 0.06), (0.63, -0.132, 1.57), 'fabric_mustard', 0.015, segments=1),
    # An upright sock: teal ribbed cuff at the bottom, sage leg, the toe end made into the cat's head.
    box('sock_cuff', (0.46, 0.07, 0.17), (-0.92, -0.16, 1.40), 'fabric_teal', 0.035),
    uvsphere('sock_body', 1, (-0.92, -0.17, 1.76), 'fabric_sage', seg=12, rings=8, scale=(0.24, 0.07, 0.32)),
    uvsphere('sock_head', 1, (-0.92, -0.18, 2.18), 'fabric_sage', seg=14, rings=8, scale=(0.29, 0.075, 0.24)),
    uvsphere('muzzle', 1, (-0.92, -0.24, 2.10), 'paper_sheet', seg=12, rings=6, scale=(0.14, 0.03, 0.085)),
    uvsphere('nose', 1, (-0.92, -0.27, 2.14), 'blush', seg=8, rings=4, scale=(0.04, 0.02, 0.028)),
    box('parcel', (0.30, 0.06, 0.22), (-0.92, -0.25, 1.70), 'cardboard', 0.022),
    box('parcel_tape', (0.06, 0.012, 0.22), (-0.92, -0.285, 1.70), 'paper_sheet', 0.004, segments=1),
]
for i, s in enumerate((-1, 1)):
    ear = prism(f'cat_ear_{i}', [(-0.08, 0), (0.02 * s, 0.17), (0.08, 0)], 0.05,
                (-0.92 + 0.17 * s, -0.18, 2.34), 'fabric_sage', 0.01)
    ear.rotation_euler[2] = math.pi / 2
    parts.append(ear)
    parts.append(uvsphere(f'button_eye_{i}', 1, (-0.92 + 0.095 * s, -0.245, 2.24), 'ink', seg=8, rings=5, scale=(0.035, 0.015, 0.042)))
    parts.append(uvsphere(f'eye_glint_{i}', 1, (-0.92 + 0.095 * s + 0.012, -0.262, 2.255), 'paper_sheet', seg=5, rings=3, scale=(0.011, 0.006, 0.011)))
    parts.append(uvsphere(f'paw_{i}', 1, (-0.92 + 0.16 * s, -0.27, 1.70), 'paper_sheet', seg=8, rings=5, scale=(0.055, 0.03, 0.05)))
for i in range(3):
    parts.append(box(f'cuff_rib_{i}', (0.02, 0.012, 0.13), (-1.02 + i * 0.1, -0.2, 1.40), 'wall_cream', 0.004, segments=1))

# 1990s floodlamps: arms off the top of the frame holding lamp heads that point down at the face.
# The lenses are lamp_warm; the game swaps them for a night-lit material.
TILT = math.atan2(0.48, 0.8)
aim = (0, math.sin(TILT), -math.cos(TILT))
for i, x in enumerate((-1.1, 0.0, 1.1)):
    head = (x, -0.62, 3.05)
    parts += [
        box(f'lamp_bracket_{i}', (0.08, 0.1, 0.1), (x, -0.02, 2.99), 'metal_dark', 0.012, segments=1),
        box(f'lamp_arm_{i}', (0.035, 0.56, 0.035), (x, -0.33, 3.02), 'metal_dark', 0.006, segments=1),
        cyl(f'lamp_head_{i}', 0.09, 0.16, head, 'metal_dark', verts=10, bevel=0, r2=0.06, rot=(TILT, 0, 0)),
        cyl(f'lamp_lens_{i}', 0.082, 0.012, tuple(h + a * 0.083 for h, a in zip(head, aim)), 'lamp_warm', verts=10, bevel=0, rot=(TILT, 0, 0)),
    ]

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
