"""Beige CRT workstation, with the office's seated keyboard and screen anchors."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
# The rear clearance accepts a partition without changing the chair approach.
parts = kit.desk('crt_desk_', W=0.96, D=0.50, H=0.57, y=0.25)
parts += [
    box('crt_foot', (0.25, 0.22, 0.026), (-0.07, 0.44, 0.583), 'wall_trim', 0.012),
    box('crt_swivel', (0.12, 0.12, 0.04), (-0.07, 0.44, 0.613), 'wall_warm', 0.012),
    prism('crt_taper', [(0.35, 0.65), (0.50, 0.69), (0.51, 0.91), (0.35, 1.015)],
          0.36, (-0.07, 0, 0), 'wall_warm', 0.023),
    box('crt_bezel', (0.43, 0.07, 0.37), (-0.07, 0.325, 0.825), 'wall_cream', 0.024),
    box('crt_glass_recess', (0.357, 0.01, 0.273), (-0.07, 0.285, 0.849), 'plastic_charcoal', 0.014),
    box('crt_power', (0.027, 0.008, 0.014), (0.095, 0.284, 0.68), 'wall_trim', 0.004),
    box('crt_power_led', (0.012, 0.007, 0.008), (0.052, 0.284, 0.68), 'leaf', 0.002),
    box('tower_case', (0.19, 0.24, 0.36), (0.335, 0.385, 0.75), 'wall_warm', 0.017),
    box('tower_face', (0.174, 0.025, 0.337), (0.335, 0.252, 0.75), 'wall_cream', 0.01),
    box('tower_cd', (0.133, 0.009, 0.034), (0.335, 0.235, 0.859), 'wall_trim', 0.003),
    box('tower_floppy', (0.098, 0.008, 0.01), (0.32, 0.234, 0.805), 'plastic_charcoal', 0.002),
    box('tower_power', (0.025, 0.01, 0.025), (0.381, 0.234, 0.683), 'fabric_sage', 0.005),
    box('keyboard_base', (0.36, 0.13, 0.018), (0, 0.09, 0.579), 'wall_trim', 0.006),
    box('keyboard_keys', (0.325, 0.088, 0.006), (0, 0.10, 0.593), 'wall_cream', 0.003),
    box('keyboard_space', (0.13, 0.017, 0.007), (-0.025, 0.053, 0.592), 'wall_cream', 0.003),
    box('mouse', (0.055, 0.085, 0.025), (0.27, 0.08, 0.5825), 'wall_cream', 0.018),
]
for i in range(3):
    parts.append(box(f'crt_vent_{i}', (0.008, 0.07, 0.012), (0.115, 0.425, 0.79 + i * 0.033),
                     'baseboard', 0.002, segments=1))
    parts.append(box(f'tower_vent_{i}', (0.09, 0.007, 0.008), (0.317, 0.234, 0.642 + i * 0.017),
                     'baseboard', 0.002, segments=1))
# Keep the tower inside the frame and leave a clear desktop for staged paper props.
for part in parts:
    if part.name.startswith('tower_'):
        part.location.x = 0.26 + (part.location.x - 0.335) * 0.84
        part.location.y -= 0.04
        part.location.z = 0.23 + (part.location.z - 0.75) * 1.17
        part.scale.x *= 0.84
        part.scale.z *= 1.17
    if part.name.startswith('crt_') and not part.name.startswith('crt_desk_'):
        part.location.x -= 0.03
    # One bevel segment reads the same at the game camera; only the desktop and screen bezel keep
    # their rounded silhouettes, since every desk in an office repeats this model.
    bevel = part.modifiers.get('bevel')
    if bevel and part.name == 'crt_desk_top':
        bevel.segments = 2
    elif bevel and part.name != 'crt_bezel':
        bevel.segments = 1
for y in (0.27, 0.42):
    parts.append(box(f'tower_foot_{y}', (0.14, 0.05, 0.02), (0.26, y, 0.01), 'plastic_charcoal', 0.004, segments=1))
join(parts, 'era_crt_desk')
plane('crt_screen', 0.327, 0.243, (-0.1, 0.278, 0.849), 'screen')
require_parts(['crt_screen'])
export()
