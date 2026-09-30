"""Early-90s office gear: a beige desk phone, a dot-matrix printer, a fax, a Rolodex and a cork board.

The desk pieces stand on a desktop at z=0 with their fronts toward -Y (the sitter), sized for the free
back corner of era_crt_desk. They repeat across an office, so every bevel has one segment and the
materials are ones the CRT desk (desk gear) or the era shelf (cork board) already draw, so they
add no draw calls to the per-material batches.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *


def out(name):
    return os.path.join(os.path.dirname(out_path()), name + '.glb')


def b(name, size, loc, material, bevel=0.006, rot=(0, 0, 0)):
    return box(name, size, loc, material, bevel, segments=1, rot=rot)


# A beige phone: sloped keypad base, handset in its cradle, one row of darker keys.
reset()
parts = [
    b('base', (0.19, 0.2, 0.045), (0, 0, 0.0225), 'wall_warm', 0.01),
    b('keypad', (0.11, 0.1, 0.02), (0.025, -0.045, 0.05), 'wall_cream', 0.004, rot=(-0.28, 0, 0)),
    b('keys', (0.08, 0.07, 0.006), (0.025, -0.047, 0.062), 'wall_trim', 0.002, rot=(-0.28, 0, 0)),
    b('cradle', (0.05, 0.19, 0.03), (-0.065, 0.005, 0.058), 'wall_trim', 0.006),
    b('handset', (0.05, 0.21, 0.028), (-0.065, 0.005, 0.085), 'wall_warm', 0.01),
    b('earcup', (0.056, 0.05, 0.03), (-0.065, 0.085, 0.078), 'wall_warm', 0.01),
    b('mouthcup', (0.056, 0.05, 0.03), (-0.065, -0.075, 0.078), 'wall_warm', 0.01),
]
finish(parts, 'era_desk_phone', budget=400, path=out('era_desk_phone'))

# A narrow-carriage dot-matrix: beige body, smoked lid, platen knob, and fan-fold paper feeding up
# out of the back with its tractor strips.
reset()
parts = [
    b('body', (0.32, 0.2, 0.075), (0, 0, 0.0375), 'wall_warm', 0.012),
    b('lid', (0.26, 0.09, 0.012), (0, 0.02, 0.08), 'plastic_charcoal', 0.004),
    b('panel', (0.07, 0.03, 0.008), (0.1, -0.075, 0.078), 'wall_trim', 0.003),
    cyl('knob', 0.022, 0.025, (0.172, 0.03, 0.05), 'plastic_charcoal', verts=8, bevel=0, rot=(0, math.pi / 2, 0)),
    b('paper_out', (0.22, 0.004, 0.13), (0, 0.075, 0.13), 'wall_cream', 0.001, rot=(-0.35, 0, 0)),
    b('stack', (0.24, 0.07, 0.03), (0, 0.13, 0.015), 'wall_cream', 0.003),
]
for x in (-0.103, 0.103):
    parts.append(b(f'tractor_{x}', (0.012, 0.004, 0.13), (x, 0.069, 0.132), 'wall_cream', 0.001, rot=(-0.35, 0, 0)))
finish(parts, 'era_dot_matrix', budget=500, path=out('era_dot_matrix'))

# A thermal-roll fax: handset along the left, a sloped keypad and display, the day's curling sheet
# in the tray at the back.
reset()
parts = [
    b('body', (0.27, 0.24, 0.07), (0, 0, 0.035), 'wall_warm', 0.012),
    b('deck', (0.17, 0.12, 0.02), (0.04, -0.045, 0.075), 'wall_cream', 0.005, rot=(-0.2, 0, 0)),
    b('display', (0.08, 0.025, 0.006), (0.04, -0.01, 0.089), 'plastic_charcoal', 0.002, rot=(-0.2, 0, 0)),
    b('keys', (0.12, 0.05, 0.006), (0.04, -0.065, 0.082), 'wall_trim', 0.002, rot=(-0.2, 0, 0)),
    b('handset', (0.045, 0.2, 0.03), (-0.1, 0, 0.085), 'wall_warm', 0.01),
    b('tray', (0.2, 0.012, 0.09), (0.03, 0.105, 0.1), 'wall_trim', 0.004, rot=(-0.5, 0, 0)),
    b('sheet', (0.16, 0.004, 0.12), (0.03, 0.095, 0.13), 'wall_cream', 0.001, rot=(-0.5, 0, 0)),
]
finish(parts, 'era_fax', budget=400, path=out('era_fax'))

# A Rolodex: a dark base, two knobs and a fan of cards.
reset()
parts = [b('base', (0.13, 0.1, 0.03), (0, 0, 0.015), 'plastic_charcoal', 0.006)]
for sx in (-1, 1):
    parts.append(cyl(f'knob_{sx}', 0.016, 0.012, (sx * 0.071, 0, 0.055), 'plastic_charcoal', verts=8, bevel=0, rot=(0, math.pi / 2, 0)))
for i, a in enumerate((-0.55, -0.18, 0.18, 0.55)):
    parts.append(b(f'card_{i}', (0.11, 0.004, 0.07), (0, 0, 0.065), 'wall_cream', 0.001, rot=(a, 0, 0)))
finish(parts, 'era_rolodex', budget=300, path=out('era_rolodex'))

# A cork board with pinned memos and a month's wall calendar, hung like the other era frames.
reset()
W, H = 1.0, 0.7
parts = [
    box('frame', (W, 0.05, H), (0, 0, H / 2), 'wood_dark', 0.02, segments=1),
    box('cork', (W - 0.08, 0.02, H - 0.08), (0, -0.03, H / 2), 'wood_honey', 0.004, segments=1),
]
face = -0.045
# The calendar: a red header over a five-week grid.
cx, cw, ch = 0.25, 0.3, 0.44
parts += [b('cal', (cw, 0.006, ch), (cx, face, 0.33), 'paper_sheet', 0.002),
          b('cal_head', (cw - 0.01, 0.007, 0.066), (cx, face - 0.002, 0.33 + ch / 2 - 0.038), 'fabric_terracotta', 0.002)]
for i in range(1, 5):
    parts.append(b(f'cal_row_{i}', (cw - 0.03, 0.004, 0.006), (cx, face - 0.004, 0.14 + i * 0.058), 'ink', 0.0))
for i in range(1, 6):
    parts.append(b(f'cal_col_{i}', (0.006, 0.004, 0.29), (cx - cw / 2 + 0.015 + i * 0.045, face - 0.004, 0.28), 'ink', 0.0))
parts.append(b('cal_circle', (0.04, 0.005, 0.04), (cx + 0.06, face - 0.009, 0.26), 'fabric_terracotta', 0.003))
# Memos and a business card, each with a pin.
for i, (x, z, w, h, a, pin) in enumerate([(-0.32, 0.47, 0.2, 0.16, 0.08, 'fabric_teal'), (-0.1, 0.5, 0.14, 0.14, -0.1, 'fabric_slate'),
                                             (-0.28, 0.2, 0.22, 0.14, -0.05, 'fabric_terracotta'), (-0.05, 0.24, 0.12, 0.08, 0.12, 'fabric_teal')]):
    parts.append(b(f'memo_{i}', (w, 0.004, h), (x, face, z), 'paper_sheet' if i != 1 else 'fabric_mustard', 0.001, rot=(0, a, 0)))
    parts.append(cyl(f'pin_{i}', 0.012, 0.016, (x, face - 0.01, z + h / 2 - 0.025), pin, verts=6, bevel=0, rot=(math.pi / 2, 0, 0)))
for i in range(3):
    parts.append(b(f'memo_line_{i}', (0.13, 0.004, 0.008), (-0.28, face - 0.003, 0.22 - i * 0.03), 'ink', 0.0, rot=(0, -0.05, 0)))
finish(parts, 'era_corkboard', budget=900, path=out('era_corkboard'))
