"""Small chunky props that exist only as icons: categories, research tools, training, project sizes.
Each builder makes objects in the current scene (Z up, front facing -Y) and returns nothing.
Shapes are exaggerated so they read at 20 to 30 px."""
import math
from common import box, cyl, sphere, uvsphere, torus, lathe, prism
import kit


def _lines(prefix, n, x0, x1, y, z0, dz, mat='metal_dark', w=0.018):
    for i in range(n):
        box(f'{prefix}{i}', (x1 - x0 - (0.12 if i == n - 1 else 0), w, 0.03), ((x0 + x1) / 2 - (0.06 if i == n - 1 else 0), y, z0 - i * dz), mat, bevel=0)


def notes():
    box('pad', (0.9, 0.12, 1.1), (0, 0, 0.55), 'screen_amber', bevel=0.05, segments=3)
    box('page', (0.8, 0.02, 0.95), (0, -0.065, 0.52), 'paper_sheet', bevel=0.02)
    for i in range(5):
        torus(f'ring{i}', 0.05, 0.016, (-0.32 + i * 0.16, -0.03, 1.1), 'metal_soft', rot=(0, math.pi / 2, 0), major_seg=12, minor_seg=5)
    _lines('ln', 4, -0.3, 0.3, -0.08, 0.8, 0.17, 'marker_blue')
    cyl('pencil', 0.05, 0.9, (0.42, -0.2, 0.45), 'marker_orange', verts=6, bevel=0.01, rot=(0, math.radians(-30), 0))
    cyl('tip', 0.05, 0.12, (0.64, -0.2, 0.06), 'wood_light', verts=6, r2=0.0, bevel=0, rot=(0, math.radians(150), 0))


def email():
    box('env', (1.2, 0.12, 0.8), (0, 0, 0.4), 'paper_sheet', bevel=0.05, segments=3)
    for sx in (-1, 1):
        box(f'fold{sx}', (0.74, 0.03, 0.06), (sx * 0.29, -0.07, 0.58), 'baseboard', bevel=0.01, rot=(0, sx * math.radians(34), 0))
    cyl('seal', 0.13, 0.05, (0, -0.08, 0.4), 'role_designer', verts=20, bevel=0.015, rot=(math.pi / 2, 0, 0))


def pm():
    box('board', (0.95, 0.1, 1.2), (0, 0, 0.6), 'wood_honey', bevel=0.05, segments=3)
    box('clip', (0.4, 0.14, 0.14), (0, -0.02, 1.2), 'metal_soft', bevel=0.04)
    box('sheet', (0.8, 0.02, 1.0), (0, -0.06, 0.55), 'paper_sheet', bevel=0.02)
    for i, c in enumerate(['role_support', 'role_support', 'role_marketer']):
        z = 0.9 - i * 0.26
        box(f'chk{i}', (0.14, 0.03, 0.14), (-0.26, -0.08, z), c, bevel=0.03)
        box(f'row{i}', (0.38, 0.02, 0.05), (0.1, -0.08, z), 'metal_dark', bevel=0)


def support():
    torus('band', 0.42, 0.06, (0, 0, 0.5), 'plastic_charcoal', rot=(math.pi / 2, 0, 0), major_seg=24, minor_seg=8)
    for sx in (-1, 1):
        cyl(f'cup{sx}', 0.2, 0.16, (sx * 0.42, 0, 0.35), 'role_support', verts=24, bevel=0.04, rot=(0, math.pi / 2, 0))
    box('boom', (0.05, 0.05, 0.5), (-0.32, -0.25, 0.12), 'plastic_charcoal', bevel=0.015, rot=(math.radians(-60), 0, math.radians(-30)))
    uvsphere('mic', 0.08, (-0.1, -0.45, 0.02), 'plastic_charcoal')


