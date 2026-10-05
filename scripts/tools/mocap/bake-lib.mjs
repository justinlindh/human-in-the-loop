// Turns one person of a hitl-mocap-shot into a hitl-mocap-clip for the chibi rig (src/render/rig.js).
//
// Space: the clip is in the person's frame-0 body space, y up, +z the way the hips face at frame 0, +x
// to the left of a body facing +z, origin on the floor under the hips at frame 0. The rig's limb names
// follow that axis, so the rig's `L` limb is the anatomical right one of the source. Positions are scaled
// to the chibi (`scale`); rotations are what rig.js convert() produces: each bone's change from rest in
// its parent's frame. Every chibi bone rests pointing up with game axes, so a bone's rest orientation is
// the identity and a world orientation is already its change from rest.
import { Matrix4, Quaternion, Vector3 } from 'three';

export const RIG_BONES = ['body', 'hips', 'legL', 'legR', 'torso', 'head', 'armL', 'armR'];
const PARENT = { body: null, hips: 'body', legL: 'hips', legR: 'hips', torso: 'hips', head: 'torso', armL: 'torso', armR: 'torso' };
export const CLIP_FPS = 30;
const ANKLE_HEIGHT = 0.08; // human ankle above the sole, metres: the leg length the chibi hip height stands for
const BEND_FULL = (150 * Math.PI) / 180; // joint flexion that reads as bend 1
const FOOT_LIFT = 0.05, FOOT_SPEED = 0.6, FOOT_MIN = 3, FLOOR_WINDOW = 15; // plant: toe within FOOT_LIFT of the lowest toe within FLOOR_WINDOW frames, ankle under FOOT_SPEED m/s, FOOT_MIN frames
const SPLIT = 0.03; // a contact ends when the limb is this far (source metres) from its running mean
const HAND_SPEED = 0.2, HAND_MIN_S = 0.3, HAND_AWAY = (40 * Math.PI) / 180; // hold: hand under HAND_SPEED m/s for HAND_MIN_S, arm off its hanging line by HAND_AWAY
const LOOK_DIST = 1.5; // metres ahead of the head, in chibi units after scaling

const DOWN = new Vector3(0, -1, 0);
const need = (joints, name) => { const i = joints.indexOf(name); if (i < 0) throw new Error(`the shot has no joint ${name}`); return i; };

