"""A floppy trial offer, a failed sock-cat courier, social beta and slim LED display."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
from parcel_paws import sock_cat

for name, kind in [('era_pager_billboard', 'painted'), ('era_lease_billboard', 'box'), ('era_beta_billboard', 'box'), ('era_led_billboard', 'led')]:
    reset()
    parts, y = billboard(kind)
    if name == 'era_pager_billboard':
        parts += [box('floppy', (0.98, 0.09, 1.10), (-0.98, y - 0.04, 2.05), 'fabric_teal', 0.04),
                  box('shutter', (0.57, 0.014, 0.37), (-0.98, y - 0.094, 2.40), 'metal_soft', 0.012),
                  box('shutter_slot', (0.12, 0.008, 0.25), (-0.86, y - 0.106, 2.40), 'ink', 0.006),
                  box('disk_label', (0.75, 0.014, 0.45), (-0.98, y - 0.094, 1.86), 'wall_cream', 0.016),
                  lettering('disk_hours', '50', (-0.98, y - 0.11, 1.86), 0.38, 'fabric_teal'),
                  lettering('brand', 'OnlineLand:', (0.51, y, 2.25), 0.27, 'fabric_teal'),
                  lettering('offer', '50 FREE', (0.51, y, 1.99), 0.40),
                  lettering('hours', 'HOURS', (0.51, y, 1.57), 0.40)]
    elif name == 'era_lease_billboard':
        parts += sock_cat(crossed_eyes=True, face_offset=y + 0.14)
        parts += [lettering('for', 'FOR', (0.57, y, 2.38), 0.48),
                  lettering('lease', 'LEASE', (0.57, y, 1.91), 0.48),
                  box('rule', (1.62, 0.012, 0.06), (0.57, y, 1.56), 'fabric_mustard', 0.015)]
    elif name == 'era_beta_billboard':
        parts += [box('speech_bubble', (2.95, 0.055, 0.87), (0, y, 2.27), 'fabric_teal', 0.15, segments=3),
                  box('bubble_tail', (0.25, 0.045, 0.27), (-0.97, y + 0.01, 1.88), 'fabric_teal', 0.04),
                  box('gloss', (2.36, 0.012, 0.055), (0, y - 0.034, 2.60), 'wall_sage', 0.018),
                  lettering('brand', 'Shoutbook', (0, y - 0.04, 2.25), 0.48, 'paper_sheet'),
                  lettering('beta', '(beta)', (0.2, y, 1.57), 0.36)]
    finish(parts, name, path=os.path.join(os.path.dirname(out_path()), name + '.glb'))