def crm():
    box('card', (1.2, 0.1, 0.8), (0, 0, 0.4), 'paper_sheet', bevel=0.06, segments=3)
    box('stripe', (1.2, 0.03, 0.16), (0, -0.055, 0.72), 'role_sales', bevel=0.02)
    uvsphere('head', 0.13, (-0.3, -0.06, 0.45), 'skin_2', scale=(1, 0.5, 1))
    box('body', (0.34, 0.03, 0.16), (-0.3, -0.06, 0.2), 'role_engineer', bevel=0.05)
    _lines('ln', 3, 0.0, 0.48, -0.06, 0.5, 0.13)


def analytics():
    box('base', (1.2, 0.5, 0.08), (0, 0, 0.04), 'plastic_white', bevel=0.03)
    for i, (h, c) in enumerate([(0.35, 'role_engineer'), (0.62, 'role_support'), (0.95, 'role_marketer')]):
        box(f'bar{i}', (0.26, 0.26, h), (-0.36 + i * 0.36, 0, 0.08 + h / 2), c, bevel=0.04)
    cyl('arrow', 0.035, 1.1, (0, -0.2, 0.75), 'role_designer', verts=10, bevel=0, rot=(0, math.radians(58), 0))
    cyl('head', 0.1, 0.16, (0.48, -0.2, 1.05), 'role_designer', verts=10, r2=0.0, bevel=0, rot=(0, math.radians(58), 0))


def design():
    p = cyl('palette', 0.55, 0.08, (0, 0, 0.04), 'wood_light', verts=32, bevel=0.03)
    p.scale = (1.15, 0.9, 1)
    cyl('hole', 0.09, 0.1, (0.35, 0.25, 0.06), 'wall_trim', verts=16, bevel=0)
    for i, c in enumerate(['role_designer', 'role_engineer', 'role_marketer', 'role_support', 'role_sales']):
        a = math.radians(150 + i * 42)
        sphere(f'dab{i}', 0.1, (math.cos(a) * 0.36, math.sin(a) * 0.3, 0.1), c, subdiv=2, scale=(1, 1, 0.45))
    cyl('brush', 0.035, 0.9, (0.1, -0.1, 0.3), 'wood_dark', verts=8, bevel=0.01, rot=(math.radians(60), 0, math.radians(35)))
    cyl('tipb', 0.06, 0.16, (-0.17, 0.3, 0.52), 'role_designer', verts=8, bevel=0.02, r2=0.02, rot=(math.radians(60), 0, math.radians(35)))


def devtools():
    box('win', (1.2, 0.12, 0.85), (0, 0, 0.43), 'plastic_charcoal', bevel=0.05, segments=3)
    box('bar', (1.2, 0.13, 0.16), (0, 0, 0.78), 'metal_soft', bevel=0.03)
    for i, c in enumerate(['led_red', 'led_amber', 'led_green']):
        cyl(f'dot{i}', 0.035, 0.03, (-0.48 + i * 0.1, -0.07, 0.78), c, verts=12, bevel=0, rot=(math.pi / 2, 0, 0))
    for sx in (-1, 1):
        box(f'chev{sx}', (0.22, 0.03, 0.06), (-0.3, -0.07, 0.42 + sx * 0.07), 'screen_green', bevel=0.01, rot=(0, sx * math.radians(35), 0))
    box('cursor', (0.24, 0.03, 0.06), (0.02, -0.07, 0.28), 'screen_green', bevel=0.01)


def _pawn(p, x, y, s, shirt, skin='skin_1', hair='wood_dark'):
    lathe(f'{p}body', [(0.001, 0), (0.3 * s, 0), (0.32 * s, 0.05 * s), (0.26 * s, 0.35 * s), (0.14 * s, 0.5 * s), (0.001, 0.52 * s)], (x, y, 0), shirt, steps=20)
    uvsphere(f'{p}head', 0.2 * s, (x, y, 0.7 * s), skin, seg=16, rings=10)
    uvsphere(f'{p}hair', 0.21 * s, (x, y + 0.03 * s, 0.76 * s), hair, seg=16, rings=10, scale=(1, 1, 0.7))


