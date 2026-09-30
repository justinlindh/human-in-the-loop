"""Painted pager advertisement, backlit lease and beta signs, and a slim LED display."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *

for name, kind in [('era_pager_billboard', 'painted'), ('era_lease_billboard', 'box'), ('era_beta_billboard', 'box'), ('era_led_billboard', 'led')]:
    reset()
    parts, y = billboard(kind)
    if name == 'era_pager_billboard':
        parts += [box('pager', (0.68, 0.12, 0.82), (-0.92, y - 0.045, 2.05), 'fabric_slate', 0.10),
                  box('pager_display', (0.50, 0.015, 0.25), (-0.92, y - 0.112, 2.18), 'wall_sage', 0.025),
                  lettering('pager_digits', 'HELLO', (-0.92, y - 0.123, 2.18), 0.12),
                  lettering('title', 'POCKET', (0.47, y, 2.43), 0.34, 'fabric_teal'),
                  lettering('title_bottom', 'PAGE', (0.47, y, 2.05), 0.34, 'fabric_teal'),
                  lettering('tagline', 'ALWAYS IN REACH', (0.40, y, 1.68), 0.155)]
    elif name == 'era_lease_billboard':
        parts += [lettering('title', 'FOR LEASE', (0, y, 2.30), 0.40),
                  lettering('tagline', 'YOUR NEXT BIG THING', (0, y, 1.83), 0.18),
                  box('rule', (2.5, 0.012, 0.06), (0, y, 1.56), 'fabric_mustard', 0.015)]
    elif name == 'era_beta_billboard':
        parts += [box('lozenge', (2.50, 0.055, 0.91), (0, y, 2.22), 'fabric_teal', 0.19, segments=3),
                  box('gloss', (1.85, 0.012, 0.10), (0, y - 0.034, 2.53), 'wall_sage', 0.045),
                  lettering('beta', 'beta', (0, y - 0.04, 2.20), 0.62, 'paper_sheet'),
                  lettering('tagline', 'FOREVER IN PROGRESS', (0, y, 1.56), 0.19)]
    finish(parts, name, path=os.path.join(os.path.dirname(out_path()), name + '.glb'))
