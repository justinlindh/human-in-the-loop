'''Ping pong table sized for chibi players: 1.8 x 1.0 top at 0.6 m, net across the middle, two paddles.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
L, W, H = 1.8, 1.0, 0.6
parts = [
    box('top', (L, W, 0.04), (0, 0, H - 0.02), 'fabric_teal', bevel=0.006, segments=1),
    box('edge', (L + 0.02, W + 0.02, 0.025), (0, 0, H - 0.05), 'plastic_charcoal', bevel=0.008),
    # Lines sit clear of the top (no shared depth with it) and stop short of the net.
    box('line_mid_a', (L / 2 - 0.06, 0.014, 0.002), (-L / 4 - 0.01, 0, H + 0.004), 'paper', bevel=0),
    box('line_mid_b', (L / 2 - 0.06, 0.014, 0.002), (L / 4 + 0.01, 0, H + 0.004), 'paper', bevel=0),
    box('line_a', (0.014, W - 0.04, 0.002), (-L / 2 + 0.03, 0, H + 0.004), 'paper', bevel=0),
    box('line_b', (0.014, W - 0.04, 0.002), (L / 2 - 0.03, 0, H + 0.004), 'paper', bevel=0),
    box('net', (0.012, W + 0.1, 0.1), (0, 0, H + 0.05), 'paper_sheet', bevel=0.004),
    box('net_top', (0.02, W + 0.1, 0.012), (0, 0, H + 0.1), 'paper', bevel=0.004),
]
for sy in (-1, 1):
    parts.append(cyl(f'post{sy}', 0.015, 0.14, (0, sy * (W / 2 + 0.05), H + 0.04), 'metal_dark', verts=8, bevel=0))
# Two trestle frames with a stretcher, so the table reads as a folding table from any side.
for sx in (-1, 1):
    x = sx * (L / 2 - 0.3)
    for sy in (-1, 1):
        parts.append(box(f'leg{sx}{sy}', (0.05, 0.05, H - 0.07), (x, sy * (W / 2 - 0.12), (H - 0.07) / 2), 'metal_dark', bevel=0.01))
    parts.append(box(f'foot{sx}', (0.07, W - 0.16, 0.04), (x, 0, 0.02), 'metal_dark', bevel=0.01))
parts.append(box('stretcher', (L - 0.6, 0.04, 0.04), (0, 0, 0.3), 'metal_dark', bevel=0.01))
# Paddles resting on either end.
for sx, col in ((-1, 'fabric_terracotta'), (1, 'plastic_charcoal')):
    parts.append(cyl(f'pad{sx}', 0.075, 0.012, (sx * (L / 2 - 0.2), sx * 0.2, H + 0.008), col, verts=16, bevel=0.003))
    parts.append(box(f'grip{sx}', (0.1, 0.028, 0.02), (sx * (L / 2 - 0.2) + sx * 0.11, sx * 0.2, H + 0.012), 'wood_honey', bevel=0.006, segments=1))
join(parts, 'ping_pong_table')
export()
