"""Chibi rig: an armature whose bones sit on the pivots character.js animates, with keyed actions
exported as glTF animations (chibi_rig.glb). The game reads each clip as rotation changes per
bone, so the bones' rest orientation does not matter; they all point up with no roll, which makes
a pose bone's local axes the game's (x right, y up, z front) and its ZYX Euler the game's XYZ.

Bones: body (root, the only one with location keys), hips, legL, legR, torso, head, armL, armR.
L is the -x side, as in character.js. Actions: typing (sit and type), slumped, tired and burnout
(the mood desk poses), nap (lying on a couch), idle (standing) and walk (one stride).
"""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import reset, out_path
import bpy
from mathutils import Vector

reset()

FPS = 30
LEG_L, SHOE_H, TORSO_H = 0.25, 0.06, 0.30
HIP_Y = LEG_L + SHOE_H
SEAT_HIP_Y = 0.47
TYPE_REACH = -1.32
LEG_X = 0.075 * (0.85 + 0.12)          # build 1
SHOULDER_X = 0.3 / 2 + 0.03

# Bone heads in game space (x, y up, z front) and parents.
BONES = {
    'body': ((0, 0, 0), None),
    'hips': ((0, HIP_Y, 0), 'body'),
    'legL': ((-LEG_X, HIP_Y, 0), 'hips'),
    'legR': ((LEG_X, HIP_Y, 0), 'hips'),
    'torso': ((0, HIP_Y, 0), 'hips'),
    'head': ((0, HIP_Y + TORSO_H - 0.01, 0), 'torso'),
    'armL': ((-SHOULDER_X, HIP_Y + TORSO_H - 0.06, 0), 'torso'),
    'armR': ((SHOULDER_X, HIP_Y + TORSO_H - 0.06, 0), 'torso'),
}


def blender(v):
    x, y, z = v
    return Vector((x, -z, y))


