'''Desk balloons for an incentive winner: three balloons on curly strings tied to a small weight.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
parts = [cyl('weight', 0.035, 0.04, (0, 0, 0.02), 'gold', verts=12, bevel=0.008)]
for i, (x, y, h, c) in enumerate([(-0.07, 0.02, 0.58, 'role_designer'), (0.06, -0.03, 0.66, 'fabric_mustard'), (0.0, 0.07, 0.5, 'fabric_teal')]):
    b = uvsphere(f'b{i}', 0.085, (x, y, h), c, seg=14, rings=10, scale=(1, 1, 1.18))
    knot = cyl(f'k{i}', 0.012, 0.02, (x, y, h - 0.1), c, verts=8, bevel=0, r2=0.004)
    # A gently curved string from the weight to the knot, as a few short segments.
    segs = []
    n = 6
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        p0 = (x * t0 + math.sin(t0 * 6 + i) * 0.012, y * t0, 0.04 + (h - 0.14) * t0)
        p1 = (x * t1 + math.sin(t1 * 6 + i) * 0.012, y * t1, 0.04 + (h - 0.14) * t1)
        mx, my, mz = [(a + b_) / 2 for a, b_ in zip(p0, p1)]
        dx, dy, dz = [b_ - a for a, b_ in zip(p0, p1)]
        L = math.sqrt(dx * dx + dy * dy + dz * dz)
        rx = -math.atan2(dy, dz)
        ry = math.atan2(dx, math.sqrt(dy * dy + dz * dz))
        segs.append(cyl(f's{i}{k}', 0.003, L + 0.004, (mx, my, mz), 'paper', verts=5, bevel=0, rot=(rx, ry, 0)))
    parts += [b, knot] + segs
join(parts, 'balloons')
export()
