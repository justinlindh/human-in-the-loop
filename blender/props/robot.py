"""The office robot that roams from the office_robot dock, as separate parts the renderer animates.

Front faces -Y, origin at the floor under the wheel base. Parts:
  robot_base   wheel skirt and bumper (stays on the floor)
  robot_body   the rounded torso with its stubby arms and the tray bracket
  robot_head   the head shell with its dark face screen; pivot at the neck (robot_head's origin)
  robot_eyes   two glowing eye pills on the face (the renderer recolours or squashes them)
  robot_led    the antenna tip light
  robot_tray   the tray the arms hold out; robot_cup sits on it
  robot_cup    a coffee mug on the tray
  robot_can    a small watering can (level 2 and up waters the plants)
  robot_cable  a charging cable with its plug, trailing from the back to the floor (unplugged)
  robot_note   a sticky note on the chest ("I know what you did")
  robot_googly two googly eyes stuck over the face
  traffic_cone a traffic cone, placed in the robot's path by the renderer
"""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit
from mathutils import Vector

reset()

NECK_Z = 0.5


def pivot(o, z=0.0):
    """Put a joined part's origin at (0, 0, z) without moving its geometry: the renderer turns it there."""
    bpy.context.scene.cursor.location = (0, 0, z)
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o

# Wheel skirt: a squat rounded drum with a darker bumper ring.
base = [
    lathe('rb_skirt', [(0.001, 0.015), (0.17, 0.015), (0.2, 0.04), (0.205, 0.08), (0.185, 0.12), (0.001, 0.12)], (0, 0, 0), 'plastic_charcoal', steps=20),
    torus('rb_bumper', 0.2, 0.022, (0, 0, 0.06), 'fabric_teal', major_seg=24, minor_seg=6),
]
for i, a in enumerate((math.pi / 2, math.pi * 7 / 6, math.pi * 11 / 6)):
    base.append(cyl(f'rb_wheel{i}', 0.03, 0.03, (0.12 * math.cos(a), 0.12 * math.sin(a), 0.03), 'metal_dark', verts=8, bevel=0, rot=(0, math.pi / 2, a)))
join(base, 'robot_base')

# Torso: a soft egg shape, cream plastic, with a teal belt and two stubby arms reaching forward.
body = [lathe('rb_torso', [(0.001, 0.11), (0.14, 0.11), (0.17, 0.16), (0.175, 0.3), (0.15, 0.42), (0.1, 0.46), (0.001, 0.47)], (0, 0, 0), 'plastic_white', steps=20)]
body.append(torus('rb_belt', 0.172, 0.014, (0, 0, 0.24), 'fabric_teal', major_seg=24, minor_seg=5))
body.append(cyl('rb_neck', 0.05, 0.06, (0, 0, 0.48), 'metal_soft', verts=12, bevel=0.005))
for sx in (-1, 1):
    body.append(sphere(f'rb_shoulder{sx}', 0.045, (sx * 0.17, -0.02, 0.33), 'plastic_white', subdiv=1))
    s, hnd = Vector((sx * 0.17, -0.02, 0.33)), Vector((sx * 0.105, -0.2, 0.29))
    arm = hnd - s
    body.append(cyl(f'rb_arm{sx}', 0.026, arm.length, tuple((s + hnd) / 2), 'metal_soft', verts=10, bevel=0.006, rot=tuple(arm.to_track_quat('Z', 'Y').to_euler())))
    body.append(sphere(f'rb_hand{sx}', 0.032, tuple(hnd), 'plastic_charcoal', subdiv=1))
# A status light on the chest.
body.append(cyl('rb_chest', 0.03, 0.012, (0, -0.172, 0.34), 'plastic_charcoal', verts=12, bevel=0.003, rot=(math.pi / 2, 0, 0)))
join(body, 'robot_body')

# Head: a rounded screen-box with ear discs and an antenna. Its origin is the neck pivot.
head = [box('rb_shell', (0.34, 0.26, 0.22), (0, 0, NECK_Z + 0.13), 'plastic_white', bevel=0.07, segments=3)]
head.append(box('rb_face', (0.27, 0.02, 0.15), (0, -0.125, NECK_Z + 0.13), 'screen_bg', bevel=0.03, segments=2))
for sx in (-1, 1):
    head.append(cyl(f'rb_ear{sx}', 0.05, 0.03, (sx * 0.175, 0, NECK_Z + 0.13), 'fabric_teal', verts=14, bevel=0.008, rot=(0, math.pi / 2, 0)))
head.append(cyl('rb_antenna', 0.008, 0.1, (0.07, 0.02, NECK_Z + 0.29), 'metal_dark', verts=6, bevel=0))
h = join(head, 'robot_head')