// Pivot heights read from public/models/chibi_rig.glb by the caller: { legL: [x, y, z], ... }.
export function bakeShot(shot, personId, opts = {}) {
  const person = shot.people.find((p) => p.id === personId);
  if (!person) throw new Error(`no person ${personId} in the shot (ids: ${shot.people.map((p) => p.id).join(', ')})`);
  const pivots = opts.pivots;
  if (!pivots?.legL) throw new Error('bake needs the rig pivots');
  const srcFps = shot.shot.fps;
  const T = person.joint_pos_world.length;
  const from = Math.max(0, opts.from ?? 0), to = Math.min(T, opts.to ?? T);
  if (!(to - from >= 2)) throw new Error(`the frame range ${from}-${to} holds fewer than 2 frames`);
  const J = shot.joints;
  const ix = Object.fromEntries(['Hips', 'Spine1', 'Spine2', 'Neck1', 'Neck2', 'Head', 'HeadEnd', 'LeftEye', 'RightEye', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftLeg', 'LeftShin', 'LeftFoot', 'LeftToeBase', 'RightLeg', 'RightShin', 'RightFoot', 'RightToeBase'].map((n) => [n, need(J, n)]));
  const n = to - from;
  const P = (t, name) => { const a = person.joint_pos_world[from + t][ix[name]]; return new Vector3(a[0], a[1], a[2]); };

  const shared = sharedSpace(shot, pivots);
  // Align frame 0's heading to +z (about the hips' own vertical) and put the origin under the hips on the floor.
  const frame0 = bodyFrame(P(0, 'LeftLeg'), P(0, 'RightLeg'), P(0, 'Spine2').sub(P(0, 'Hips')));
  const yaw0 = Math.atan2(forwardOf(frame0).x, forwardOf(frame0).z);
  const align = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -yaw0);
  const feetY = [];
  for (let t = 0; t < n; t++) feetY.push(Math.min(P(t, 'LeftToeBase').y, P(t, 'RightToeBase').y));
  const floorY = percentile(feetY, 0.02);
  const hips0 = P(0, 'Hips');
  const origin = new Vector3(hips0.x, floorY, hips0.z);
  const toClip = (v, s = 1) => v.clone().sub(origin).applyQuaternion(align).multiplyScalar(s);

  // Chibi size: its leg length (hip pivot height) over the source leg (hip to ankle chains plus the ankle height).
  const scale = legScale(shot, [personId], from, to, pivots);

  // Rig side to source side: the rig's L limb sits at -x, which is the anatomical right one.
  const side = { L: 'Right', R: 'Left' };
  const hipsStart = toClip(hips0, scale);
  const world = {}; // bone -> Quaternion[n]
  for (const b of RIG_BONES) world[b] = [];
  const bend = { legL: [], legR: [], armL: [], armR: [] };
  const look = [], pos = [], conf = Object.fromEntries(RIG_BONES.map((b) => [b, []]));
  for (let t = 0; t < n; t++) {
    const hips = bodyFrame(P(t, 'LeftLeg'), P(t, 'RightLeg'), P(t, 'Spine2').sub(P(t, 'Hips')));
    const torso = bodyFrame(P(t, 'LeftArm'), P(t, 'RightArm'), P(t, 'Neck1').sub(P(t, 'Spine1')));
    const headUp = P(t, 'HeadEnd').sub(P(t, 'Head'));
    const head = bodyFrame(P(t, 'LeftEye'), P(t, 'RightEye'), headUp);
    const aligned = (m) => align.clone().multiply(new Quaternion().setFromRotationMatrix(m));
    const wHips = aligned(hips);
    world.hips.push(wHips);
    world.torso.push(aligned(torso));
    world.head.push(aligned(head));
    world.body.push(yawOnly(wHips));
    for (const k of ['L', 'R']) {
      const s = side[k];
      const leg = P(t, `${s}Foot`).sub(P(t, `${s}Leg`)).applyQuaternion(align);
      const arm = P(t, `${s}Hand`).sub(P(t, `${s}Arm`)).applyQuaternion(align);
      world[`leg${k}`].push(new Quaternion().setFromUnitVectors(DOWN, leg.normalize()));
      world[`arm${k}`].push(new Quaternion().setFromUnitVectors(DOWN, arm.normalize()));
      bend[`leg${k}`].push(flex(P(t, `${s}Leg`), P(t, `${s}Shin`), P(t, `${s}Foot`)));
      bend[`arm${k}`].push(flex(P(t, `${s}Arm`), P(t, `${s}ForeArm`), P(t, `${s}Hand`)));
    }
    pos.push(toClip(P(t, 'Hips'), scale).sub(hipsStart).toArray());
    const hc = toClip(P(t, 'Head'), scale);
    const fwd = forwardOf(head).applyQuaternion(align);
    look.push(hc.add(fwd.multiplyScalar(LOOK_DIST)).toArray());
    const tr = (...names) => Math.min(...names.map((nm) => person.trust[from + t][J.indexOf(nm)]));
    const seen = person.observed[from + t] ? 1 : 0;
    conf.body.push(seen);
    conf.hips.push(seen * tr('Hips', 'LeftLeg', 'RightLeg'));
    conf.torso.push(seen * tr('Spine2', 'LeftArm', 'RightArm'));
    conf.head.push(seen * tr('Head'));
    conf.legL.push(seen * tr('RightLeg', 'RightShin', 'RightFoot'));
    conf.legR.push(seen * tr('LeftLeg', 'LeftShin', 'LeftFoot'));
    conf.armL.push(seen * tr('RightArm', 'RightForeArm', 'RightHand'));
    conf.armR.push(seen * tr('LeftArm', 'LeftForeArm', 'LeftHand'));
  }

  // Local rotations as rig.js convert() makes them: the parent's change undone, then this bone's.
  const local = {};
  for (const b of RIG_BONES) {
    local[b] = world[b].map((q, t) => (PARENT[b] ? world[PARENT[b]][t].clone().invert().multiply(q) : q.clone()));
    for (let t = 1; t < n; t++) if (local[b][t].dot(local[b][t - 1]) < 0) local[b][t].set(-local[b][t].x, -local[b][t].y, -local[b][t].z, -local[b][t].w);
  }

  const contacts = [
    ...footContacts(n, srcFps, (t, s) => toClip(P(t, `${s}Foot`), scale), (t, s) => toClip(P(t, `${s}ToeBase`)).y, scale, side),
    ...handContacts(n, srcFps, (t, nm) => toClip(P(t, nm), scale), scale, side, (t, s) => P(t, `${s}Hand`).sub(P(t, `${s}Arm`)).applyQuaternion(align)),
  ];

  const placement = shared ? sharedOrigin(shared, personId, from, forwardOf(frame0)) : null;
  const outN = Math.max(2, Math.round(((n - 1) / srcFps) * CLIP_FPS) + 1);
  const at = (i) => Math.min(n - 1, (i * srcFps) / CLIP_FPS);
  const tracks = {};
  for (const b of RIG_BONES) tracks[b] = { quat: resampleQuats(local[b], outN, at).map((q) => q.map(r5)) };
  tracks.body.pos = resampleVec(pos, outN, at).map((v) => v.map(r4));
  const bendOut = Object.fromEntries(Object.entries(bend).map(([k, v]) => [k, resampleScalar(v, outN, at).map(r4)]));
  return {
    format: 'hitl-mocap-clip', version: 1,
    name: opts.name ?? `shot${opts.shotIndex ?? 0}_p${personId}`,
    fps: CLIP_FPS, frames: outN,
    bones: RIG_BONES,
    scale: r5(scale),
    ...(placement ? { origin: placement } : {}),
    source: { shot: opts.shotIndex ?? 0, trackId: personId, start: shot.shot.start_frame + from, end: shot.shot.start_frame + to, fps: srcFps },
    tracks,
    bend: bendOut,
    look: resampleVec(look, outN, at).map((v) => v.map(r4)),
    conf: Object.fromEntries(RIG_BONES.map((b) => [b, resampleScalar(conf[b], outN, at).map(r4)])),
    contacts: contacts.map((c) => ({ limb: c.limb, from: Math.round((c.from * CLIP_FPS) / srcFps), to: Math.min(outN, Math.round((c.to * CLIP_FPS) / srcFps)), point: c.point.map(r4) })).filter((c) => c.to > c.from),
    notes: 'tracks[bone].quat: [x, y, z, w] per frame, change from rest in the parent frame; body.pos metres (chibi scale) relative to frame 0, y up; contact point and look are in the clip space (origin on the floor under the hips at frame 0, +z facing at frame 0); contacts [from, to) in clip frames; the rig L limb is the anatomical right one',
  };
}

// Orthonormal frame with columns (x: to the body's left when facing +z, y: up, z: facing) from the
// anatomical left and right joints and an up hint.
function bodyFrame(leftJ, rightJ, upHint) {
  const up = upHint.clone().normalize();
  const right = rightJ.clone().sub(leftJ);
  right.sub(up.clone().multiplyScalar(right.dot(up)));
  if (right.lengthSq() < 1e-12) right.set(-1, 0, 0);
  right.normalize();
  const front = up.clone().cross(right).normalize();
  return new Matrix4().makeBasis(right.clone().negate(), up, front);
}
const forwardOf = (m) => new Vector3().setFromMatrixColumn(m, 2);
function yawOnly(q) {
  const f = new Vector3(0, 0, 1).applyQuaternion(q);
  return new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(f.x, f.z));
}
function flex(a, b, c) {
  const u = b.clone().sub(a).normalize(), v = c.clone().sub(b).normalize();
  return Math.min(1, Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) / BEND_FULL);
}
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const percentile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function resampleQuats(qs, outN, at) {
  return Array.from({ length: outN }, (_, i) => {
    const s = at(i), a = Math.floor(s), b = Math.min(qs.length - 1, a + 1);
    return qs[a].clone().slerp(qs[b], s - a).toArray();
  });
}
function resampleVec(vs, outN, at) {
  return Array.from({ length: outN }, (_, i) => {
    const s = at(i), a = Math.floor(s), b = Math.min(vs.length - 1, a + 1), f = s - a;
    return vs[a].map((x, k) => x + (vs[b][k] - x) * f);
  });
}
function resampleScalar(vs, outN, at) {
  return resampleVec(vs.map((x) => [x]), outN, at).map((v) => v[0]);
}

