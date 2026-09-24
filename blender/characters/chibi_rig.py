"""Chibi rig: an armature whose bones sit on the pivots character.js animates, with keyed actions
exported as glTF animations (chibi_rig.glb). The game reads each clip as rotation changes per
bone, so the bones' rest orientation does not matter; they all point up with no roll, which makes
a pose bone's local axes the game's (x right, y up, z front) and its ZYX Euler the game's XYZ.

Bones: body (root, the only one with location keys), hips, legL, legR, torso, head, armL, armR.
L is the -x side, as in character.js. Actions: typing (sit and type), nap (lying on a couch).
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
        'armR': ((-1.05 - breath * 0.04, 0, 0.55), None),
    }


key_action('typing', 4.0, typing)
key_action('nap', 4.0, nap)

path = out_path()
os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_frame_step=1, export_cameras=False, export_lights=False,
                          export_def_bones=False)
print(f'MODEL chibi_rig: 0 tris (rig, {len(BONES)} bones, 2 clips)')
