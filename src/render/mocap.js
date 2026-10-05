import * as THREE from 'three';
import { bodyShape, restAllowance, pushOut, limitJoint, JOINT_LIMITS } from './mocap-body.js';

// Plays a baked motion clip (schema hitl-mocap-clip v1, from scripts/tools/mocap/bake.mjs) on a
// character's rig pivots from an outside clock: setTime(t) poses the character at t seconds, so a
// timeline, a video or a scrubber owns time and nothing accumulates between calls.
//
//   const p = createMocapPlayer(char, clip, { minConf, ik, ramp });
//   p.setTime(t)  // then char.update(dt) applies it (character.js drive)
//   p.stop()      // hands the pivots back to clips and code
//
// Clip space is the character's own: origin on the floor under the hips at frame 0, +y up, +z the
// way the hips face at frame 0, the rig's L limbs at -x. Placing and turning the character's root
// places the clip.
//
// Bones whose trust (conf) is under minConf hold the nearest trusted frame instead of playing
// tracker jitter. During a contact the limb is aimed at its contact point (a single-segment limb
// needs only an aim), easing in and out over `ramp` frames.

const LIMB_OF = { footL: 'legL', footR: 'legR', handL: 'armL', handR: 'armR' };
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);

// Where a clip of a shot stands in the office, with the shot's shared space (clip.origin: frame-0
// floor point and +z heading, y up) set down at `at` { x, z, yaw }: rotate by at.yaw, then move.
// Yaw is the rotation about +y that takes +z to the facing (three.js rotation.y). A clip with no
// origin stands at `at`. `center` [x, z] is the shot point `at` stands for (default the shot's own
// origin). Chibis are far wider than their leg length says (head and shoulders), so `spread`
// scales the distances from `center`, keeping people apart where real ones stood shoulder to shoulder.
export function placeInShot(clip, at = { x: 0, z: 0, yaw: 0 }, { spread = 1, center = [0, 0] } = {}) {
  const o = clip.origin;
  const ay = at.yaw ?? 0;
  if (!o) return { x: at.x, z: at.z, yaw: ay };
  const ox = (o.pos[0] - center[0]) * spread, oz = (o.pos[2] - center[1]) * spread;
  const c = Math.cos(ay), s = Math.sin(ay);
  return { x: at.x + ox * c + oz * s, z: at.z - ox * s + oz * c, yaw: ay + o.yaw };
}

// A clip's own time on a shot's clock: the shot clock runs in seconds of the source video, and a
// clip starts at its source frame, at the source's own frame rate (clip.source.fps), else videoFps.
export const sourceStart = (clip, videoFps = 30) => (clip.source?.start ?? 0) / (clip.source?.fps || videoFps);
export function clipTime(clip, shotT, videoFps = 30) {
  return shotT - sourceStart(clip, videoFps);
}

export function isMocapClip(c) { return c?.format === 'hitl-mocap-clip' || (c?.tracks && c?.fps && Array.isArray(c?.bones)); }

// rootMotion: the clip's travel on the floor leaves the body pivot and is read from rootOffset
// (clip space x, z) by whoever moves the character's root, so its ring, shadow and label go along.
// The root must keep its yaw while the clip plays (the heading stays on the body pivot; heading()
// gives it, to hand over on stop).
//
// gain: { bone: k } multiplies a bone's turn from rest (its angle, same axis) before contacts are
// solved, so a gesture reads bigger on the chibi's short limbs from a high camera; contacts still
// pin where they were. MOCAP_GAIN is the readable default for arms and legs.
export const MOCAP_GAIN = { armL: 1.4, armR: 1.4, legL: 1.3, legR: 1.3 };

// Scales a unit quaternion's rotation angle by k about the same axis (k > 1 exaggerates), capped
// short of a full half turn so the limb never flips through.
const MAX_TURN = Math.PI * 0.95;
// Pivots the push may turn (limbs, and the torso and head leaning off them), how fast its turn
// follows (seconds), and the clip-time jump past which it is taken at once.
const PUSH_PIVOTS = ['legL', 'legR', 'armL', 'armR', 'torso', 'head'];
const PUSH_EASE_S = 0.1, PUSH_SEEK_S = 0.25;
function amplify(q, k) {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const half = Math.acos(Math.min(1, q.w));
  const s = Math.sin(half);
  if (s < 1e-6) return q;
  const nh = Math.min(MAX_TURN, 2 * half * k) / 2, f = Math.sin(nh) / s;
  return q.set(q.x * f, q.y * f, q.z * f, Math.cos(nh));
}

// limits: clamp each bone to JOINT_LIMITS (mocap-body.js). push: turn limbs out of the torso and head.
// The body's solids with their rest-pose allowances: every pivot turned back to rest (clip
// rotations are changes from it) for the measurement, then put back.
function restShape(char) {
  const pv = char.pivots;
  const shape = bodyShape(pv);
  if (!shape) return null;
  const saved = Object.entries(pv).map(([k, o]) => [o, o.quaternion.clone()]);
  for (const [o] of saved) o.quaternion.identity();
  char.root.updateMatrixWorld(true);
  restAllowance(shape);
  for (const [o, q] of saved) o.quaternion.copy(q);
  char.root.updateMatrixWorld(true);
  return shape;
}

