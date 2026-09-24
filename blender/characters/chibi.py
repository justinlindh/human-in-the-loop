"""Chibi character part kit. Every part is its own object whose origin is its pivot, so the game
assembles and animates them with plain transforms:

  head (neck pivot at origin, head center at z = HEAD_C), eyes, eye_shine, mouth_smile, mouth_flat,
  mouth_frown, blush, hair_0..7, acc_glasses, acc_headphones, acc_beanie, acc_cap
  torso_0..2 (waist pivot), lanyard, badge
  role_engineer (hood), role_designer (scarf), role_marketer (blazer), role_support (headset),
  role_security (vest), role_sales (tie)
  arm (shoulder pivot), hand (wrist pivot), leg (hip pivot), shoe (ankle pivot), mug

Height is about 1.0 m and the head is about 45% of it. Front faces -Y.
Placeholder materials: pal_skin_1, pal_hair (hair_*), pal_shirt (torso, arm), pal_pants (leg),
pal_role (lanyard, role accents); the game swaps them per character.
"""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import bpy, bmesh

reset()

HEAD_R = 0.21
HEAD_C = 0.22          # head center above the neck pivot
HEAD_S = (1.06, 1.0, 0.96)
TORSO_H = 0.30
LEG_L = 0.25


def surf_y(x, dz, out=0.0):
    """Front (-Y) surface of the head ellipsoid at (x, head center + dz), pushed out by `out`."""
    k = 1 - (x / (HEAD_S[0] * HEAD_R)) ** 2 - (dz / (HEAD_S[2] * HEAD_R)) ** 2
    return -HEAD_R * HEAD_S[1] * math.sqrt(max(0.0, k)) - out