def hr():
    _pawn('a', -0.28, 0.15, 1.0, 'role_engineer')
    _pawn('b', 0.3, -0.05, 1.1, 'role_support', skin='skin_3', hair='coffee')
    uvsphere('heart', 0.12, (0.0, -0.2, 1.05), 'role_designer', seg=12, rings=8, scale=(1.2, 0.6, 1))


def recruiting():
    _pawn('a', -0.2, 0.1, 1.0, 'role_marketer', skin='skin_2')
    torus('lens', 0.26, 0.05, (0.2, -0.3, 0.6), 'metal_dark', rot=(math.pi / 2, 0, 0), major_seg=24, minor_seg=8)
    cyl('glass', 0.23, 0.02, (0.2, -0.3, 0.6), 'glass', verts=24, bevel=0, rot=(math.pi / 2, 0, 0))
    cyl('handle', 0.06, 0.45, (0.5, -0.3, 0.2), 'wood_dark', verts=10, bevel=0.02, rot=(0, math.radians(-40), 0))


def accounting():
    box('body', (0.8, 0.2, 1.1), (0, 0, 0.55), 'plastic_white', bevel=0.07, segments=3)
    box('screen', (0.64, 0.05, 0.24), (0, -0.09, 0.88), 'screen_green', bevel=0.02)
    cols = ['metal_soft', 'metal_soft', 'role_marketer']
    for r in range(3):
        for c in range(3):
            box(f'k{r}{c}', (0.16, 0.06, 0.13), (-0.2 + c * 0.2, -0.1, 0.56 - r * 0.18), cols[c] if r < 2 else ('role_engineer' if c == 2 else 'metal_soft'), bevel=0.03)


def video():
    box('slate', (1.1, 0.12, 0.72), (0, 0, 0.36), 'plastic_charcoal', bevel=0.04, segments=3)
    box('clap', (1.1, 0.12, 0.18), (0.04, 0, 0.85), 'plastic_charcoal', bevel=0.03, rot=(0, math.radians(-14), 0))
    for i in range(5):
        box(f'st{i}', (0.1, 0.13, 0.19), (-0.42 + i * 0.22, -0.005, 0.86 - i * 0.05), 'paper', bevel=0, rot=(0, math.radians(-14), math.radians(0)))
    for i in range(3):
        box(f'ln{i}', (0.7, 0.13, 0.03), (0.0, -0.005, 0.5 - i * 0.14), 'paper', bevel=0)


def legal():
    cyl('base', 0.3, 0.08, (0, 0, 0.04), 'wood_dark', verts=24, bevel=0.03)
    cyl('pole', 0.04, 1.0, (0, 0, 0.55), 'gold', verts=12, bevel=0)
    box('beam', (1.1, 0.08, 0.06), (0, 0, 1.02), 'gold', bevel=0.02)
    uvsphere('knob', 0.07, (0, 0, 1.1), 'gold', seg=12, rings=8)
    for sx in (-1, 1):
        cyl(f'str{sx}', 0.01, 0.35, (sx * 0.5, 0, 0.84), 'gold', verts=6, bevel=0)
        lathe(f'pan{sx}', [(0.001, 0.62), (0.2, 0.62), (0.24, 0.7), (0.22, 0.7), (0.001, 0.66)], (sx * 0.5, 0, 0), 'gold', steps=20)


def security():
    pts = [(-0.45, 1.0), (0.45, 1.0), (0.42, 0.45), (0.0, 0.0), (-0.42, 0.45)]
    s = prism('shield', [(x, z) for x, z in pts], 0.14, (0, 0, 0), 'role_engineer', bevel=0.04)
    s.rotation_euler = (0, 0, math.pi / 2)
    import bpy
    for o in bpy.context.selected_objects:
        o.select_set(False)
    s.select_set(True)
    bpy.context.view_layer.objects.active = s
    bpy.ops.object.transform_apply(rotation=True)
    cyl('lockbody', 0.16, 0.1, (0, -0.1, 0.5), 'gold', verts=20, bevel=0.02, rot=(math.pi / 2, 0, 0))
    box('lockbar', (0.1, 0.08, 0.28), (0, -0.1, 0.38), 'gold', bevel=0.02)
    cyl('hole', 0.04, 0.03, (0, -0.16, 0.52), 'ink', verts=12, bevel=0, rot=(math.pi / 2, 0, 0))


