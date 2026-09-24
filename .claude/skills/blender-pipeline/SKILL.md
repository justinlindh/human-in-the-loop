---
name: blender-pipeline
description: How to script Blender 5.2 headlessly to build props and chibi character parts and export them to glTF for Human in the Loop. Use when creating or changing anything under blender/ or public/models/, or when a .glb looks wrong in the game.
---

# Blender pipeline

Blender 5.2 is installed at `/usr/bin/blender`. Everything is scripted and headless; nobody opens the Blender UI.

## Layout

- `blender/lib/common.py`: shared helpers (import with `sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))`).
- `blender/props/<name>.py`: one script per prop. `blender/characters/chibi.py`: character parts.
- `scripts/build-models.sh`: runs every script, stops on the first failure, prints triangle counts.
- Output: `public/models/<name>.glb`, committed so the game runs without Blender.

Run one script:

```bash
blender -b --factory-startup -P blender/props/desk.py -- --out public/models/desk.glb
```

Arguments after `--` are read with `sys.argv[sys.argv.index('--') + 1:]`.

## Conventions

- Units: 1 Blender unit = 1 meter. A desk is about 1.4 x 0.75 x 0.7 m. A character is about 1.0 m tall (chibi).
- Origin at the floor center of the object (z = 0 at the base). The glTF exporter converts Z-up to Y-up; do not rotate manually.
- Triangle budget: props under 3k triangles, the whole character part set under 8k.
- Materials are placeholders named `pal_<palette name>` (for example `pal_wood_honey`, `pal_screen`, `pal_led`, `pal_skin`, `pal_shirt`). The game replaces them with shared palette materials by name, so do not bother with Blender material settings beyond a base color that roughly matches (it helps when viewing a .glb directly).
- Object names are meaningful and stable (`monitor_screen`, `rack_led_03`, `hair_4`): the renderer finds parts by name.
- Apply transforms and modifiers at export (`export_apply=True`).

## Helpers common.py should provide

```python
import bpy, bmesh, sys, os

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def out_path():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return args[args.index('--out') + 1]

def mat(name, rgba=(0.8, 0.8, 0.8, 1)):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = rgba
    return m

def soften(obj, width=0.02, segments=3):
    b = obj.modifiers.new('bevel', 'BEVEL')
    b.width, b.segments, b.limit_method = width, segments, 'ANGLE'
    obj.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True

def box(name, size, loc, material, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    if bevel:
        soften(o, bevel)
    return o

def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                              export_yup=True, export_materials='EXPORT')
```

Add cylinder, lathe (screw modifier on a profile curve), and join helpers as needed. Use subdivision (level 1 to 2, then apply) only on organic parts like heads and plants.

## Verify every asset

1. The script exits 0 and prints its triangle count.
2. Quick render check without the game: add `--render /tmp/<name>.png` support to `common.py` that renders the object with Workbench (fast, headless) from the isometric angle, then Read the PNG.
3. In game: the lineup views (`?mock=floor&props=1`, `?mock=floor&chars=1`) via `npm run snap`, judged with the art-direction checklist.

## Gotchas

- `--factory-startup` keeps user prefs and add-ons out of the build; always pass it.
- Bevel on non-applied scale gives uneven bevels: apply scale before adding the modifier (the `box` helper does).
- The glTF exporter merges nothing on its own: separate objects become separate meshes. Join static sub-parts that never animate to keep draw calls down; keep animated character parts separate.
- If a .glb shows black faces in Three.js, the normals are flipped: recalculate outside in edit mode before export.