export function createMocapPlayer(char, clip, { minConf = 0.35, ik = true, ramp = 5, rootMotion = false, gain = {}, limits = true, push = true, pushEase = PUSH_EASE_S } = {}) {
  const n = clip.frames, fps = clip.fps;
  const pv = char.pivots;
  const side = Object.fromEntries(Object.keys(JOINT_LIMITS).map((b) => [b, Math.sign(pv?.[b]?.position.x ?? 0)]));
  const shape = push && pv ? restShape(char) : null;
  const bones = clip.bones.filter((b) => clip.tracks[b]?.quat);
  // For each bone and frame, the frame to read: itself when trusted, else the nearest trusted one.
  const src = {};
  for (const b of bones) {
    const conf = clip.conf?.[b];
    const map = new Int32Array(n);
    let last = -1;
    for (let i = 0; i < n; i++) { if (!conf || conf[i] >= minConf) last = i; map[i] = last; }
    let next = -1;
    for (let i = n - 1; i >= 0; i--) { if (!conf || conf[i] >= minConf) next = i; if (map[i] < 0) map[i] = next >= 0 ? next : i; }
    src[b] = map;
  }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), _p1 = new THREE.Vector3();
  const off = { x: 0, z: 0 };   // the clip's floor travel taken out of the body (rootMotion)
  const _fwd = new THREE.Vector3(), _strip = new THREE.Quaternion();
  const pose = { q: Object.fromEntries(bones.map((b) => [b, new THREE.Quaternion()])), pos: new THREE.Vector3(), after: null };
  const contacts = (clip.contacts ?? []).filter((c) => LIMB_OF[c.limb]);
  let frame = 0, clipT = 0;
  const _q0 = new THREE.Quaternion();

  const read = (b, i, out) => { const a = clip.tracks[b].quat[src[b][i]]; return out.set(a[0], a[1], a[2], a[3]); };

  function setTime(t) {
    const x = Math.max(0, Math.min(n - 1, t * fps));
    const i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), a = x - i0;
    frame = x;
    clipT = t;
    for (const b of bones) {
      pose.q[b].copy(read(b, i0, qa)).slerp(read(b, i1, qb), a).normalize();
      const g = gain[b];
      if (g && g !== 1) amplify(pose.q[b], g);
      if (limits) limitJoint(pose.q[b], JOINT_LIMITS[b], side[b]);
    }
    const P = clip.tracks.body?.pos;
    if (P) pose.pos.set(P[i0][0], P[i0][1], P[i0][2]).lerp(_p1.set(P[i1][0], P[i1][1], P[i1][2]), a);
    if (rootMotion) { off.x = pose.pos.x; off.z = pose.pos.z; pose.pos.x = 0; pose.pos.z = 0; }
    char.drive(pose);
    return pose;
  }

  // How much contact c holds at frame x: 1 inside the span, easing to 0 over `ramp` frames outside
  // (smoothstep, so the pin neither snaps on nor lets go with a jerk).
  const weight = (c, x) => {
    if (x >= c.from && x < c.to) return 1;
    const d = x < c.from ? c.from - x : x - (c.to - 1);
    if (ramp <= 0) return 0;
    const u = Math.max(0, 1 - d / ramp);
    return u * u * (3 - 2 * u);
  };

  const _pw = new THREE.Vector3(), _tw = new THREE.Vector3(), _d0 = new THREE.Vector3(), _d1 = new THREE.Vector3();
  const _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rot = new THREE.Quaternion(), _goal = new THREE.Quaternion();
  // A rigid leg can only swing, so a planted foot whose hip has travelled can't reach its point by
  // aiming alone: the body moves by the planted feet's weighted miss so the feet land on their points.
  const legLen = (pivots, k) => { let y = 0; for (let o = pivots[k]; o && o !== pivots.body; o = o.parent) y += o.position.y; return Math.abs(y); };
  const _miss = new THREE.Vector3(), _end = new THREE.Vector3(), _inv = new THREE.Matrix4();
  function heading() { _fwd.set(0, 0, 1).applyQuaternion(pose.q.body ?? qa.identity()); return Math.atan2(_fwd.x, _fwd.z); }
  // A contact point in world space: clip space is the root's own, less the travel the root took over.
  const pointOf = (c, root, out) => root.localToWorld(out.set(c.point[0] - off.x, c.point[1], c.point[2] - off.z));
  function aim(pivots, root, c, w) {
    const limb = pivots[LIMB_OF[c.limb]];
    if (!limb) return null;
    limb.getWorldPosition(_pw);
    pointOf(c, root, _tw);
    limb.getWorldQuaternion(_wq);
    _d0.copy(DOWN).applyQuaternion(_wq);
    _d1.copy(_tw).sub(_pw);
    if (_d1.lengthSq() < 1e-8) return null;
    _d1.normalize();
    _rot.setFromUnitVectors(_d0, _d1);
    _goal.copy(_rot).multiply(_wq);
    limb.parent.getWorldQuaternion(_pq);
    _goal.premultiply(_pq.invert());
    limb.quaternion.slerp(_goal, w);
    limb.updateMatrixWorld(true);
    return limb;
  }
  // Contact IK, then the push of limbs out of the body: a limb pinned by a contact is pushed only by
  // what its contact leaves free.
  const held = {};
  let liveNow = [];
  // The push's turn of each pivot eases in and out over PUSH_EASE_S, so a limb grazing the body
  // doesn't flick from frame to frame. A seek (a jump in clip time) takes the push at once.
  const corr = {}, before = {}, _cq = new THREE.Quaternion();
  let lastT = null;
  function smoothPush(pivots) {
    const dt = lastT == null ? Infinity : Math.abs(clipT - lastT);
    lastT = clipT;
    const a = dt > PUSH_SEEK_S || pushEase <= 0 ? 1 : 1 - Math.exp(-dt / pushEase);
    for (const k of PUSH_PIVOTS) if (pivots[k]) before[k] = (before[k] ?? new THREE.Quaternion()).copy(pivots[k].quaternion);
    pushOut(shape, (k) => 1 - (held[k] ?? 0));
    for (const k of PUSH_PIVOTS) {
      const p = pivots[k];
      if (!p) continue;
      // This frame's push as a turn applied on top of the unpushed pose.
      _cq.copy(p.quaternion).multiply(_q0.copy(before[k]).invert());
      corr[k] = (corr[k] ?? new THREE.Quaternion()).slerp(_cq, a);
      p.quaternion.copy(corr[k]).multiply(before[k]);
    }
    char.root.updateMatrixWorld(true);
  }
  pose.after = (ik && contacts.length) || shape ? (pivots) => {
    for (const k in held) held[k] = 0;
    liveNow = [];
    if (ik && contacts.length) solveContacts(pivots);
    if (shape) {
      smoothPush(pivots);
      // The eased push may carry a turn onto a limb that has since planted: aim contacts again.
      for (const [c, w] of liveNow) aim(pivots, char.root, c, w);
    }
  } : null;
  function solveContacts(pivots) {
    const root = char.root;
    root.updateMatrixWorld(true);
    const live = contacts.map((c) => [c, weight(c, frame)]).filter(([, w]) => w > 0);
    liveNow = live;
    for (const [c, w] of live) { const k = LIMB_OF[c.limb]; held[k] = Math.max(held[k] ?? 0, w); }
    if (!live.length) return;
    for (const [c, w] of live) aim(pivots, root, c, w);
    // Where each planted foot ends up against its point, weighted; the body takes the mean miss.
    _miss.set(0, 0, 0);
    let wsum = 0;
    for (const [c, w] of live) {
      if (!c.limb.startsWith('foot')) continue;
      const k = LIMB_OF[c.limb], limb = pivots[k];
      limb.getWorldPosition(_end);
      limb.getWorldQuaternion(_wq);
      _end.addScaledVector(_d0.copy(DOWN).applyQuaternion(_wq), legLen(pivots, k) * root.scale.y);
      pointOf(c, root, _tw);
      // A foot still easing in or out counts far less than a planted one (w cubed), so it doesn't
      // pull the body off the planted foot's point.
      const ws = w * w * w;
      _miss.addScaledVector(_tw.sub(_end), ws);
      wsum += ws;
    }
    if (wsum <= 0) return;
    _miss.multiplyScalar(1 / Math.max(1, wsum));
    // Moving the body by the miss carries the aimed foot onto its point: mostly a dip as the leg
    // leans, the chibi's knee bend. With both feet planted the body takes their mean, and the
    // limbs aim again from there.
    const body = pivots.body;
    _inv.copy(body.parent.matrixWorld).invert();
    _end.copy(body.getWorldPosition(_pw)).add(_miss).applyMatrix4(_inv);
    body.position.copy(_end);
    body.updateMatrixWorld(true);
    if (live.length > 1) for (const [c, w] of live) aim(pivots, root, c, w);
  }

  return {
    clip,
    get duration() { return (n - 1) / fps; },
    get frame() { return frame; },
    setTime,
    // Contacts active at frame x with their weights (checks).
    // The floor travel moved out of the body (rootMotion), clip space.
    get rootOffset() { return off; },
    // The body's heading now, radians about +y (0: the clip's +z).
    heading,
    contactsAt(x = frame) { return contacts.map((c) => ({ ...c, w: weight(c, x) })).filter((c) => c.w > 0); },
    // With rootMotion the root takes the heading over (root yaw += heading()), so it comes off the
    // body pivot first: the blend back to code then starts from the same look.
    stop() {
      const body = char.pivots?.body;
      if (rootMotion && body) body.quaternion.premultiply(_strip.setFromAxisAngle(UP, -heading()));
      char.drive(null);
    },
  };
}