# Research tools
def eval_harness():
    lathe('tube', [(0.001, 0.0), (0.16, 0.04), (0.18, 0.12), (0.18, 1.0), (0.22, 1.04), (0.22, 1.08), (0.001, 1.08)], (0, 0, 0), 'glass', steps=20)
    lathe('liquid', [(0.001, 0.03), (0.15, 0.06), (0.165, 0.12), (0.165, 0.55), (0.001, 0.55)], (0, 0, 0), 'screen_green', steps=20)
    cyl('rack', 0.5, 0.1, (0, 0, 0.05), 'wood_honey', verts=6, bevel=0.03)
    for i in range(3):
        sphere(f'bub{i}', 0.04 + i * 0.01, (0.03 * (i - 1), -0.05, 0.62 + i * 0.12), 'screen_green', subdiv=1)


def agent_sandbox():
    box('tray', (1.2, 0.9, 0.24), (0, 0, 0.12), 'wood_honey', bevel=0.04)
    box('sand', (1.08, 0.78, 0.06), (0, 0, 0.23), 'rug_mustard', bevel=0.02)
    box('botbody', (0.34, 0.28, 0.3), (0.05, 0, 0.45), 'metal_soft', bevel=0.08, segments=3)
    box('botface', (0.26, 0.04, 0.14), (0.05, -0.14, 0.48), 'screen_bg', bevel=0.02)
    for sx in (-1, 1):
        cyl(f'eye{sx}', 0.03, 0.03, (0.05 + sx * 0.06, -0.165, 0.49), 'screen_cyan', verts=10, bevel=0, rot=(math.pi / 2, 0, 0))
    cyl('ant', 0.015, 0.14, (0.05, 0, 0.66), 'metal_dark', verts=6, bevel=0)
    uvsphere('antball', 0.04, (0.05, 0, 0.74), 'led_red', seg=8, rings=6)
    lathe('bucket', [(0.001, 0), (0.12, 0), (0.16, 0.22), (0.001, 0.22)], (-0.38, 0.18, 0.25), 'role_engineer', steps=16)


def observability():
    for a in (0.3, 2.4, 4.5):
        cyl(f'leg{a}', 0.055, 0.8, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.38), 'wood_dark', verts=8, bevel=0.01,
            rot=(math.sin(a) * 0.35, -math.cos(a) * 0.35, 0))
    cyl('hub', 0.12, 0.12, (0, 0, 0.78), 'metal_dark', verts=12, bevel=0.03)
    cyl('tube', 0.22, 1.05, (0, 0, 1.0), 'role_sales', verts=24, bevel=0.04, r2=0.16, rot=(0, math.radians(60), 0))
    cyl('band', 0.235, 0.08, (0.15, 0, 1.09), 'gold', verts=24, bevel=0.02, rot=(0, math.radians(60), 0))
    cyl('lens', 0.25, 0.12, (0.46, 0, 1.27), 'gold', verts=24, bevel=0.03, rot=(0, math.radians(60), 0))
    cyl('glass', 0.19, 0.02, (0.52, 0, 1.3), 'glass', verts=24, bevel=0, rot=(0, math.radians(60), 0))
    cyl('eyep', 0.1, 0.16, (-0.48, 0, 0.72), 'plastic_charcoal', verts=12, bevel=0.03, rot=(0, math.radians(60), 0))


