"""Shared helpers for headless prop and character scripts.

Conventions: 1 unit = 1 m, Z up in Blender (the glTF exporter writes Y up), origin at the
floor center of the object, the object's front faces -Y (which becomes +Z in the game).
Materials are named pal_<palette key>; the game swaps in shared palette materials by name.
"""
import bpy
import bmesh
import math
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def _load_palette():
    src = open(os.path.join(ROOT, 'src', 'render', 'palette.js')).read()
    return {k: v for k, v in re.findall(r"^\s*([a-z0-9_]+):\s*'(#[0-9a-fA-F]{6})'", src, re.M)}


PALETTE = _load_palette()
SLOT_COLORS = {'screen': '#62b4ff', 'led': '#3ee07a', 'led_amber': '#ffb238', 'led_red': '#ff4d4d',
               'lamp': '#ffcf96', 'glass': '#bcdde8', 'window': '#d3ebf5', 'neon_pink': '#ff8fc4',
               'neon_cyan': '#5fe0d0', 'grow': '#ffcf96'}


def args():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def out_path():
    a = args()
    return a[a.index('--out') + 1]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mat(name):
    """Material pal_<name>. Base color follows the palette so a raw .glb previews sensibly."""
    full = f'pal_{name}'
    m = bpy.data.materials.get(full)
    if m:
        return m
    hexv = PALETTE.get(name) or SLOT_COLORS.get(name)
    if not hexv:
        raise KeyError(f'unknown palette color {name}')
    rgb = [_srgb_to_linear(int(hexv[i:i + 2], 16) / 255) for i in (1, 3, 5)]
    m = bpy.data.materials.new(full)
    m.diffuse_color = (*rgb, 1)
    try:
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            bsdf.inputs['Base Color'].default_value = (*rgb, 1)
            bsdf.inputs['Roughness'].default_value = 0.7
    except AttributeError:
        pass
    return m


def _finish(o, name, material, bevel, segments=3):
    o.name = name
    o.data.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if material:
        o.data.materials.append(mat(material) if isinstance(material, str) else material)
    if bevel:
        soften(o, bevel, segments)
    else:
        o.data.shade_smooth()
    return o


def soften(o, width=0.02, segments=3, angle=35, hard=True):
    """Bevel edges. hard=True keeps flat faces crisp (furniture); False shades soft (cloth, bodies)."""
    b = o.modifiers.new('bevel', 'BEVEL')
    b.width = width
    b.segments = segments
    b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(angle)
    b.harden_normals = hard
    o.data.shade_smooth()
    if hard:
        wn = o.modifiers.new('wn', 'WEIGHTED_NORMAL')
        wn.keep_sharp = True
    return o


