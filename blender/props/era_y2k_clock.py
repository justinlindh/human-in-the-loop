"""Beige countdown clock with a dark inset and chunky luminous digits."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = [box('housing', (0.78, 0.12, 0.36), (0, 0, 0.18), 'wall_warm', 0.035),
         box('display', (0.67, 0.025, 0.19), (0, -0.07, 0.20), 'plastic_charcoal', 0.020),
         lettering('digits', '23:59', (0, -0.087, 0.21), 0.175, 'screen_amber'),
         lettering('label', 'Y2K', (0, -0.068, 0.062), 0.064)]
finish(parts, 'era_y2k_clock')
