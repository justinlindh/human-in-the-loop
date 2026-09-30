"""The Parcel Paws sock-cat mascot, with an optional failed-company expression."""
from common import *


def sock_cat(crossed_eyes=False, face_offset=0):
    parts = [
        box('sock_cuff', (0.46, 0.07, 0.17), (-0.92, -0.16, 1.40), 'fabric_teal', 0.035),
        uvsphere('sock_body', 1, (-0.92, -0.17, 1.76), 'fabric_sage', seg=12, rings=8, scale=(0.24, 0.07, 0.32)),
        uvsphere('sock_head', 1, (-0.92, -0.18, 2.18), 'fabric_sage', seg=14, rings=8, scale=(0.29, 0.075, 0.24)),
        uvsphere('muzzle', 1, (-0.92, -0.24, 2.10), 'paper_sheet', seg=12, rings=6, scale=(0.14, 0.03, 0.085)),
        uvsphere('nose', 1, (-0.92, -0.27, 2.14), 'blush', seg=8, rings=4, scale=(0.04, 0.02, 0.028)),
        box('parcel', (0.30, 0.06, 0.22), (-0.92, -0.25, 1.70), 'cardboard', 0.022),
        box('parcel_tape', (0.06, 0.012, 0.22), (-0.92, -0.285, 1.70), 'paper_sheet', 0.004, segments=1),
    ]
    for i, s in enumerate((-1, 1)):
        ear = prism(f'cat_ear_{i}', [(-0.08, 0), (0.02 * s, 0.17), (0.08, 0)], 0.05,
                    (-0.92 + 0.17 * s, -0.18, 2.34), 'fabric_sage', 0.01)
        ear.rotation_euler[2] = math.pi / 2
        parts.append(ear)
        if crossed_eyes:
            for j, angle in enumerate((-math.pi / 4, math.pi / 4)):
                stroke = box(f'cross_eye_{i}_{j}', (0.13, 0.016, 0.03),
                             (-0.92 + 0.105 * s, -0.268 - j * 0.018, 2.24), 'ink', 0.004, segments=1)
                stroke.rotation_euler[1] = angle
                parts.append(stroke)
        else:
            parts.append(uvsphere(f'button_eye_{i}', 1, (-0.92 + 0.095 * s, -0.245, 2.24), 'ink', seg=8, rings=5, scale=(0.035, 0.015, 0.042)))
            parts.append(uvsphere(f'eye_glint_{i}', 1, (-0.92 + 0.095 * s + 0.012, -0.262, 2.255), 'paper_sheet', seg=5, rings=3, scale=(0.011, 0.006, 0.011)))
        parts.append(uvsphere(f'paw_{i}', 1, (-0.92 + 0.16 * s, -0.27, 1.70), 'paper_sheet', seg=8, rings=5, scale=(0.055, 0.03, 0.05)))
    for i in range(3):
        parts.append(box(f'cuff_rib_{i}', (0.02, 0.012, 0.13), (-1.02 + i * 0.1, -0.2, 1.40), 'wall_cream', 0.004, segments=1))
    for part in parts:
        part.location.y += face_offset
    return parts
