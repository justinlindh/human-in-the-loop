"""Low freestanding modular divider with felt panels and rounded beige trim."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
parts = [
    box('partition_frame', (0.96, 0.055, 0.747), (0, 0, 0.4435), 'wall_trim', 0.012),
    box('partition_cap', (0.96, 0.063, 0.033), (0, 0, 0.8235), 'wall_cream', 0.012),
]
for side in (-1, 1):
    parts += [
        box(f'felt_{side}', (0.886, 0.012, 0.655), (0, side * 0.029, 0.45), 'carpet_classic', 0.008),
        box(f'felt_band_{side}', (0.886, 0.013, 0.055), (0, side * 0.044, 0.744), 'fabric_sage', 0.004),
        box(f'post_{side}', (0.037, 0.052, 0.79), (side * 0.451, 0, 0.395), 'wall_trim', 0.008),
        box(f'foot_{side}', (0.085, 0.12, 0.024), (side * 0.401, 0, 0.012), 'metal_dark', 0.008),
    ]
join(parts, 'era_cubicle')
export()