def _gear(p, x, z, r, teeth, mat, y=0):
    cyl(f'{p}disc', r, 0.14, (x, y, z), mat, verts=teeth * 2, bevel=0.02, rot=(math.pi / 2, 0, 0))
    for i in range(teeth):
        a = 2 * math.pi * i / teeth
        box(f'{p}t{i}', (0.12, 0.14, 0.1), (x + math.cos(a) * r, y, z + math.sin(a) * r), mat, bevel=0.02, rot=(0, -a, 0))
    cyl(f'{p}hub', r * 0.3, 0.16, (x, y - 0.01, z), 'metal_dark', verts=16, bevel=0.01, rot=(math.pi / 2, 0, 0))


def ci_cd():
    _gear('a', -0.25, 0.55, 0.32, 10, 'role_engineer')
    _gear('b', 0.34, 0.25, 0.22, 8, 'role_support', y=-0.02)
    torus('loop', 0.62, 0.035, (0.0, 0.1, 0.45), 'role_marketer', rot=(math.pi / 2, 0, 0), major_seg=32, minor_seg=6)


def design_system():
    cols = ['role_engineer', 'role_designer', 'role_marketer', 'role_support', 'role_sales', 'fabric_teal']
    k = 0
    for r in range(3):
        for c in range(3 - r):
            box(f'b{r}{c}', (0.34, 0.34, 0.26), (-0.36 + c * 0.36 + r * 0.18, 0, 0.13 + r * 0.27), cols[k % 6], bevel=0.05, segments=3)
            for sx in (-1, 1):
                cyl(f'stud{r}{c}{sx}', 0.055, 0.05, (-0.36 + c * 0.36 + r * 0.18 + sx * 0.08, 0, 0.28 + r * 0.27), cols[k % 6], verts=12, bevel=0.01)
            k += 1


def docs_culture():
    for i, (c, w) in enumerate([('fabric_teal', 1.0), ('fabric_mustard', 0.92), ('fabric_terracotta', 0.96)]):
        box(f'bk{i}', (w, 0.7, 0.18), (0.02 * i, 0, 0.09 + i * 0.19), c, bevel=0.03, rot=(0, 0, math.radians(-6 + i * 5)))
        box(f'pg{i}', (w - 0.08, 0.66, 0.12), (0.02 * i + 0.03, -0.03, 0.09 + i * 0.19), 'paper_sheet', bevel=0.01, rot=(0, 0, math.radians(-6 + i * 5)))
    box('mark', (0.08, 0.02, 0.3), (0.2, -0.36, 0.5), 'role_designer', bevel=0)


def onboarding_kit():
    box('box', (0.9, 0.7, 0.6), (0, 0, 0.3), 'cardboard', bevel=0.04)
    box('lid', (0.96, 0.76, 0.14), (0, 0, 0.66), 'cardboard', bevel=0.04)
    box('rib1', (0.14, 0.78, 0.76), (0, 0, 0.38), 'role_designer', bevel=0.01)
    box('rib2', (0.98, 0.14, 0.76), (0, 0, 0.38), 'role_designer', bevel=0.01)
    for sx in (-1, 1):
        torus(f'bow{sx}', 0.14, 0.05, (sx * 0.14, 0, 0.82), 'role_designer', rot=(0, math.radians(sx * 60), 0), major_seg=16, minor_seg=6)
    uvsphere('knot', 0.07, (0, 0, 0.8), 'role_designer', seg=10, rings=6)


def red_team_suite():
    for i, c in enumerate(['paper', 'role_security', 'paper', 'role_security']):
        cyl(f'ring{i}', 0.55 - i * 0.13, 0.08 + i * 0.02, (0, 0, 0.55), c, verts=32, bevel=0.01, rot=(math.pi / 2, 0, 0))
    box('stand', (0.1, 0.1, 0.5), (0, 0.1, 0.25), 'wood_dark', bevel=0.02)
    cyl('dart', 0.03, 0.6, (0.28, -0.3, 0.7), 'metal_dark', verts=8, bevel=0, rot=(math.radians(70), 0, math.radians(30)))
    box('fl1', (0.02, 0.14, 0.14), (0.42, -0.52, 0.8), 'role_engineer', bevel=0, rot=(math.radians(70), 0, math.radians(30)))