bpy.context.scene.render.fps = FPS
arm_data = bpy.data.armatures.new('chibi_rig')
rig = bpy.data.objects.new('chibi_rig', arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for name, (head, parent) in BONES.items():
    b = arm_data.edit_bones.new(name)
    b.head = blender(head)
    b.tail = b.head + Vector((0, 0, 0.08))
    b.roll = 0
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

# The axis convention the docstring promises: bone x, y, z are game x, y, z.
for b in arm_data.bones:
    m = b.matrix_local.to_3x3()
    for got, want in ((m.col[0], (1, 0, 0)), (m.col[1], (0, 0, 1)), (m.col[2], (0, -1, 0))):
        assert (got - Vector(want)).length < 1e-5, (b.name, m)

for pb in rig.pose.bones:
    pb.rotation_mode = 'ZYX'


def key_action(name, seconds, pose_at):
    """Keys every frame of a loop from pose_at(t) -> {bone: (rot xyz, loc xyz or None)}."""
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    frames = int(round(seconds * FPS))
    for f in range(frames + 1):
        t = (f % frames) / FPS
        for bone, (rot, loc) in pose_at(t).items():
            pb = rig.pose.bones[bone]
            pb.rotation_euler = rot
            pb.keyframe_insert('rotation_euler', frame=f + 1)
            if loc is not None:
                pb.location = loc
                pb.keyframe_insert('location', frame=f + 1)
    act.use_fake_user = True
    # Push to an NLA track so the exporter writes each action as its own animation.
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    rig.animation_data.action = None
    return act


s = math.sin
TAU = math.pi * 2


def smooth(a, b, t):
    x = min(1, max(0, (t - a) / (b - a)))
    return x * x * (3 - 2 * x)


def typing(t):
    # A 4 s loop: two bursts of typing with a short read of the screen between them.
    burst = 1 - (smooth(2.4, 2.7, t) - smooth(3.3, 3.6, t))
    read = 1 - burst
    lean = 0.18 - read * 0.06
    twist = s(TAU * t / 4) * 0.035
    # Taps: each hand lifts and lands in turn; the lift never goes below the keys.
    tapL = abs(s(TAU * 3.5 * t)) * 0.07 * burst
    tapR = abs(s(TAU * 3.5 * t + 1.9)) * 0.07 * burst
    arm = TYPE_REACH - lean
    head_x = 0.12 + s(TAU * t / 2) * 0.03 * burst - read * 0.06
    head_z = read * 0.1 + s(TAU * t / 4) * 0.03
    bob = abs(s(TAU * 7 * t)) * 0.003 * burst + s(TAU * t / 2) * 0.002
    foot = max(0, s(TAU * t)) ** 4 * 0.06
    return {
        'body': ((0, 0, 0), (0, SEAT_HIP_Y - HIP_Y + bob, 0)),
        'legL': ((-1.45, 0, 0), None),
        'legR': ((-1.45 + foot, 0, 0), None),
        'torso': ((lean, twist, 0), None),
        'head': ((head_x, -twist * 0.6, head_z), None),
        'armL': ((arm - tapL - read * 0.1, 0, 0.18 + read * 0.04), None),
        'armR': ((arm - tapR - read * 0.1, 0, -0.18 - read * 0.04), None),
    }


def nap(t):
    # A 4 s loop: two slow breaths, one hand on the belly rising with them, ankles crossed.
    breath = (1 - math.cos(TAU * t / 2)) / 2
    return {
        'body': ((-math.pi / 2 + 0.3, 0, 0), (0, 0.1 + breath * 0.008, 0.5)),
        'legL': ((0.04, 0, 0.1), None),
        'legR': ((-0.06, 0, -0.04), None),
        'torso': ((-breath * 0.025, 0, 0), None),
        'head': ((0.3 + breath * 0.02, 0, 0.16), None),
        'armL': ((-0.25, 0, 0.3), None),
        'armR': ((-0.62 - breath * 0.04, 0, -0.5), None),
    }


def slumped(t):
    # A 6 s loop, coasting: slow patchy typing, the head sinking over the loop, then a sigh
    # that pulls it back up.
    sink = smooth(0, 4.6, t) - smooth(4.6, 5.4, t)
    sigh = max(0.0, s(math.pi * (t - 4.6) / 1.0)) if 4.6 <= t <= 5.6 else 0.0
    lean = 0.38 + sink * 0.05 - sigh * 0.1
    typing_on = 1 - (smooth(1.9, 2.3, t) - smooth(3.0, 3.4, t)) - sigh
    tapL = abs(s(TAU * 2.5 * t)) * 0.05 * max(0.0, typing_on)
    tapR = (max(0.0, s(TAU * t / 3)) ** 6) * 0.04
    arm = TYPE_REACH - lean - 0.22
    return {
        'body': ((0, 0, 0), (0, SEAT_HIP_Y - HIP_Y - 0.03 + sigh * 0.012, -0.06)),
        'legL': ((-1.45, 0, 0.04), None),
        'legR': ((-1.4, 0, -0.06), None),
        'torso': ((lean, s(TAU * t / 6) * 0.03, 0), None),
        'head': ((0.42 + sink * 0.12 - sigh * 0.22, 0, 0.12 + s(TAU * t / 6) * 0.04), None),
        'armL': ((arm - tapL, 0, 0.22 + sigh * 0.1), None),
        'armR': ((arm - tapR, 0, -0.22 - sigh * 0.1), None),
    }


def tired(t):
    # A 6 s loop, low stamina: chin propped on the right hand, the left pecking at the keys, a slow
    # nod off and a jolt awake.
    nod = smooth(1.5, 3.2, t) - smooth(3.2, 3.45, t)
    jolt = max(0.0, s(math.pi * (t - 3.2) / 0.5)) if 3.2 <= t <= 3.7 else 0.0
    lean = 0.3 + nod * 0.06 - jolt * 0.06
    typing_on = max(0.0, 1 - nod * 1.5 - jolt)
    tapL = abs(s(TAU * 1.5 * t)) * 0.05 * typing_on
    return {
        'body': ((0, 0, 0), (0, SEAT_HIP_Y - HIP_Y - 0.02 + jolt * 0.015, -0.05)),
        'legL': ((-1.45, 0, 0), None),
        'legR': ((-1.45, 0, 0), None),
        'torso': ((lean, 0, 0), None),
        'head': ((0.2 + nod * 0.32 - jolt * 0.12, 0, 0.22 - nod * 0.1), None),
        'armL': ((TYPE_REACH - lean - 0.12 - tapL, 0, 0.3), None),
        'armR': ((-2.0 + nod * 0.12, 0, -0.55), None),
    }


def burnout(t):
    # A 6 s loop, burned out: head down on arms folded on the desk, slow breathing, one long sigh
    # that lifts the shoulders, and a hand that fidgets and settles again.
    breath = (1 - math.cos(TAU * t / 3)) / 2
    sigh = max(0.0, s(math.pi * (t - 1.2) / 1.6)) if 1.2 <= t <= 2.8 else 0.0
    fidget = max(0.0, s(math.pi * (t - 4.2) / 0.9)) if 4.2 <= t <= 5.1 else 0.0
    lean = 0.52 - sigh * 0.16 + breath * 0.02
    return {
        'body': ((0, 0, 0), (0, SEAT_HIP_Y - HIP_Y - 0.02 + sigh * 0.025 + breath * 0.004, -0.12)),
        'legL': ((-1.45, 0, 0.05), None),
        'legR': ((-1.42, 0, -0.03), None),
        'torso': ((lean, 0, 0), None),
        'head': ((0.45 - sigh * 0.08, s(TAU * t / 6) * 0.05, 0.35 + s(TAU * t / 6) * 0.04), None),
        'armL': ((-2.6 + sigh * 0.05, 0, 0.55), None),
        'armR': ((-2.6 + fidget * 0.12, 0, -0.55 - fidget * 0.08), None),
    }


def idle(t):
    # A 4 s loop, standing: breathing, a weight shift from foot to foot, and a look around.
    breath = (1 - math.cos(TAU * t / 2)) / 2
    shift = s(TAU * t / 4)
    look = smooth(0.6, 1.0, t) - smooth(1.5, 1.9, t)
    look2 = smooth(2.4, 2.8, t) - smooth(3.3, 3.7, t)
    return {
        'body': ((0, 0, shift * 0.025), (shift * 0.012, breath * 0.006, 0)),
        'legL': ((0, 0, -shift * 0.025), None),
        'legR': ((0, 0, -shift * 0.025), None),
        'torso': ((0.02 - breath * 0.015, 0, -shift * 0.02), None),
        'head': ((0.02 - look2 * 0.08, (look - look2) * 0.35, s(TAU * t / 4) * 0.04), None),
        'armL': ((s(TAU * t / 4) * 0.04, 0, 0.12 + breath * 0.02), None),
        'armR': ((-s(TAU * t / 4) * 0.04, 0, -0.12 - breath * 0.02), None),
    }


STRIDE = 0.8


def walk(t):
    # One 0.8 s stride: legs and arms swing opposite, the body bobs on each step and rolls over
    # the planted foot, the torso counter-twists, and the head stays level.
    p = TAU * t / STRIDE
    swing = s(p)
    bob = abs(s(p))
    return {
        'body': ((0, 0, swing * 0.03), (0, bob * 0.03, 0)),
        'legL': ((swing * 0.5, 0, 0), None),
        'legR': ((-swing * 0.5, 0, 0), None),
        'torso': ((0.06, swing * 0.1, 0), None),
        'head': ((-0.02 + bob * 0.03, -swing * 0.06, -swing * 0.03), None),
        'armL': ((-swing * 0.45, 0, 0.1), None),
        'armR': ((swing * 0.45, 0, -0.1), None),
    }


key_action('typing', 4.0, typing)
key_action('burnout', 6.0, burnout)
key_action('idle', 4.0, idle)
key_action('walk', STRIDE, walk)
key_action('slumped', 6.0, slumped)
key_action('tired', 6.0, tired)
key_action('nap', 4.0, nap)

path = out_path()
os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_frame_step=1, export_cameras=False, export_lights=False,
                          export_def_bones=False)
print(f'MODEL chibi_rig: 0 tris (rig, {len(BONES)} bones, {len(bpy.data.actions)} clips)')