eyes = [box(f'rb_eye{sx}', (0.045, 0.012, 0.07), (sx * 0.06, -0.137, NECK_Z + 0.14), 'screen_cyan', bevel=0.02, segments=2) for sx in (-1, 1)]
join(eyes, 'robot_eyes')
join([sphere('rb_led', 0.02, (0.07, 0.02, NECK_Z + 0.35), 'led_green', subdiv=1)], 'robot_led')

# The tray the hands hold out, and a mug on it.
join([cyl('rb_tray', 0.1, 0.014, (0, -0.2, 0.3), 'wood_honey', verts=18, bevel=0.005),
      torus('rb_rim', 0.1, 0.006, (0, -0.2, 0.308), 'wood_honey', major_seg=18, minor_seg=4)], 'robot_tray')
join(kit.mug('rb_', 0, -0.2, 0.307), 'robot_cup')

# Watering can, carried by its handle in place of the tray.
can = [cyl('rb_can', 0.055, 0.1, (0, -0.2, 0.26), 'fabric_teal', verts=14, bevel=0.01),
       cyl('rb_spout', 0.012, 0.14, (0, -0.29, 0.3), 'fabric_teal', verts=8, bevel=0, r2=0.02, rot=(math.radians(-55), 0, 0)),
       torus('rb_handle', 0.04, 0.008, (0, -0.18, 0.32), 'metal_soft', rot=(0, math.pi / 2, 0), major_seg=12, minor_seg=4)]
join(can, 'robot_can')

# A charging cable from the back of the base, trailing across the floor to a loose plug.
cable = []
pts = [(0, 0.19, 0.1), (0, 0.27, 0.05), (0.05, 0.36, 0.015), (0.14, 0.44, 0.015), (0.2, 0.52, 0.015)]
for i, (a, b) in enumerate(zip(pts, pts[1:])):
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    aim = Vector((dx, dy, dz)).to_track_quat('Z', 'Y').to_euler()
    cable.append(cyl(f'rb_cab{i}', 0.01, L + 0.01, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), 'plastic_charcoal', verts=6, bevel=0, rot=tuple(aim)))
cable.append(box('rb_plug', (0.05, 0.07, 0.035), (0.23, 0.57, 0.02), 'plastic_white', bevel=0.01, rot=(0, 0, math.radians(-35))))
for sx in (-1, 1):
    cable.append(box(f'rb_prong{sx}', (0.008, 0.03, 0.004), (0.25 + sx * 0.012, 0.61, 0.02), 'metal_soft', bevel=0, rot=(0, 0, math.radians(-35))))
join(cable, 'robot_cable')

# A sticky note slapped on the chest, slightly crooked.
join([box('rb_note', (0.08, 0.006, 0.08), (0.05, -0.172, 0.22), 'fabric_mustard', bevel=0.002, segments=1, rot=(math.radians(-8), 0, math.radians(6))),
      box('rb_scrawl0', (0.05, 0.004, 0.006), (0.05, -0.176, 0.235), 'ink', bevel=0, rot=(0, math.radians(-4), 0)),
      box('rb_scrawl1', (0.04, 0.004, 0.006), (0.045, -0.176, 0.215), 'ink', bevel=0, rot=(0, math.radians(3), 0))], 'robot_note')

# Googly eyes: white discs with a loose black pupil, stuck over the screen eyes.
googly = []
for sx in (-1, 1):
    googly.append(cyl(f'rb_gw{sx}', 0.04, 0.014, (sx * 0.065, -0.145, NECK_Z + 0.15), 'paper', verts=14, bevel=0.003, segments=1, rot=(math.pi / 2, 0, 0)))
    googly.append(cyl(f'rb_gp{sx}', 0.019, 0.01, (sx * 0.065 + 0.006, -0.155, NECK_Z + 0.135), 'ink', verts=10, bevel=0, rot=(math.pi / 2, 0, 0)))
join(googly, 'robot_googly')

# Traffic cone.
cone = [cyl('tc_foot', 0.17, 0.03, (0, 0, 0.015), 'marker_orange', verts=4, bevel=0.01, rot=(0, 0, math.pi / 4)),
        cyl('tc_body', 0.1, 0.42, (0, 0, 0.24), 'marker_orange', verts=16, bevel=0.004, r2=0.022),
        cyl('tc_band', 0.074, 0.07, (0, 0, 0.24), 'paper', verts=16, bevel=0, r2=0.06)]
join(cone, 'traffic_cone')

# Head parts turn at the neck; everything else at the floor centre.
HEAD = {'robot_head', 'robot_eyes', 'robot_led', 'robot_googly'}
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH':
        pivot(o, NECK_Z if o.name in HEAD else 0.0)

require_parts(['robot_base', 'robot_body', 'robot_head', 'robot_eyes', 'robot_led', 'robot_tray', 'robot_cup', 'robot_can',
               'robot_cable', 'robot_note', 'robot_googly', 'traffic_cone'])
export(budget=5000, zfight_kit=True)
