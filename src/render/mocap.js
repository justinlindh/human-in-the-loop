import * as THREE from 'three';

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
const DOWN = new THREE.Vector3(0, -1, 0);

export function isMocapClip(c) { return c?.format === 'hitl-mocap-clip' || (c?.tracks && c?.fps && Array.isArray(c?.bones)); }

export function createMocapPlayer(char, clip, { minConf = 0.35, ik = true, ramp = 3 } = {}) {
  const n = clip.frames, fps = clip.fps;
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
  const pose = { q: Object.fromEntries(bones.map((b) => [b, new THREE.Quaternion()])), pos: new THREE.Vector3(), after: null };
  const contacts = (clip.contacts ?? []).filter((c) => LIMB_OF[c.limb]);
  let frame = 0;

  const read = (b, i, out) => { const a = clip.tracks[b].quat[src[b][i]]; return out.set(a[0], a[1], a[2], a[3]); };

  function setTime(t) {
    const x = Math.max(0, Math.min(n - 1, t * fps));
    const i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), a = x - i0;
    frame = x;
    for (const b of bones) pose.q[b].copy(read(b, i0, qa)).slerp(read(b, i1, qb), a).normalize();
    const P = clip.tracks.body?.pos;
    if (P) pose.pos.set(P[i0][0], P[i0][1], P[i0][2]).lerp(_p1.set(P[i1][0], P[i1][1], P[i1][2]), a);
    char.drive(pose);
    return pose;
  }

  // How much contact c holds at frame x: 1 inside the span, easing to 0 over `ramp` frames outside.
  const weight = (c, x) => {
    if (x >= c.from && x < c.to) return 1;
    const d = x < c.from ? c.from - x : x - (c.to - 1);
    return ramp > 0 ? Math.max(0, 1 - d / ramp) : 0;
  };

  const _pw = new THREE.Vector3(), _tw = new THREE.Vector3(), _d0 = new THREE.Vector3(), _d1 = new THREE.Vector3();
  const _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rot = new THREE.Quaternion(), _goal = new THREE.Quaternion();
  // A rigid leg can only swing, so a planted foot whose hip has travelled can't reach its point by
  // aiming alone: the body moves by the planted feet's weighted miss so the feet land on their points.
  const legLen = (pivots, k) => { let y = 0; for (let o = pivots[k]; o && o !== pivots.body; o = o.parent) y += o.position.y; return Math.abs(y); };
  const _miss = new THREE.Vector3(), _end = new THREE.Vector3(), _inv = new THREE.Matrix4();
  function aim(pivots, root, c, w) {
    const limb = pivots[LIMB_OF[c.limb]];
    if (!limb) return null;
    limb.getWorldPosition(_pw);
    _tw.set(c.point[0], c.point[1], c.point[2]);
    root.localToWorld(_tw);
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
  pose.after = ik && contacts.length ? (pivots) => {
    const root = char.root;
    root.updateMatrixWorld(true);
    const live = contacts.map((c) => [c, weight(c, frame)]).filter(([, w]) => w > 0);
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
      _tw.set(c.point[0], c.point[1], c.point[2]);
      root.localToWorld(_tw);
      _miss.addScaledVector(_tw.sub(_end), w);
      wsum += w;
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
  } : null;

  return {
    clip,
    get duration() { return (n - 1) / fps; },
    get frame() { return frame; },
    setTime,
    // Contacts active at frame x with their weights (checks).
    contactsAt(x = frame) { return contacts.map((c) => ({ ...c, w: weight(c, x) })).filter((c) => c.w > 0); },
    stop() { char.drive(null); },
  };
}
