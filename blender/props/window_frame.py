'''Wall window: frame and cross mullions. window_glass (pal_window) is separate for day/night.
Origin at the bottom center of the frame; faces -Y; the frame stands 1 cm proud of a 0.2 m wall on
each side. The sill is built by the game (office.js), so it can go where tall furniture stands.'''
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *

reset()
W, H, D, F = 1.6, 1.3, 0.22, 0.07
parts = [
    box('top', (W, D, F), (0, 0, H - F / 2), 'plastic_white', bevel=0.015),
    box('bottom', (W, D, F), (0, 0, F / 2), 'plastic_white', bevel=0.015),
    box('left', (F, D, H), (-W / 2 + F / 2, 0, H / 2), 'plastic_white', bevel=0.015),
    box('right', (F, D, H), (W / 2 - F / 2, 0, H / 2), 'plastic_white', bevel=0.015),
    box('mull_v', (0.04, 0.06, H - 2 * F), (0, 0, H / 2), 'plastic_white', bevel=0.01),
    box('mull_h', (W - 2 * F, 0.06, 0.04), (0, 0, H * 0.58), 'plastic_white', bevel=0.01),
]
join(parts, 'window_frame')
plane('window_glass', W - 2 * F + 0.01, H - 2 * F + 0.01, (0, 0.012, H / 2), 'window')
export()
