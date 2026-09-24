"""Render object icons: shop items (from public/models) and the icon props in icon_props.py, from the
game's isometric angle, with a thick ink outline, onto transparent 96 px PNGs.

blender -b --factory-startup -P blender/icons/render_icons.py -- --out public/icons/objects [--only item.arcade]
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
sys.path.insert(0, os.path.dirname(__file__))
import bpy
import numpy as np
from mathutils import Vector
from common import ROOT, PALETTE, args, mat
import icon_props

RENDER = 256
OUT = 96
OUTLINE = 9            # px at render size
PAD = 0.05              # share of the frame left around the object

ITEMS = ['espresso', 'plant_wall', 'nap_pod', 'arcade', 'standing_desk', 'whiteboard_wall', 'library',
         'monitoring_wall', 'server_rack', 'trophy_case']
ITEM_LEVEL = 2
# Flat objects read better from nearly in front than from the isometric angle: (yaw, pitch) degrees.
FRONT = (22, 14)
VIEWS = {n: FRONT for n in ('cat.email', 'cat.crm', 'cat.notes', 'cat.pm', 'cat.devtools', 'cat.video', 'cat.accounting',
                             'cat.security', 'item.whiteboard_wall', 'research.red_team_suite', 'cat.legal')}
VIEWS['train.course'] = (30, 32)
SIZES = {'item': 30, 'cat': 22, 'research': 26, 'train': 22, 'size': 20}


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE'
    s.render.resolution_x = s.render.resolution_y = RENDER
    s.render.film_transparent = True
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    s.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*[srgb_to_lin(c) for c in hex_rgb(PALETTE['hemi_sky_day'])], 1)
    bg.inputs['Strength'].default_value = 0.9
    s.world = w


def add_rig():
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    co = bpy.data.objects.new('cam', cam)
    bpy.context.collection.objects.link(co)
    bpy.context.scene.camera = co
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.2
    sun.color = [srgb_to_lin(c) for c in hex_rgb(PALETTE['sun_day'])]
    sun.angle = math.radians(12)
    so = bpy.data.objects.new('sun', sun)
    bpy.context.collection.objects.link(so)
    # Key from the viewer's upper left, as in the game.
    so.rotation_euler = (math.radians(40), 0, math.radians(-10))
    fill = bpy.data.lights.new('fill', 'SUN')
    fill.energy = 0.8
    fo = bpy.data.objects.new('fill', fill)
    bpy.context.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(60), 0, math.radians(150))
    return co


def frame(cam_obj, view=None):
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        e = o.evaluated_get(dg)
        me = e.to_mesh()
        pts += [e.matrix_world @ v.co for v in me.vertices]
        e.to_mesh_clear()
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    # Game camera: yaw 45 degrees, pitch atan(1/sqrt 2); in Blender it looks from +X, -Y, +Z.
    yaw = math.radians(view[0]) if view else math.radians(45)
    pitch = math.radians(view[1]) if view else math.atan(1 / math.sqrt(2))
    d = Vector((math.cos(pitch) * math.sin(yaw), -math.cos(pitch) * math.cos(yaw), math.sin(pitch)))
    cam_obj.location = c + d * 20
    cam_obj.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    inv = cam_obj.matrix_world.inverted()
    xs, ys = [], []
    for p in pts:
        q = inv @ p
        xs.append(q.x); ys.append(q.y)
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    cam_obj.data.ortho_scale = span * (1 + 2 * PAD)
    # Center the projected box, not the 3D box.
    shift = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, 0))
    cam_obj.location = cam_obj.matrix_world @ shift


def outline(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    a = px[:, :, 3]
    r = OUTLINE
    dil = np.zeros_like(a)
    pad = np.pad(a, r + 1)
    for dy in range(-r - 1, r + 2):
        for dx in range(-r - 1, r + 2):
            dist = math.hypot(dx, dy)
            wgt = max(0.0, min(1.0, r + 1 - dist))
            if wgt <= 0:
                continue
            sl = pad[r + 1 + dy:r + 1 + dy + h, r + 1 + dx:r + 1 + dx + w]
            np.maximum(dil, sl * wgt, out=dil)
    ink = [srgb_to_lin(c) for c in hex_rgb(PALETTE['ink'])]
    out = np.empty_like(px)
    # Source over an ink silhouette. Pixels are linear, premultiply for the composite.
    sa = a[:, :, None]
    out[:, :, :3] = px[:, :, :3] * sa + np.array(ink)[None, None, :] * dil[:, :, None] * (1 - sa)
    out[:, :, 3] = sa[:, :, 0] + dil * (1 - sa[:, :, 0])
    nz = out[:, :, 3] > 1e-5
    out[:, :, :3][nz] /= out[:, :, 3][nz][:, None]
    img.pixels[:] = out.ravel()
    img.scale(OUT, OUT)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def import_item(item):
    path = os.path.join(ROOT, 'public', 'models', f'{item}_l{ITEM_LEVEL}.glb')
    bpy.ops.import_scene.gltf(filepath=path)
    # Glow slots render dark in a plain import; give them their emissive look.
    for m in bpy.data.materials:
        key = m.name.replace('pal_', '').split('.')[0]
        glow = {'screen': '#62b4ff', 'led': '#3ee07a', 'led_amber': '#ffb238', 'lamp': '#ffcf96', 'neon_pink': '#ff8fc4',
                'neon_cyan': '#5fe0d0', 'grow': '#ffcf96'}.get(key)
        if glow and m.node_tree:
            b = m.node_tree.nodes.get('Principled BSDF')
            if b:
                b.inputs['Emission Color'].default_value = (*[srgb_to_lin(c) for c in hex_rgb(glow)], 1)
                b.inputs['Emission Strength'].default_value = 1.5
        if key == 'glass' and m.node_tree:
            b = m.node_tree.nodes.get('Principled BSDF')
            if b:
                b.inputs['Alpha'].default_value = 0.35
    # Palette base colors (the exporter stored them; make sure unknown ones are not white).
    for m in bpy.data.materials:
        key = m.name.replace('pal_', '').split('.')[0]
        if key in PALETTE and m.node_tree:
            b = m.node_tree.nodes.get('Principled BSDF')
            if b:
                b.inputs['Base Color'].default_value = (*[srgb_to_lin(c) for c in hex_rgb(PALETTE[key])], 1)
                b.inputs['Roughness'].default_value = 0.7


def main():
    a = args()
    out_dir = os.path.abspath(a[a.index('--out') + 1]) if '--out' in a else os.path.join(ROOT, 'public', 'icons', 'objects')
    only = a[a.index('--only') + 1] if '--only' in a else None
    os.makedirs(out_dir, exist_ok=True)
    names = [f'item.{i}' for i in ITEMS] + list(icon_props.BUILDERS)
    if only:
        names = [n for n in names if n == only or n.startswith(only)]
    manifest_path = os.path.join(out_dir, 'manifest.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) and only else {}
    setup_scene()
    for name in names:
        clear()
        cam = add_rig()
        if name.startswith('item.'):
            import_item(name[5:])
        else:
            icon_props.BUILDERS[name]()
        frame(cam, VIEWS.get(name))
        path = os.path.join(out_dir, f'{name}.png')
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outline(path)
        manifest[name] = {'file': f'objects/{name}.png', 'size': SIZES[name.split('.')[0]]}
        print(f'ICON {name}')
    with open(manifest_path, 'w') as f:
        json.dump(dict(sorted(manifest.items())), f, indent=1)
        f.write('\n')
    print(f'rendered {len(names)} icons')


main()