# Training
def workshop():
    box('box', (1.1, 0.5, 0.45), (0, 0, 0.23), 'role_security', bevel=0.05, segments=3)
    box('latch', (0.14, 0.04, 0.12), (0, -0.26, 0.38), 'metal_soft', bevel=0.02)
    torus('handle', 0.24, 0.04, (0, 0, 0.5), 'plastic_charcoal', rot=(math.pi / 2, 0, 0), major_seg=20, minor_seg=6)
    cyl('ham', 0.035, 0.7, (0.25, 0.05, 0.75), 'wood_honey', verts=8, bevel=0.01, rot=(0, math.radians(20), 0))
    box('hamhead', (0.3, 0.12, 0.12), (0.37, 0.05, 1.07), 'metal_dark', bevel=0.03, rot=(0, math.radians(20), 0))
    cyl('drv', 0.05, 0.3, (-0.25, 0.05, 0.62), 'role_marketer', verts=8, bevel=0.02, rot=(0, math.radians(-20), 0))
    cyl('drvs', 0.015, 0.35, (-0.33, 0.05, 0.92), 'metal_soft', verts=6, bevel=0, rot=(0, math.radians(-20), 0))


def conference():
    cyl('base', 0.36, 0.1, (0, 0, 0.05), 'plastic_charcoal', verts=24, bevel=0.03)
    cyl('pole', 0.06, 0.7, (0, 0, 0.45), 'metal_soft', verts=10, bevel=0.01)
    cyl('neck', 0.09, 0.18, (0, 0, 0.86), 'plastic_charcoal', verts=12, bevel=0.02)
    lathe('head', [(0.001, 0.92), (0.18, 0.95), (0.27, 1.08), (0.28, 1.28), (0.2, 1.44), (0.001, 1.48)], (0, 0, 0), 'metal_soft', steps=20)
    torus('grille', 0.28, 0.035, (0, 0, 1.18), 'role_sales', major_seg=20, minor_seg=6)
    box('badge', (0.34, 0.03, 0.44), (0.42, -0.25, 0.5), 'paper_sheet', bevel=0.03, rot=(0, 0, math.radians(-20)))
    box('badgetop', (0.34, 0.035, 0.12), (0.42, -0.255, 0.66), 'role_sales', bevel=0.02, rot=(0, 0, math.radians(-20)))


def course():
    box('board', (1.0, 1.0, 0.07), (0, 0, 0.62), 'fabric_slate', bevel=0.02, rot=(0, 0, math.radians(45)))
    lathe('cap', [(0.001, 0.2), (0.36, 0.2), (0.38, 0.28), (0.34, 0.6), (0.001, 0.6)], (0, 0, 0), 'metal_dark', steps=20)
    uvsphere('button', 0.05, (0, 0, 0.67), 'gold', seg=10, rings=6)
    cyl('tassel', 0.02, 0.4, (0.34, -0.1, 0.45), 'gold', verts=6, bevel=0, rot=(0, math.radians(10), 0))
    cyl('tend', 0.05, 0.14, (0.37, -0.1, 0.2), 'gold', verts=8, bevel=0.01, r2=0.02)


# Project sizes
def _frosted(p, z, r, h, cake='wood_light', frost='paper'):
    cyl(f'{p}cake', r, h, (0, 0, z + h / 2), cake, verts=28, bevel=0.03)
    lathe(f'{p}frost', [(0.001, z + h - 0.02), (r + 0.02, z + h - 0.02), (r + 0.03, z + h + 0.03), (r - 0.02, z + h + 0.08), (0.001, z + h + 0.08)], (0, 0, 0), frost, steps=28)
    for i in range(8):
        a = 2 * math.pi * i / 8
        sphere(f'{p}drip{i}', 0.045, (math.cos(a) * r, math.sin(a) * r, z + h - 0.04), frost, subdiv=1, scale=(1, 1, 1.4))


