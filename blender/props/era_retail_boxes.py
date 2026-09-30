"""Original 1990s boxed software: one big box face-out against the wall and a stack of three
lying flat. Each box is one colour all round (no lid or rim), with loud front art and a
shrink-wrap glint."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = []

# The face-out box, leaning back against the wall. Front art: a big sun, a diagonal stripe,
# a starburst sticker and a pale title band with blocky "type".
W, D, H, LEAN = 0.24, 0.07, 0.32, -0.12
bx, by = -0.10, 0.02


def lean(x, y, z):
    """A point on the leaning box's front, (x, z) across and up it, y out from its face."""
    c, s = math.cos(LEAN), math.sin(LEAN)
    return (bx + x, by + y * c - z * s, z * c + y * s)


parts.append(box('box_body', (W, D, H), lean(0, 0, H / 2), 'fabric_slate', 0.01, segments=1, rot=(LEAN, 0, 0)))
f = -D / 2 - 0.003
parts += [
    cyl('box_sun', 0.075, 0.006, lean(0.03, f, 0.215), 'fabric_mustard', verts=16, bevel=0, rot=(math.pi / 2 + LEAN, 0, 0)),
    box('box_stripe', (0.25, 0.004, 0.045), lean(0, f - 0.002, 0.15), 'fabric_terracotta', 0, rot=(LEAN, 0.55, 0)),
    box('box_title', (0.20, 0.004, 0.06), lean(0, f - 0.003, 0.055), 'paper_sheet', 0.004, segments=1, rot=(LEAN, 0, 0)),
    box('box_type_a', (0.14, 0.003, 0.018), lean(-0.015, f - 0.006, 0.065), 'ink', 0, rot=(LEAN, 0, 0)),
    box('box_type_b', (0.08, 0.003, 0.012), lean(-0.045, f - 0.006, 0.038), 'fabric_teal', 0, rot=(LEAN, 0, 0)),
    cyl('box_burst', 0.032, 0.004, lean(-0.075, f - 0.004, 0.27), 'paper_sheet', verts=8, bevel=0, rot=(math.pi / 2 + LEAN, 0, 0)),
    cyl('box_burst_dot', 0.017, 0.004, lean(-0.075, f - 0.007, 0.27), 'fabric_terracotta', verts=8, bevel=0, rot=(math.pi / 2 + LEAN, 0, 0)),
    box('box_glint', (0.012, 0.002, 0.24), lean(0.06, f - 0.009, 0.19), 'paper_sheet', 0, rot=(LEAN, -0.5, 0)),
]

# The stack: three flat boxes, slightly askew, each a different colour with a pale front spine
# band; the top one shows its cover art to the camera.
sx = 0.12
for i, (col, turn) in enumerate((('fabric_teal', 0.03), ('fabric_mustard', -0.05), ('fabric_terracotta', 0.06))):
    z = 0.03 + i * 0.06
    parts += [box(f'stack_{i}', (0.19, 0.25, 0.058), (sx, 0.02, z), col, 0.008, segments=1, rot=(0, 0, turn)),
              box(f'stack_spine_{i}', (0.13, 0.004, 0.02), (sx - math.sin(turn) * 0.125, 0.02 - 0.127, z), 'paper_sheet', 0, rot=(0, 0, turn))]
top = 0.03 + 2 * 0.06 + 0.029
parts += [
    cyl('stack_cover_disc', 0.055, 0.004, (sx + 0.01, 0.0, top + 0.002), 'fabric_mustard', verts=16, bevel=0),
    box('stack_cover_band', (0.17, 0.05, 0.004), (sx, -0.08, top + 0.002), 'paper_sheet', 0, rot=(0, 0, 0.06)),
    box('stack_glint', (0.012, 0.2, 0.002), (sx + 0.05, 0.02, top + 0.005), 'paper_sheet', 0, rot=(0, 0, 0.5)),
]
finish(parts, 'era_retail_boxes', budget=1300)