def pmat(name, hexv):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    rgb = [((int(hexv[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5)]
    m.diffuse_color = (*rgb, 1)
    return m


PLACEHOLDER = {'hair': pmat('pal_hair', '#4a3222'), 'shirt': pmat('pal_shirt', '#4f8cff'),
               'pants': pmat('pal_pants', '#2e3440'), 'role': pmat('pal_role', '#4f8cff')}


def use(o, key):
    o.data.materials.clear()
    o.data.materials.append(PLACEHOLDER[key])
    return o


def cut_below(o, front_z, back_z, side_z=None):
    """Delete vertices under a plane that runs from back_z (at +Y) to front_z (at -Y)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    r = HEAD_R * 1.2
    side_z = (front_z + back_z) / 2 if side_z is None else side_z
    kill = []
    for v in bm.verts:
        t = (v.co.y + r) / (2 * r)          # 0 at front, 1 at back
        limit = front_z + (back_z - front_z) * t
        side = abs(v.co.x) / r
        limit = limit * (1 - side * 0.5) + side_z * side * 0.5
        if v.co.z < limit:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    return o


def solidify(o, t=0.02):
    m = o.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = t
    m.offset = -1
    return o


def hair_cap(name, front_z=0.06, back_z=-0.1, r=HEAD_R + 0.018, side_z=None, scale=(1.04, 1.0, 1.0)):
    o = uvsphere(name, r, (0, 0, 0), None, seg=14, rings=9, scale=scale)
    cut_below(o, front_z, back_z, side_z)
    use(o, 'hair')
    return o


def lump(name, r, loc, scale, key='hair', subdiv=2):  # subdiv 1 for small or hidden-side lumps
    o = sphere(name, r, loc, None, subdiv=subdiv, scale=scale)
    use(o, key)
    return o


# Head and face: head geometry is centered at HEAD_C above the neck pivot.
head = uvsphere('head', HEAD_R, (0, 0, HEAD_C), 'skin_1', seg=18, rings=13, scale=HEAD_S)
neck = cyl('neck', 0.055, 0.06, (0, 0, 0.02), 'skin_1', verts=12, bevel=0)
head = join([head, neck], 'head')

face_y = surf_y(0, 0)
EX, EZ = 0.072, -0.01
eyes = []
for sx in (-1, 1):
    eyes.append(uvsphere(f'eye{sx}', 1.0, (sx * EX, surf_y(EX, EZ, -0.003), HEAD_C + EZ), 'eye', seg=10, rings=5, scale=(0.03, 0.009, 0.046)))
join(eyes, 'eyes')
shine = []
for sx in (-1, 1):
    shine.append(uvsphere(f'shine{sx}', 1.0, (sx * EX + 0.011, surf_y(EX, EZ + 0.016, 0.008), HEAD_C + EZ + 0.016), 'paper', seg=6, rings=4, scale=(0.012, 0.006, 0.014)))
join(shine, 'eye_shine')

MZ = -0.085
# Mouth arcs: half of a torus facing forward. Vertex tests are in the object's local space.
smile = torus('mouth_smile', 0.03, 0.0062, (0, surf_y(0, MZ, 0.004), HEAD_C + MZ + 0.012), 'eye', rot=(math.pi / 2, 0, 0), major_seg=16, minor_seg=5)
bm = bmesh.new(); bm.from_mesh(smile.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > -0.004], context='VERTS')
bm.to_mesh(smile.data); bm.free()
frown = torus('mouth_frown', 0.03, 0.0062, (0, surf_y(0, MZ, 0.004), HEAD_C + MZ - 0.024), 'eye', rot=(math.pi / 2, 0, 0), major_seg=16, minor_seg=5)
bm = bmesh.new(); bm.from_mesh(frown.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.004], context='VERTS')
bm.to_mesh(frown.data); bm.free()
box('mouth_flat', (0.046, 0.014, 0.012), (0, surf_y(0, MZ, 0.002), HEAD_C + MZ), 'eye', bevel=0.005, segments=1)
# Blush is a patch cut from a copy of the head surface, lifted 1.5 mm, so it lies flush like a decal.
bl = uvsphere('blush', HEAD_R + 0.0015, (0, 0, HEAD_C), 'blush', seg=84, rings=64, scale=HEAD_S)
bm = bmesh.new(); bm.from_mesh(bl.data)
BX, BZ, BW, BH = 0.12, -0.06, 0.036, 0.021
def inside(c):
    return c.y < 0 and min(((c.x - sx * BX) / BW) ** 2 for sx in (-1, 1)) + ((c.z - BZ) / BH) ** 2 < 1
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not inside(f.calc_center_median())], context='FACES')
bm.to_mesh(bl.data); bm.free()

# Hair: eight silhouettes, all centered on the head center (origin at the neck pivot).
def at_head(objs):
    for o in objs:
        o.location.z += HEAD_C
    return objs


h = at_head([hair_cap('h0cap', 0.1, -0.06), lump('h0fringe', 0.08, (0.04, -0.16, 0.13), (1.4, 0.6, 0.45))])
join(h, 'hair_0')                                                   # short crop
h = at_head([hair_cap('h1cap', 0.09, -0.16, side_z=-0.14, scale=(1.1, 1.05, 1.0)),
             lump('h1fringe', 0.1, (0, -0.16, 0.125), (1.6, 0.55, 0.4))])
join(h, 'hair_1')                                                   # bob
h = at_head([hair_cap('h2cap', 0.08, -0.12), lump('h2back', 0.19, (0, 0.11, -0.15), (1.15, 0.55, 1.35), subdiv=1),
             lump('h2fringe', 0.09, (-0.05, -0.16, 0.13), (1.5, 0.55, 0.4))])
join(h, 'hair_2')                                                   # long
h = at_head([hair_cap('h3cap', 0.09, -0.08), lump('h3tie', 0.05, (0, 0.24, 0.02), (1, 1, 1)),
             lump('h3tail', 0.09, (0, 0.3, -0.1), (0.8, 0.8, 1.6), subdiv=1)])
join(h, 'hair_3')                                                   # ponytail
spikes = [hair_cap('h4cap', 0.1, -0.05)]
for i, (x, y, z, rx, ry) in enumerate([(0, -0.08, 0.2, -0.5, 0), (0.1, 0, 0.19, -0.1, 0.5), (-0.1, 0, 0.19, -0.1, -0.5), (0.05, 0.1, 0.18, 0.5, 0.3), (-0.05, 0.1, 0.18, 0.5, -0.3), (0, 0.02, 0.23, 0, 0)]):
    c = cyl(f'h4s{i}', 0.07, 0.16, (x, y, z), None, verts=8, bevel=0, r2=0.0, rot=(rx, ry, 0))
    spikes.append(use(c, 'hair'))
join(at_head(spikes), 'hair_4')                                     # spiky
h = at_head([hair_cap('h5cap', 0.09, -0.1), lump('h5bun', 0.1, (0, 0.1, 0.22), (1, 1, 0.9), subdiv=1)])
join(h, 'hair_5')                                                   # bun
# Curly: a close cap covered in small curls. Curls sit on a shell around the head and stop above
# the brow in front, so there is no cut edge to show.
curls = [hair_cap('h6cap', 0.1, -0.08)]
k = 0
for ring, (elev, n) in enumerate([(80, 1), (48, 5), (18, 7)]):
    for i in range(n):
        az = math.radians(i * 360 / n + ring * 17)
        el = math.radians(elev)
        cr = HEAD_R + 0.035
        x, y, z = cr * math.cos(el) * math.sin(az) * 1.05, -cr * math.cos(el) * math.cos(az), cr * math.sin(el)
        if y < -0.1 and z < 0.12:
            continue
        c = uvsphere(f'h6c{k}', 0.085 if ring else 0.1, (x, y, z), None, seg=9, rings=6, scale=(1, 1, 0.9))
        curls.append(use(c, 'hair'))
        k += 1
join(at_head(curls), 'hair_6')                                     # curly
h = at_head([hair_cap('h7cap', 0.1, -0.08), lump('h7swoop', 0.12, (-0.07, -0.13, 0.14), (1.3, 0.7, 0.5))])
join(h, 'hair_7')                                                   # side swoop

# Accessories (head-centered)
g = []
for sx in (-1, 1):
    g.append(torus(f'gl{sx}', 0.044, 0.008, (sx * EX, surf_y(EX, EZ, 0.014), EZ), 'plastic_charcoal', rot=(math.pi / 2, 0, 0), major_seg=12, minor_seg=4))
    g.append(box(f'glarm{sx}', (0.008, 0.2, 0.01), (sx * 0.2, -0.1, 0.01), 'plastic_charcoal', bevel=0))
g.append(box('glbridge', (0.05, 0.008, 0.008), (0, face_y - 0.014, EZ + 0.01), 'plastic_charcoal', bevel=0))
join(at_head(g), 'acc_glasses')
hp = [torus('hpband', HEAD_R + 0.04, 0.018, (0, 0, 0), 'plastic_charcoal', rot=(math.pi / 2, 0, 0), major_seg=18, minor_seg=5)]
bm = bmesh.new(); bm.from_mesh(hp[0].data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.02], context='VERTS')
bm.to_mesh(hp[0].data); bm.free()
for sx in (-1, 1):
    hp.append(cyl(f'hpcup{sx}', 0.07, 0.05, (sx * (HEAD_R + 0.03), 0, -0.01), 'fabric_slate', verts=12, bevel=0.012, rot=(0, math.pi / 2, 0)))
join(at_head(hp), 'acc_headphones')
# Hats replace the hair (the game hides hair under them), so they cover the head down to the brow.
BN_R, BN_S, BN_Z = HEAD_R + 0.022, (1.07, 1.04, 1.1), 0.055
b = [hair_cap('bnhat', BN_Z, BN_Z, r=BN_R, scale=BN_S)]
cuff_r = math.sqrt(BN_R ** 2 - (BN_Z / BN_S[2]) ** 2)
cuff = torus('bnrim', cuff_r - 0.004, 0.024, (0, 0, BN_Z + 0.012), 'fabric_mustard', major_seg=16, minor_seg=5)
cuff.scale = (BN_S[0], BN_S[1], 1.0)
b.append(cuff)
b.append(uvsphere('bnpom', 0.05, (0, 0.02, BN_R * BN_S[2] + 0.025), 'paper', seg=8, rings=5))
b[0].data.materials.clear(); b[0].data.materials.append(mat('fabric_terracotta'))
join(at_head(b), 'acc_beanie')
CP_R, CP_S, CP_Z = HEAD_R + 0.02, (1.06, 1.05, 0.98), 0.085
cp = [hair_cap('cpdome', CP_Z, CP_Z - 0.03, r=CP_R, scale=CP_S)]
edge_y = -CP_R * CP_S[1] * math.cos(math.asin(min(0.99, CP_Z / (CP_R * CP_S[2]))))
# Worn backwards: from the high camera a forward brim hides the eyes.
cp.append(box('cpbrim', (0.22, 0.12, 0.02), (0, -edge_y + 0.04, CP_Z - 0.01), 'fabric_teal', bevel=0.01, rot=(math.radians(10), 0, 0)))
cp.append(box('cpstrap', (0.07, 0.01, 0.03), (0, -edge_y - 0.004, CP_Z + 0.03), 'plastic_charcoal', bevel=0.004, segments=1))
cp.append(uvsphere('cpbutton', 0.022, (0, 0, CP_R * CP_S[2] + 0.005), 'fabric_teal', seg=8, rings=5))
cp[0].data.materials.clear(); cp[0].data.materials.append(mat('fabric_teal'))
join(at_head(cp), 'acc_cap')

# Torso per build (waist pivot at origin), arms, legs
for i, (w, d) in enumerate([(0.26, 0.19), (0.3, 0.21), (0.36, 0.24)]):
    t = box(f'torso_{i}', (w, d, TORSO_H), (0, 0, TORSO_H / 2), None, bevel=0)
    soften(t, min(w, d) * 0.45, 3, hard=False)
    t.data.materials.append(PLACEHOLDER['shirt'])
lan = torus('lanyard_strap', 0.09, 0.008, (0, -0.02, TORSO_H - 0.04), None, rot=(math.radians(62), 0, 0), major_seg=20, minor_seg=4)
use(lan, 'role')
bm = bmesh.new(); bm.from_mesh(lan.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.03], context='VERTS')
bm.to_mesh(lan.data); bm.free()
lan.name = 'lanyard'
card = box('badge', (0.06, 0.012, 0.08), (0, -0.115, TORSO_H - 0.13), 'paper', bevel=0.006, segments=1)
arm = cyl('arm', 0.047, 0.2, (0, 0, -0.1), None, verts=12, bevel=0.03, segments=2)
use(arm, 'shirt')
sphere('hand', 0.05, (0, 0, -0.03), 'skin_1', subdiv=2)
leg = cyl('leg', 0.058, LEG_L, (0, 0, -LEG_L / 2), None, verts=12, bevel=0.03, segments=2)
use(leg, 'pants')
box('shoe', (0.1, 0.15, 0.06), (0, -0.025, -0.03), 'plastic_charcoal', bevel=0.025, segments=2)
lathe('mug', [(0.001, 0), (0.035, 0), (0.04, 0.01), (0.042, 0.08), (0.037, 0.08), (0.034, 0.015), (0.001, 0.015)], (0, 0, 0), 'mug', steps=12)

# Role accents (waist pivot like the torso; the game scales x to the build width)
hood = lump('hood', 0.13, (0, 0.12, TORSO_H + 0.01), (1.2, 0.6, 0.5), key='role')
strings = [box(f'hs{sx}', (0.012, 0.012, 0.09), (sx * 0.04, -0.115, TORSO_H - 0.07), None, bevel=0) for sx in (-1, 1)]
for o in strings:
    use(o, 'role')
collar = torus('hood_collar', 0.1, 0.022, (0, -0.005, TORSO_H - 0.005), None, major_seg=16, minor_seg=5)
use(collar, 'role')
join([hood, collar] + strings, 'role_engineer')
sc = [torus('scarf_ring', 0.09, 0.03, (0, -0.01, TORSO_H - 0.01), None, major_seg=14, minor_seg=5),
      box('scarf_tail', (0.06, 0.03, 0.14), (0.05, -0.12, TORSO_H - 0.1), None, bevel=0.012, rot=(math.radians(8), 0, math.radians(-10)))]
for o in sc:
    use(o, 'role')
join(sc, 'role_designer')
bz = [box('blz_l', (0.1, 0.03, TORSO_H - 0.02), (-0.08, -0.105, TORSO_H / 2), None, bevel=0.012, segments=1, rot=(0, math.radians(-6), 0)),
      box('blz_r', (0.1, 0.03, TORSO_H - 0.02), (0.08, -0.105, TORSO_H / 2), None, bevel=0.012, segments=1, rot=(0, math.radians(6), 0)),
      box('blz_lap_l', (0.03, 0.02, 0.1), (-0.04, -0.12, TORSO_H - 0.06), None, bevel=0.006, segments=1, rot=(0, math.radians(25), 0)),
      box('blz_lap_r', (0.03, 0.02, 0.1), (0.04, -0.12, TORSO_H - 0.06), None, bevel=0.006, segments=1, rot=(0, math.radians(-25), 0))]
for o in bz:
    use(o, 'role')
join(bz, 'role_marketer')
hs = [torus('hs_band', HEAD_R + 0.03, 0.012, (0, 0, HEAD_C), 'plastic_charcoal', rot=(math.pi / 2, 0, 0), major_seg=16, minor_seg=4),
      cyl('hs_cup', 0.055, 0.045, (-(HEAD_R + 0.025), 0, HEAD_C - 0.01), None, verts=12, bevel=0.01, rot=(0, math.pi / 2, 0)),
      cyl('hs_cup2', 0.055, 0.045, (HEAD_R + 0.025, 0, HEAD_C - 0.01), None, verts=12, bevel=0.01, rot=(0, math.pi / 2, 0)),
      box('hs_boom', (0.012, 0.16, 0.012), (-(HEAD_R - 0.01), -0.12, HEAD_C - 0.08), 'plastic_charcoal', bevel=0, rot=(math.radians(20), 0, math.radians(-25))),
      uvsphere('hs_mic', 0.022, (-0.12, -0.2, HEAD_C - 0.1), None, seg=8, rings=6)]
bm = bmesh.new(); bm.from_mesh(hs[0].data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < HEAD_C + 0.02], context='VERTS')
bm.to_mesh(hs[0].data); bm.free()
use(hs[1], 'role'); use(hs[2], 'role'); use(hs[4], 'role')
join(hs, 'role_support')      # head-space part: attached to the head pivot
vs = box('role_security', (1.0, 1.0, 1.0), (0, 0, TORSO_H * 0.47), None, bevel=0)
vs.scale = (0.3, 0.215, TORSO_H * 0.78)
bpy.ops.object.transform_apply(scale=True)
soften(vs, 0.05, 3)
vs.data.materials.append(mat('plastic_charcoal'))
stripe = box('vest_stripe', (0.31, 0.225, 0.035), (0, 0, TORSO_H * 0.5), None, bevel=0.01)
use(stripe, 'role')
join([vs, stripe], 'role_security')
tie = [box('tie_knot', (0.035, 0.02, 0.03), (0, -0.108, TORSO_H - 0.03), None, bevel=0.008),
       box('tie_blade', (0.05, 0.015, 0.16), (0, -0.112, TORSO_H - 0.13), None, bevel=0.01)]
for o in tie:
    use(o, 'role')
join(tie, 'role_sales')

REQUIRED = ['head', 'eyes', 'eye_shine', 'mouth_smile', 'mouth_flat', 'mouth_frown', 'blush',
            *[f'hair_{i}' for i in range(8)], 'acc_glasses', 'acc_headphones', 'acc_beanie', 'acc_cap',
            'torso_0', 'torso_1', 'torso_2', 'lanyard', 'badge', 'arm', 'hand', 'leg', 'shoe', 'mug',
            *[f'role_{r}' for r in ('engineer', 'designer', 'marketer', 'support', 'security', 'sales')]]
require_parts(REQUIRED)
export(budget=8000)