// Runs of true values at least min long, as [from, to) pairs; gaps of two frames or fewer are bridged.
function runs(flags, min) {
  const out = [];
  let s = -1;
  for (let t = 0; t <= flags.length; t++) {
    if (t < flags.length && flags[t]) { if (s < 0) s = t; continue; }
    if (s >= 0) { out.push([s, t]); s = -1; }
  }
  const merged = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] <= 2) last[1] = r[1]; else merged.push([...r]);
  }
  return merged.filter(([a, b]) => b - a >= min);
}
function speeds(n, fps, p) {
  return Array.from({ length: n }, (_, t) => {
    const a = p(Math.max(0, t - 1)), b = p(Math.min(n - 1, t + 1));
    return a.distanceTo(b) / ((Math.min(n - 1, t + 1) - Math.max(0, t - 1)) / fps);
  });
}
// A foot is planted when its toe is within FOOT_LIFT of the lowest toe of either foot nearby (so a floor
// that drifts in the source does not matter) and the ankle is slow. Each run is then cut wherever the limb
// leaves its running mean by more than SPLIT (at chibi scale), so a step in the middle makes two plants.
function footContacts(n, fps, ankle, toeY, scale, side) {
  const out = [];
  const low = Array.from({ length: n }, (_, t) => Math.min(toeY(t, side.L), toeY(t, side.R)));
  const floor = low.map((_, t) => Math.min(...low.slice(Math.max(0, t - FLOOR_WINDOW), t + FLOOR_WINDOW + 1)));
  for (const k of ['L', 'R']) {
    const s = side[k];
    const v = speeds(n, fps, (t) => ankle(t, s));
    // The ankle track is in chibi units, the toe height in source metres.
    const flags = Array.from({ length: n }, (_, t) => toeY(t, s) < floor[t] + FOOT_LIFT && v[t] < FOOT_SPEED * scale);
    for (const c of segments(runs(flags, FOOT_MIN), FOOT_MIN, (t) => ankle(t, s), SPLIT * scale)) out.push({ limb: `foot${k}`, ...c });
  }
  return out;
}
function handContacts(n, fps, jointAt, scale, side, armDir) {
  const out = [];
  const min = Math.round(HAND_MIN_S * fps);
  for (const k of ['L', 'R']) {
    const s = side[k];
    const v = speeds(n, fps, (t) => jointAt(t, `${s}Hand`));
    const flags = Array.from({ length: n }, (_, t) => v[t] < HAND_SPEED * scale && armDir(t, s).normalize().angleTo(DOWN) > HAND_AWAY);
    for (const c of segments(runs(flags, min), min, (t) => jointAt(t, `${s}Hand`), SPLIT * scale)) out.push({ limb: `hand${k}`, ...c });
  }
  return out;
}
// Splits each [from, to) where the point leaves its running mean by more than SPLIT; a piece shorter than min
// is dropped. The point is the median of the piece (per axis).
function segments(spans, min, at, limit) {
  const out = [];
  for (const [a, b] of spans) {
    let start = a;
    const mean = new Vector3();
    let count = 0;
    const close = (end) => {
      if (end - start >= min) {
        const pts = Array.from({ length: end - start }, (_, i) => at(start + i));
        out.push({ from: start, to: end, point: ['x', 'y', 'z'].map((ax) => median(pts.map((p) => p[ax]))) });
      }
    };
    for (let t = a; t < b; t++) {
      const p = at(t);
      if (count && p.distanceTo(mean) > limit) { close(t); start = t; count = 0; mean.set(0, 0, 0); }
      mean.multiplyScalar(count).add(p).multiplyScalar(1 / (count + 1));
      count++;
    }
    close(b);
  }
  return out;
}

