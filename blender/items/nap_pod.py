"""Office shop: nap_pod. l1 bean bag, l2 couch with blanket, l3 sleep pod with an open glass canopy."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

# Shop item tiers share one footprint: back edge near y = +0.5 (against a wall), front faces -Y.
BUDGET = {1: 3000, 2: 4000, 3: 6000}


def build(level, fn, name):
    reset()
    join(fn(), f'{name}_l{level}')
    export(tier_path(level), budget=BUDGET[level])


def l1():
    bag = sphere('bag', 0.45, (0, 0.05, 0.24), 'fabric_mustard', subdiv=3, scale=(1.15, 1.05, 0.55))
    displace_noise(bag, strength=0.04, size=0.5, seed=3)
    back = sphere('bagback', 0.36, (0, 0.3, 0.42), 'fabric_mustard', subdiv=2, scale=(1.2, 0.6, 0.85))
    displace_noise(back, strength=0.03, size=0.5, seed=5)
    blanket = box('blanket', (0.4, 0.3, 0.06), (0.62, -0.1, 0.03), 'fabric_teal', bevel=0.025, segments=2, rot=(0, 0, 0.35))
    blanket2 = box('blanket2', (0.36, 0.26, 0.05), (0.6, -0.08, 0.085), 'fabric_teal', bevel=0.022, segments=2, rot=(0, 0, 0.25))
    return [bag, back, blanket, blanket2] + kit.stack_books('sb', -0.62, -0.12, 0.0, n=2, seed=4)


def l2():
    parts = kit.couch('c_', 0, 0.1, W=1.55, fabric='fabric_sage', pillow='fabric_terracotta')
    parts.append(box('blanket_arm', (0.24, 0.84, 0.05), (0.66, 0.1, 0.58), 'fabric_mustard', bevel=0.02))
    parts.append(box('blanket_drape', (0.24, 0.05, 0.3), (0.66, -0.33, 0.44), 'fabric_mustard', bevel=0.02, rot=(math.radians(8), 0, 0)))
    parts.append(box('blanket_seat', (0.5, 0.45, 0.04), (0.2, -0.05, 0.5), 'fabric_mustard', bevel=0.018, rot=(0, 0, math.radians(12))))
    parts += kit.side_table('t_', -1.05, 0.1)
    parts += kit.mug('m', -1.05, 0.1, 0.48)
    return parts


def l3():
    import bpy
    parts = [
        box('plinth', (1.95, 0.95, 0.16), (0, 0.05, 0.08), 'plastic_charcoal', bevel=0.05, segments=3),
        box('tub', (1.85, 0.88, 0.42), (0, 0.05, 0.37), 'plastic_white', bevel=0.16, segments=4),
        box('mattress', (1.6, 0.66, 0.1), (0, 0.05, 0.6), 'fabric_slate', bevel=0.045, segments=3),
        box('pillow', (0.3, 0.46, 0.09), (-0.62, 0.05, 0.68), 'paper_sheet', bevel=0.04, segments=3),
        box('duvet', (0.9, 0.7, 0.07), (0.28, 0.05, 0.66), 'fabric_teal', bevel=0.03, segments=2),
        box('console', (0.26, 0.2, 0.34), (1.08, -0.2, 0.33), 'plastic_white', bevel=0.06, segments=3),
        box('step', (0.6, 0.25, 0.1), (0.1, -0.55, 0.05), 'metal_soft', bevel=0.02),
    ]
    return parts


def l3_canopy():
    import bpy
    dome = lathe('nap_pod_canopy', [(0.5, 0.0), (0.48, 0.14), (0.4, 0.28), (0.26, 0.38), (0.001, 0.42)], (0, 0, 0), 'glass', steps=20)
    dome.scale = (1.85, 0.86, 1.0)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = dome
    dome.select_set(True)
    bpy.ops.object.transform_apply(scale=True)
    # Hinged open toward the back so the bed shows from the isometric view.
    dome.location = (0, 0.28, 0.6)
    dome.rotation_euler = (math.radians(28), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    rim = box('rim', (1.8, 0.05, 0.05), (0, 0.5, 0.6), 'plastic_white', bevel=0.02)
    return [rim]


reset()
join(l1(), 'nap_pod_l1'); export(tier_path(1), budget=BUDGET[1])
reset()
join(l2(), 'nap_pod_l2'); export(tier_path(2), budget=BUDGET[2])
reset()
parts = l3()
parts += l3_canopy()
join(parts, 'nap_pod_l3')
box('nap_pod_glow', (1.6, 0.02, 0.025), (0, -0.4, 0.2), 'neon_cyan', bevel=0)
box('nap_pod_screen_glow', (0.16, 0.01, 0.12), (1.08, -0.305, 0.42), 'neon_cyan', bevel=0)
export(tier_path(3), budget=BUDGET[3])
