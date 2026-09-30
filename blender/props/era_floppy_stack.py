"""Three oversized diskettes with a shutter and a handwritten label strip."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = []
for i in range(3):
    x = (i - 1) * 0.014
    z = 0.014 + i * 0.026
    parts.append(box(f'disk_{i}', (0.19, 0.20, 0.026), (x, 0, z), 'fabric_slate' if i == 1 else 'plastic_charcoal', 0.007, segments=1))
parts += [box('shutter', (0.10, 0.058, 0.006), (0.014, 0.067, 0.082), 'metal_soft', 0.003, segments=1),
          box('label', (0.135, 0.083, 0.004), (0.014, -0.036, 0.082), 'paper_sheet', 0.005, segments=1),
          box('label_rule', (0.08, 0.006, 0.003), (0.006, -0.025, 0.086), 'wood_dark', 0.001, segments=1)]
finish(parts, 'era_floppy_stack', budget=600)
