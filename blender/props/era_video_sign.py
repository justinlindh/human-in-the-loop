"""Rewind Room: an original video rental storefront fascia and shallow awning."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = frame('fascia', 2.0, 0.85, 0.13)
parts += [lettering('name', 'REWIND ROOM', (0, -0.1, 0.57), 0.21, 'wood_dark'),
          lettering('rental', 'VIDEO RENTAL', (0, -0.1, 0.29), 0.14),
          box('awning', (2.15, 0.48, 0.12), (0, -0.18, 0.07), 'fabric_teal', 0.035),
          box('awning_trim', (2.08, 0.045, 0.07), (0, -0.42, 0.045), 'wall_cream', 0.015)]
finish(parts, 'era_video_sign')