def box(name, size, loc, material, bevel=0.02, segments=2, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return _finish(o, name, material, bevel, segments)


def cyl(name, r, depth, loc, material, verts=24, bevel=0.01, r2=None, rot=(0, 0, 0), segments=2):
    """Cylinder (or cone frustum when r2 is given) centered at loc."""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    return _finish(o, name, material, bevel, segments)


def sphere(name, r, loc, material, subdiv=2, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, name, material, 0)


def uvsphere(name, r, loc, material, seg=16, rings=10, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, name, material, 0)


def torus(name, major, minor, loc, material, rot=(0, 0, 0), major_seg=24, minor_seg=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot,
                                     major_segments=major_seg, minor_segments=minor_seg)
    o = bpy.context.active_object
    return _finish(o, name, material, 0)


def plane(name, w, h, loc, material, rot=(math.pi / 2, 0, 0)):
    """Flat quad with 0..1 UVs, facing -Y by default (a screen facing the viewer)."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = (w, h, 1)
    return _finish(o, name, material, 0)


def lathe(name, profile, loc, material, steps=24):
    """Revolve [(r, z), ...] around Z. Profile runs bottom to top."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for i in range(steps):
        r0, r1 = rings[i], rings[(i + 1) % steps]
        for j in range(len(profile) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.location = loc
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    return _finish(o, name, material, 0)


def prism(name, pts, width, loc, material, bevel=0.01, segments=2):
    """Extrude a 2D outline [(y, z), ...] (counter-clockwise seen from +X) along X by width."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    a = [bm.verts.new((-width / 2, y, z)) for y, z in pts]
    b = [bm.verts.new((width / 2, y, z)) for y, z in pts]
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.location = loc
    for s_ in bpy.context.selected_objects:
        s_.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    return _finish(o, name, material, bevel, segments)


def place(objs, x=0.0, y=0.0, rz=0.0):
    """Rotate objects about the origin by rz, then move them by (x, y). Transforms are applied."""
    c, s_ = math.cos(rz), math.sin(rz)
    for o in objs:
        if not o:
            continue
        lx, ly, lz = o.location
        o.location = (lx * c - ly * s_ + x, lx * s_ + ly * c + y, lz)
        o.rotation_euler[2] += rz
        for sel in bpy.context.selected_objects:
            sel.select_set(False)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return objs


def subdivide(o, levels=1):
    m = o.modifiers.new('sub', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return o


def displace_noise(o, strength=0.05, size=0.3, seed=1):
    tex = bpy.data.textures.new(f'n{seed}', 'CLOUDS')
    tex.noise_scale = size
    d = o.modifiers.new('disp', 'DISPLACE')
    d.texture = tex
    d.strength = strength
    d.mid_level = 0.5
    return o


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return o


def join(objs, name):
    """Apply modifiers and join static parts into one object (materials kept per face)."""
    objs = [o for o in objs if o]
    for o in objs:
        apply_mods(o)
    for s in bpy.context.selected_objects:
        s.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o


def parent(child, par):
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()
    return child


def tri_count():
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        e = o.evaluated_get(dg)
        me = e.to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        e.to_mesh_clear()
    return n


# Parts that keep UVs: canvas-textured quads. Names end in _screen, or are exactly window_glass.
UV_SUFFIX = '_screen'
UV_EXACT = ('window_glass',)


def _canonical_order(o):
    # Modifiers emit faces in a varying order; sort vertices and faces by position so exports are stable.
    bm = bmesh.new()
    bm.from_mesh(o.data)
    r = lambda v: (round(v[0], 5), round(v[1], 5), round(v[2], 5))
    bm.verts.index_update()
    vrank = [0] * len(bm.verts)
    for i, v in enumerate(sorted(bm.verts, key=lambda v: r(v.co))):
        vrank[v.index] = i
    bm.verts.sort(key=lambda v: vrank[v.index])
    bm.verts.index_update()
    bm.faces.index_update()
    frank = [0] * len(bm.faces)
    fkey = lambda f: (f.material_index, r(f.calc_center_median()), tuple(sorted(v.index for v in f.verts)))
    for i, f in enumerate(sorted(bm.faces, key=fkey)):
        frank[f.index] = i
    bm.faces.sort(key=lambda f: frank[f.index])
    bm.to_mesh(o.data)
    bm.free()


def _strip_uvs():
    # Solid-color parts need no UVs, and float noise in them makes rebuilt .glb files differ.
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        if o.name.endswith(UV_SUFFIX) or o.name in UV_EXACT:
            for layer in o.data.uv_layers:
                for d in layer.data:
                    d.uv = (round(d.uv[0], 4), round(d.uv[1], 4))
            continue
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])


def scale_all(k):
    """Uniformly scale every object about the origin (for small props that need to read bigger)."""
    for o in bpy.context.scene.objects:
        o.location = (o.location[0] * k, o.location[1] * k, o.location[2] * k)
        o.scale = (o.scale[0] * k, o.scale[1] * k, o.scale[2] * k)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def export(path=None, budget=3000, clear=False):
    path = path or out_path()
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH':
            continue
        # Triangulate here with fixed rules; the exporter's own triangulation order varies run to run.
        t = o.modifiers.new('tri', 'TRIANGULATE')
        t.quad_method = 'FIXED'
        t.ngon_method = 'BEAUTY'
        t.keep_custom_normals = True
        apply_mods(o)
        _canonical_order(o)
    _strip_uvs()
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tris = tri_count()
    if os.environ.get('HITL_TRIS'):
        dg = bpy.context.evaluated_depsgraph_get()
        for o in sorted(bpy.context.scene.objects, key=lambda x: x.name):
            if o.type == 'MESH':
                me = o.evaluated_get(dg).to_mesh()
                me.calc_loop_triangles()
                print(f'  {o.name}: {len(me.loop_triangles)}')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_normals=True, export_texcoords=True,
                              export_animations=False, export_cameras=False, export_lights=False)
    name = os.path.splitext(os.path.basename(path))[0]
    status = 'OK' if tris <= budget else 'OVER BUDGET'
    print(f'MODEL {name}: {tris} tris ({status}, budget {budget})')
    if tris > budget:
        sys.exit(2)
    if clear:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete()


def tier_path(level):
    """public/models/<item>.glb given as --out becomes <item>_l<level>.glb."""
    base = out_path()
    root, ext = os.path.splitext(base)
    return f'{root}_l{level}{ext}'
