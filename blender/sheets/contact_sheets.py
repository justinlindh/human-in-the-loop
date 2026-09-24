"""Contact sheets: one PNG per .glb with front, side, back, 3/4, and top views on a neutral ground,
with a 1 m scale post (10 cm bands) beside the model. Rendered with Eevee on the GPU.

  blender -b --factory-startup -P blender/sheets/contact_sheets.py -- --models public/models --out <dir> [--only a.glb,b.glb]

Each sheet is <out>/<model>.png. Tiles are 384 px; the scale post and a 0.5 m floor grid sit behind
the model so size reads at a glance.
"""
import bpy, math, os, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default

MODELS = arg('--models', 'public/models')
OUT = arg('--out', 'shots/sheets')
ONLY = [s for s in (arg('--only', '') or '').split(',') if s]
TILE = int(arg('--tile', '384'))
os.makedirs(OUT, exist_ok=True)

VIEWS = [('front', 0), ('3/4', 45), ('side', 90), ('back', 180), ('top', None)]


def srgb(h):
    return [((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5)] + [1]


def mat(name, hexv, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hexv)
    b.inputs['Roughness'].default_value = rough
    return m


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = TILE
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    w = bpy.data.worlds.new('w'); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = srgb('#e9e2d6')
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2; sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    sc.collection.objects.link(sun)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 0.8
    fill.rotation_euler = (math.radians(60), 0, math.radians(-150))
    sc.collection.objects.link(fill)
    # Neutral ground with a 0.5 m grid, and a 1 m scale post with 10 cm bands.
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.001))
    bpy.context.active_object.data.materials.append(mat('ground', '#d8d0c3'))
    g = mat('grid', '#bdb3a4')
    for i in range(-8, 9):
        for axis in (0, 1):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(i * 0.5 if axis == 0 else 0, 0 if axis == 0 else i * 0.5, 0))
            o = bpy.context.active_object
            o.scale = (0.006, 8, 0.0005) if axis == 0 else (8, 0.006, 0.0005)
            o.data.materials.append(g)
    for k in range(10):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.02, depth=0.1, vertices=12, location=(0, 0, 0.05 + k * 0.1))
        o = bpy.context.active_object
        o.name = f'post{k}'
        o.data.materials.append(mat(f'post{k}', '#2a2630' if k % 2 else '#e08a3c'))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def frame(cam, bb_min, bb_max, view):
    c = (bb_min + bb_max) / 2
    ext = bb_max - bb_min
    size = max(ext.x, ext.y, ext.z, 0.5)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size * 1.2
    d = size * 3
    if view is None:
        cam.location = c + Vector((0, 0, d))
        cam.rotation_euler = (0, 0, 0)
        return
    a = math.radians(view)
    # Models face -Y, so the front view looks along +Y; views go around toward +X.
    dirv = Vector((math.sin(a), -math.cos(a), 0.35)).normalized()
    cam.location = c + dirv * d
    cam.rotation_euler = (-dirv).to_track_quat('-Z', 'Y').to_euler()


def render_tile(sc):
    path = os.path.join(OUT, '_tile.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE, TILE, 4)
    bpy.data.images.remove(img)
    return px


def render_rows(glb):
    sc, cam = setup()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if not objs:
        return None
    # Part kits (chibi, pets) import every part at the origin: lay them out in a row instead.
    name = os.path.splitext(os.path.basename(glb))[0]
    if name in ('chibi', 'pets'):
        roots = sorted((o for o in bpy.data.objects if o not in before and o.parent is None), key=lambda o: o.name)
        cols = max(1, math.ceil(math.sqrt(len(roots))))
        for i, o in enumerate(roots):
            o.location.x += (i % cols) * 0.5
            o.location.y += (i // cols) * 0.5
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.bound_box:
            w = o.matrix_world @ Vector(v)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    # The scale post stands just off the model's left side.
    for k in range(10):
        p = bpy.data.objects[f'post{k}']
        p.location.x = lo.x - 0.15
        p.location.y = (lo.y + hi.y) / 2
    lo.x -= 0.2
    tiles = []
    for label, view in VIEWS:
        frame(cam, lo, hi, view)
        tiles.append(render_tile(sc))
    return np.concatenate(tiles, axis=1)


def sheet(family, glbs):
    # One row per level variant (l1 at the top in the image), five views across.
    rows = [r for r in (render_rows(g) for g in glbs) if r is not None]
    if not rows:
        return None
    img = np.concatenate(rows[::-1], axis=0)      # Blender image rows run bottom-up
    out = bpy.data.images.new(family, img.shape[1], img.shape[0], alpha=True)
    out.pixels[:] = img.ravel()
    path = os.path.join(OUT, f'{family}.png')
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    return path


# Rigs (*_rig.glb) hold bones and clips, nothing to look at.
files = sorted(f for f in os.listdir(MODELS) if f.endswith('.glb') and not f.endswith('_rig.glb'))
if ONLY:
    files = [f for f in files if f in ONLY or os.path.splitext(f)[0] in ONLY]
import re
families = {}
for f in files:
    fam = re.sub(r'_l[123]$', '', os.path.splitext(f)[0])
    families.setdefault(fam, []).append(os.path.join(MODELS, f))
if ONLY:
    fams = {re.sub(r'_l[123]$', '', o) for o in ONLY}
    files = sorted(f for f in os.listdir(MODELS) if f.endswith('.glb') and not f.endswith('_rig.glb') and re.sub(r'_l[123]$', '', os.path.splitext(f)[0]) in fams)
    families = {}
    for f in files:
        families.setdefault(re.sub(r'_l[123]$', '', os.path.splitext(f)[0]), []).append(os.path.join(MODELS, f))
for fam, glbs in sorted(families.items()):
    print(f'SHEET {sheet(fam, sorted(glbs))}')
tmp = os.path.join(OUT, '_tile.png')
if os.path.exists(tmp):
    os.remove(tmp)
