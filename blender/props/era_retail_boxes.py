"""Original boxed software with a paper sleeve and one shrink-wrap glint."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = []
for i, (x, h, color) in enumerate(((-0.085, 0.28, 'fabric_teal'), (0.085, 0.24, 'fabric_mustard'))):
    parts += [box(f'carton_{i}', (0.15, 0.09, h), (x, 0, h / 2), 'wall_warm', 0.008, segments=1),
              box(f'sleeve_{i}', (0.135, 0.008, h * 0.60), (x, -0.05, h * 0.54), color, 0.004, segments=1),
              box(f'wrap_glint_{i}', (0.012, 0.004, h * 0.7), (x - 0.052, -0.056, h * 0.55), 'paper_sheet', 0.002, segments=1),
              lettering(f'title_{i}', 'DESK' if i == 0 else 'TOOLS', (x, -0.057, h * 0.59), 0.037),
              lettering(f'edition_{i}', '01' if i == 0 else '02', (x, -0.057, h * 0.39), 0.038)]
finish(parts, 'era_retail_boxes', budget=1300)
