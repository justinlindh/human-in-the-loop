"""Office pets in the chibi style, as separate part objects with their pivot at the origin so
the game animates them with plain transforms. Front faces -Y, 1 unit = 1 meter.

  dog_body (hip pivot, body along -Y), dog_head (neck pivot), dog_ear (ear root), dog_tail (tail root),
  dog_leg (hip pivot, paw at the bottom), dog_eyes, dog_nose, dog_collar
  cat_body, cat_head, cat_ear, cat_tail, cat_leg, cat_eyes, cat_nose

Coat colours use placeholder material pal_coat (and pal_coat2 for patches) that the game swaps
per pet, so one model covers several looks.
"""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import bpy

reset()


def pmat(name, hexv):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    rgb = [((int(hexv[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5)]
    m.diffuse_color = (*rgb, 1)
    return m


COAT = pmat('pal_coat', '#c68b4e')
COAT2 = pmat('pal_coat2', '#f2ece1')


def coat(o, second=False):
    o.data.materials.clear()
    o.data.materials.append(COAT2 if second else COAT)
    return o


def blob(name, r, loc, scale, second=False):
    o = uvsphere(name, r, loc, None, seg=16, rings=10, scale=scale)
    return coat(o, second)


# Dog: chunky loaf body, big head, floppy ears. Hip height about 0.2 m.
coat(blob('dog_body', 0.13, (0, -0.1, 0.04), (1.0, 1.55, 0.95))).name = 'dog_body'
db = bpy.data.objects['dog_body']
patch = blob('dog_chest', 0.085, (0, -0.25, 0.02), (0.95, 0.7, 1.0), second=True)
join([db, patch], 'dog_body')
h = blob('dog_head', 0.13, (0, -0.04, 0.09), (1.0, 1.0, 0.95))
snout = blob('dog_snout', 0.065, (0, -0.15, 0.05), (1.0, 1.0, 0.8), second=True)
join([h, snout], 'dog_head')
ear = blob('dog_ear', 0.055, (0, 0, -0.05), (0.55, 0.35, 1.25))
join([ear], 'dog_ear')
tail = cyl('dog_tail', 0.025, 0.14, (0, 0, 0.07), None, verts=10, bevel=0.01, r2=0.012)
coat(tail)
join([tail], 'dog_tail')
leg = cyl('dog_leg', 0.035, 0.16, (0, 0, -0.08), None, verts=10, bevel=0.012)
coat(leg)
paw = blob('dog_paw', 0.042, (0, -0.012, -0.16), (1.0, 1.25, 0.6), second=True)
join([leg, paw], 'dog_leg')
eyes = [uvsphere(f'de{sx}', 0.02, (sx * 0.05, -0.11, 0.13), 'ink', seg=10, rings=6) for sx in (-1, 1)]
join(eyes, 'dog_eyes')
join([uvsphere('dnose', 0.024, (0, -0.21, 0.07), 'ink', seg=10, rings=6)], 'dog_nose')
join([torus('dcol', 0.1, 0.018, (0, 0, 0), 'role_designer', major_seg=16, minor_seg=5, rot=(math.radians(70), 0, 0))], 'dog_collar')

# Cat: smaller, round, pointy ears, long tail.
cb = blob('cat_body', 0.1, (0, -0.07, 0.035), (0.95, 1.5, 0.9))
cpatch = blob('cat_belly', 0.07, (0, -0.16, 0.0), (0.9, 0.8, 0.8), second=True)
join([cb, cpatch], 'cat_body')
chd = blob('cat_head', 0.11, (0, -0.03, 0.08), (1.1, 0.95, 0.95))
cmz = blob('cat_muzzle', 0.045, (0, -0.12, 0.05), (1.2, 0.8, 0.75), second=True)
join([chd, cmz], 'cat_head')
cear = cyl('cat_ear', 0.04, 0.07, (0, 0, 0.035), None, verts=4, bevel=0.006, r2=0.004)
coat(cear)
join([cear], 'cat_ear')
ctail = cyl('cat_tail', 0.02, 0.24, (0, 0, 0.12), None, verts=10, bevel=0.008, r2=0.016)
coat(ctail)
join([ctail], 'cat_tail')
cleg = cyl('cat_leg', 0.028, 0.12, (0, 0, -0.06), None, verts=10, bevel=0.01)
coat(cleg)
cpaw = blob('cat_paw', 0.033, (0, -0.008, -0.12), (1.0, 1.2, 0.6), second=True)
join([cleg, cpaw], 'cat_leg')
ceyes = [uvsphere(f'ce{sx}', 0.018, (sx * 0.045, -0.1, 0.1), 'leaf_light', seg=10, rings=6) for sx in (-1, 1)]
join(ceyes, 'cat_eyes')
join([uvsphere('cnose', 0.014, (0, -0.15, 0.07), 'fabric_terracotta', seg=8, rings=5)], 'cat_nose')

require_parts(['dog_body', 'dog_head', 'dog_ear', 'dog_tail', 'dog_leg', 'dog_eyes', 'dog_nose', 'dog_collar',
               'cat_body', 'cat_head', 'cat_ear', 'cat_tail', 'cat_leg', 'cat_eyes', 'cat_nose'])
export(budget=6000)
