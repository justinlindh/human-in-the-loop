"""Office shop: whiteboard_wall. l1 small mobile board, l2 wide wall board with sticky notes, l3 wall-sized writable wall with a kanban grid."""
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


def wall_board(W, H, Z, y, density, seed):
    parts = [
        box('board', (W, 0.04, H), (0, y, Z), 'whiteboard', bevel=0.01),
        box('frame_t', (W + 0.04, 0.05, 0.035), (0, y, Z + H / 2), 'metal_soft', bevel=0.012),
        box('frame_b', (W + 0.04, 0.05, 0.035), (0, y, Z - H / 2), 'metal_soft', bevel=0.012),
        box('frame_l', (0.035, 0.05, H), (-W / 2, y, Z), 'metal_soft', bevel=0.012),
        box('frame_r', (0.035, 0.05, H), (W / 2, y, Z), 'metal_soft', bevel=0.012),
        box('wtray', (W * 0.5, 0.08, 0.02), (0, y - 0.05, Z - H / 2 - 0.01), 'metal_soft', bevel=0.006),
    ]
    parts += kit.whiteboard_face('f_', W, H, Z, y - 0.021, seed=seed, density=density)
    return parts


def l1():
    return kit.mobile_whiteboard('w_', 0, 0.15, W=1.0, H=0.7, Z=0.95, seed=3)


def l2():
    parts = wall_board(2.0, 1.0, 1.25, 0.45, 1.6, seed=5)
    notes = ['rug_mustard', 'fabric_sage', 'role_designer', 'screen_amber']
    for i in range(10):
        parts.append(box(f'sn{i}', (0.1, 0.006, 0.1), (-0.85 + (i % 5) * 0.13, 0.425, 0.95 + (i // 5) * 0.13), notes[i % 4], bevel=0))
    return parts


def l3():
    W, H = 2.6, 1.75
    parts = [box('wallpanel', (W + 0.1, 0.06, H + 0.1), (0, 0.47, 0.15 + H / 2), 'whiteboard', bevel=0.015),
             box('ledge', (W, 0.1, 0.03), (0, 0.4, 0.2), 'metal_soft', bevel=0.008)]
    parts += kit.whiteboard_face('l_', W * 0.55, H * 0.8, 0.15 + H / 2 + 0.05, 0.438, seed=9, density=1.4)
    for p in parts[2:]:
        p.location.x -= W * 0.2
    # Kanban grid on the right: three columns of sticky notes under headers
    notes = ['rug_mustard', 'fabric_sage', 'role_designer', 'screen_amber', 'fabric_mustard']
    for c in range(3):
        cx = 0.45 + c * 0.3
        parts.append(box(f'kh{c}', (0.24, 0.004, 0.012), (cx, 0.438, 1.7), 'marker_blue', bevel=0))
        parts.append(box(f'kl{c}', (0.008, 0.004, 1.2), (cx + 0.15, 0.438, 1.05), 'marker_blue', bevel=0))
        for r in range(5 - c):
            parts.append(box(f'kn{c}{r}', (0.11, 0.006, 0.11), (cx, 0.435, 1.55 - r * 0.15), notes[(c + r) % 5], bevel=0))
    for i, col in enumerate(['marker_blue', 'marker_green', 'marker_orange', 'role_designer']):
        parts.append(cyl(f'mk{i}', 0.012, 0.13, (-0.3 + i * 0.08, 0.41 - i * 0.025, 0.225), col, verts=8, bevel=0, rot=(0, math.pi / 2, 0)))
    return parts


reset(); join(l1(), 'whiteboard_wall_l1'); export(tier_path(1), budget=BUDGET[1])
reset(); join(l2(), 'whiteboard_wall_l2'); export(tier_path(2), budget=BUDGET[2])
reset(); join(l3(), 'whiteboard_wall_l3'); export(tier_path(3), budget=BUDGET[3])