def small():
    lathe('cup', [(0.001, 0), (0.24, 0), (0.33, 0.36), (0.001, 0.36)], (0, 0, 0), 'role_designer', steps=20)
    for i in range(10):
        a = 2 * math.pi * i / 10
        box(f'pleat{i}', (0.03, 0.02, 0.34), (math.cos(a) * 0.29, math.sin(a) * 0.29, 0.18), 'role_designer', bevel=0, rot=(0, math.radians(-12) * 0, a))
    sphere('frost', 0.34, (0, 0, 0.44), 'paper', subdiv=3, scale=(1, 1, 0.6))
    sphere('frost2', 0.2, (0, 0, 0.62), 'paper', subdiv=2, scale=(1, 1, 0.7))
    uvsphere('cherry', 0.08, (0, 0, 0.78), 'role_security', seg=12, rings=8)
    for i, c in enumerate(['role_engineer', 'role_marketer', 'role_support']):
        box(f'spr{i}', (0.06, 0.02, 0.02), (math.cos(i * 2) * 0.2, math.sin(i * 2) * 0.2 - 0.05, 0.6), c, bevel=0, rot=(0, 0, i))


def medium():
    cyl('plate', 0.62, 0.05, (0, 0, 0.025), 'plastic_white', verts=32, bevel=0.02)
    _frosted('a', 0.05, 0.5, 0.36, cake='role_designer')
    _frosted('b', 0.49, 0.34, 0.3, cake='role_designer')
    for i in range(3):
        cyl(f'candle{i}', 0.03, 0.22, (-0.12 + i * 0.12, 0, 0.98), ['role_engineer', 'role_marketer', 'role_support'][i], verts=8, bevel=0)
        sphere(f'flame{i}', 0.04, (-0.12 + i * 0.12, 0, 1.13), 'lamp', subdiv=1, scale=(1, 1, 1.6))


def large():
    box('keep', (0.6, 0.6, 1.0), (0, 0.1, 0.5), 'wall_warm', bevel=0.03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(f'tower{sx}{sy}', 0.18, 1.2 if sy > 0 else 0.9, (sx * 0.42, sy * 0.35 + 0.1, (1.2 if sy > 0 else 0.9) / 2), 'wall_trim', verts=16, bevel=0.02)
            cyl(f'roof{sx}{sy}', 0.23, 0.34, (sx * 0.42, sy * 0.35 + 0.1, (1.2 if sy > 0 else 0.9) + 0.17), 'role_sales', verts=16, r2=0.0, bevel=0)
    for i in range(4):
        box(f'mer{i}', (0.1, 0.1, 0.1), (-0.22 + i * 0.15, -0.2, 1.05), 'wall_warm', bevel=0.02)
    box('door', (0.22, 0.06, 0.34), (0, -0.21, 0.17), 'wood_dark', bevel=0.06)
    cyl('flagpole', 0.015, 0.4, (0.42, 0.45, 1.6), 'metal_dark', verts=6, bevel=0)
    box('flag', (0.22, 0.02, 0.14), (0.53, 0.45, 1.72), 'role_marketer', bevel=0)


BUILDERS = {
    'cat.notes': notes, 'cat.email': email, 'cat.pm': pm, 'cat.support': support, 'cat.crm': crm,
    'cat.analytics': analytics, 'cat.design': design, 'cat.devtools': devtools, 'cat.hr': hr,
    'cat.recruiting': recruiting, 'cat.accounting': accounting, 'cat.video': video, 'cat.legal': legal,
    'cat.security': security,
    'research.eval_harness': eval_harness, 'research.agent_sandbox': agent_sandbox,
    'research.observability': observability, 'research.ci_cd': ci_cd, 'research.design_system': design_system,
    'research.docs_culture': docs_culture, 'research.onboarding_kit': onboarding_kit,
    'research.red_team_suite': red_team_suite,
    'train.workshop': workshop, 'train.conference': conference, 'train.course': course,
    'size.small': small, 'size.medium': medium, 'size.large': large,
}