const quatOf = (a) => new Quaternion(a[0], a[1], a[2], a[3]);
const rowsOf = (m) => new Matrix4().set(m[0][0], m[0][1], m[0][2], 0, m[1][0], m[1][1], m[1][2], 0, m[2][0], m[2][1], m[2][2], 0, 0, 0, 0, 1);

// Where the clips stand relative to each other. The shot's people live in separate gravity-aligned worlds and
// the camera path lives in the depth model's world, so the link is the camera: each person's root orientation
// in the camera against its orientation in its own world gives that world's up in camera space, hence in the
// scene. The shared space has y up, z the first camera's forward direction flattened onto the floor, x = y cross z.
// Null without the camera data.
function sharedSpace(shot, pivots) {
  const cam = shot.camera;
  const T = cam?.w2c?.length ?? 0;
  // A camera path that does not cover every frame of every person (a static camera writes none) places nothing.
  if (!T || !shot.people.every((p) => p.root_orient_cam?.length >= p.joint_pos_world.length && p.root_pos_scene?.length >= p.joint_pos_world.length && p.rot_local && p.joint_pos_world.length <= T)) return null;
  const c2w = cam.w2c.map((m) => rowsOf(m).transpose()); // rotation only: the inverse of a rotation is its transpose
  const worldToCam = (p, t) => quatOf(p.root_orient_cam[t]).multiply(quatOf(p.rot_local[t][0]).invert());
  const toScene = (p, t, v) => v.clone().applyQuaternion(worldToCam(p, t)).applyMatrix4(c2w[t]);
  const up = new Vector3();
  for (const p of shot.people) for (let t = 0; t < T; t++) up.add(toScene(p, t, new Vector3(0, 1, 0)));
  up.normalize();
  const fwd = new Vector3(0, 0, 1).applyMatrix4(c2w[0]);
  const z = fwd.sub(up.clone().multiplyScalar(fwd.dot(up))).normalize();
  const x = up.clone().cross(z).normalize();
  const coords = (v) => new Vector3(v.dot(x), v.dot(up), v.dot(z));
  const rootAt = (p, t) => coords(new Vector3(...p.root_pos_scene[t]));
  return { shot, coords, rootAt, toScene, scale: shot.people.length ? sharedScale(shot, pivots) : 1 };
}

// The clip's frame-0 origin (the floor under the hips, which is y = 0 in the shared space) and heading in the
// shared space. Positions are at the chibi scale of the shot's people together, so they keep their distances.
function sharedOrigin(sp, personId, from, face0) {
  const p = sp.shot.people.find((q) => q.id === personId);
  const f = sp.coords(sp.toScene(p, from, face0));
  const r = sp.rootAt(p, from);
  return { pos: [r.x * sp.scale, 0, r.z * sp.scale].map(r4), yaw: r5(Math.atan2(f.x, f.z)), scale: r5(sp.scale) };
}

// Chibi leg length over the median source leg (hip to ankle chains plus the ankle height) of every person.
function legScale(shot, ids, from, to, pivots) {
  const J = shot.joints, chains = [];
  for (const p of shot.people.filter((q) => ids.includes(q.id)))
    for (let t = from; t < to; t++) for (const s of ['Left', 'Right']) {
      const pt = (n) => new Vector3(...p.joint_pos_world[t][J.indexOf(`${s}${n}`)]);
      chains.push(pt('Leg').distanceTo(pt('Shin')) + pt('Shin').distanceTo(pt('Foot')));
    }
  return pivots.legL[1] / (median(chains) + ANKLE_HEIGHT);
}
const sharedScale = (shot, pivots) => legScale(shot, shot.people.map((p) => p.id), 0, shot.people[0].joint_pos_world.length, pivots);
