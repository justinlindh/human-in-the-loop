import * as THREE from 'three';

// The chibi's body as simple shapes, so a played clip can keep its limbs out of the torso, the head
// and each other (pushOut) and its joints inside what a chibi can do (limitJoint). Shapes come from
// the baked part meshes under each rig pivot (character.js tags them userData.part), so builds and
// outfits fit.
//
//   limbs: each limb a capsule from its pivot to its far end (pivot frame), radius r
//   obstacles per limb: the torso and head as rounded boxes, and for a leg the other leg's capsule
//
// Rest-pose overlaps are allowed: a limb may sit as deep in an obstacle as it does at rest, so the
// arms hanging against the torso stay where they were modelled.

const LIMBS = ['legL', 'legR', 'armL', 'armR'];
const SOLIDS = ['torso', 'head'];
// Points along a limb tested against its obstacles, as fractions of its length (the root sits in the
// hip or shoulder at rest, so it is not tested).
const SAMPLES = [0.35, 0.6, 0.8, 1];
const PUSH_ITERS = 6;
const MARGIN = 0.004;
const MAX_STEP = 0.5;
// Share of a leg-into-torso push the torso takes by leaning away.
const LEG_TORSO_LEAN = 0.7;
// Share of an arm-into-head push the head takes by tilting away (a raised hand keeps its height).
const ARM_HEAD_TILT = 0.5;

// How far each bone may turn from rest: swing (radians off its rest direction), twist about its own
// axis, and for legs how far the foot may cross toward the other side (sine of the angle past the
// midline). Legs kick high but don't cross; arms swing freely (pushOut keeps them out of the body).
export const JOINT_LIMITS = {
  legL: { swing: 1.75, twist: 0.5, cross: 0.22 },
  legR: { swing: 1.75, twist: 0.5, cross: 0.22 },
  armL: { swing: 2.9, twist: 1.0 },
  armR: { swing: 2.9, twist: 1.0 },
  head: { swing: 0.75, twist: 1.1 },
  torso: { swing: 0.6, twist: 0.7 },
  hips: { swing: 0.6, twist: 0.8 },
};

const _q = new THREE.Quaternion(), _tw = new THREE.Quaternion(), _sw = new THREE.Quaternion();
const _d = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), YAX = new THREE.Vector3(0, 1, 0);

// Clamps a bone's local turn from rest (q, a change from rest in the parent's frame) to its limits.
// side: -1 for a limb on the -x side, +1 on +x (for the cross limit). Returns q.
export function limitJoint(q, lim, side = 0) {
  if (!lim) return q;
  // Swing-twist about the bone's own (vertical) axis.
  _tw.set(0, q.y, 0, q.w);
  if (_tw.lengthSq() < 1e-12) _tw.identity(); else _tw.normalize();
  _sw.copy(q).multiply(_q.copy(_tw).invert());
  let tw = 2 * Math.atan2(_tw.y, _tw.w);
  if (tw > Math.PI) tw -= 2 * Math.PI; else if (tw < -Math.PI) tw += 2 * Math.PI;
  const twC = Math.max(-lim.twist, Math.min(lim.twist, tw));
  if (twC !== tw) _tw.setFromAxisAngle(YAX, twC);
  _d.copy(DOWN).applyQuaternion(_sw);
  let changed = false;
  if (lim.cross != null && side) {
    // The foot's sideways reach toward the other side, as a sine: clamp it, keeping the rest.
    const inward = -side * _d.x;
    if (inward > lim.cross) {
      const k = Math.sqrt(Math.max(0, 1 - lim.cross * lim.cross) / Math.max(1e-9, _d.y * _d.y + _d.z * _d.z));
      _d.set(-side * lim.cross, _d.y * k, _d.z * k);
      changed = true;
    }
  }
  const ang = Math.acos(Math.max(-1, Math.min(1, -_d.y)));
  if (ang > lim.swing) {
    const h = Math.hypot(_d.x, _d.z) || 1;
    const s = Math.sin(lim.swing);
    _d.set(_d.x / h * s, -Math.cos(lim.swing), _d.z / h * s);
    changed = true;
  }
  if (changed) _sw.setFromUnitVectors(DOWN, _d.normalize());
  if (changed || twC !== tw) q.copy(_sw).multiply(_tw);
  return q;
}

function localBox(pivot, part) {
  const box = new THREE.Box3();
  pivot.traverse((o) => {
    if (!o.isMesh || o.userData.part !== part) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    // The mesh's frame relative to the pivot.
    const m = new THREE.Matrix4();
    for (let x = o; x && x !== pivot; x = x.parent) m.premultiply(x.matrix);
    box.union(o.geometry.boundingBox.clone().applyMatrix4(m));
  });
  return box.isEmpty() ? null : box;
}

const _p = new THREE.Vector3(), _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

// A rounded box on a pivot (centre c, half size h, corner radius rr, pivot frame).
function roundedBox(pivot, b, round) {
  const h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const s = { pivot, c: b.getCenter(new THREE.Vector3()), h, rr: Math.min(h.x, h.y, h.z) * round };
  const sd = (p) => {
    const qx = Math.abs(p.x - s.c.x) - (s.h.x - s.rr), qy = Math.abs(p.y - s.c.y) - (s.h.y - s.rr), qz = Math.abs(p.z - s.c.z) - (s.h.z - s.rr);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - s.rr;
  };
  const local = (world) => _p.copy(world).applyMatrix4(_inv.copy(pivot.matrixWorld).invert());
  return {
    pivot,
    // Distance from a world point to the surface (negative inside).
    dist: (world) => sd(local(world)),
    // Outward direction at a world point (numerical gradient), world space.
    normal(world, out) {
      const p = local(world).clone(), e = 0.003, base = sd(p);
      out.set(...[0, 1, 2].map((i) => { const v = p.clone(); v.setComponent(i, v.getComponent(i) + e); return (sd(v) - base) / e; }));
      return out.transformDirection(pivot.matrixWorld);
    },
  };
}

// A limb as an obstacle for another limb: its capsule, from where it stands now.
function capsule(limb) {
  const closest = (world) => {
    limb.pivot.getWorldPosition(_a);
    _b.copy(limb.end).applyMatrix4(limb.pivot.matrixWorld).sub(_a);
    const t = Math.max(0, Math.min(1, _p.copy(world).sub(_a).dot(_b) / Math.max(1e-9, _b.lengthSq())));
    return _a.addScaledVector(_b, t);
  };
  return {
    dist: (world) => world.distanceTo(closest(world)) - limb.r,
    normal: (world, out) => out.copy(world).sub(closest(world)).normalize(),
  };
}

// The body's limbs and obstacles from a character's pivots, or null when the parts are not tagged.
export function bodyShape(pivots) {
  const solids = {}, limbs = {};
  for (const k of SOLIDS) {
    const b = pivots[k] && localBox(pivots[k], k);
    if (!b) return null;
    solids[k] = roundedBox(pivots[k], b, k === 'head' ? 0.85 : 0.6);
  }
  for (const k of LIMBS) {
    const b = pivots[k] && localBox(pivots[k], k);
    if (!b) continue;
    const c = b.getCenter(new THREE.Vector3());
    // Far end: the bottom of the part on its centre line, less the capsule's end cap. Radius: half
    // an arm's narrower width; for a leg, half its mean width, so the long shoe counts.
    const wx = b.max.x - b.min.x, wz = b.max.z - b.min.z;
    const r = k.startsWith('leg') ? 0.25 * (wx + wz) : 0.5 * Math.min(wx, wz);
    const end = new THREE.Vector3(c.x, b.min.y, c.z);
    limbs[k] = { pivot: pivots[k], end: end.addScaledVector(end.clone().normalize(), -r), r, side: Math.sign(pivots[k].position.x) || 0, obstacles: null, rest: null };
  }
  for (const [k, limb] of Object.entries(limbs)) {
    limb.obstacles = { ...solids };
    const other = k === 'legL' ? limbs.legR : k === 'legR' ? limbs.legL : null;
    if (other) limb.obstacles.leg = capsule(other);
  }
  return { solids, limbs };
}

const _w = new THREE.Vector3(), _o = new THREE.Vector3(), _n = new THREE.Vector3();
const pointOn = (limb, f, out) => out.copy(limb.end).multiplyScalar(f).applyMatrix4(limb.pivot.matrixWorld);

// Records each limb sample's clearance from each obstacle now (call in the rest pose): pushOut never
// asks for more clearance than the rest pose has.
export function restAllowance(shape) {
  for (const limb of Object.values(shape.limbs)) {
    limb.pivot.updateMatrixWorld(true);
    limb.rest = SAMPLES.map((f) => Object.fromEntries(Object.entries(limb.obstacles).map(([k, o]) => [k, o.dist(pointOn(limb, f, _w)) - limb.r])));
  }
}

const _rot = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _goal = new THREE.Quaternion(), _arm = new THREE.Vector3(), _axis = new THREE.Vector3();
// How much a leg is kicking: 0 hanging, stepping or swung back, 1 swung well up in front (its
// forward swing off straight down, eased from KICK_FROM to KICK_TO radians; +z is the body's front).
const KICK_FROM = 0.6, KICK_TO = 1.2;
function kickOf(pivot) {
  _d.copy(DOWN).applyQuaternion(pivot.quaternion);
  const swing = Math.atan2(_d.z, -_d.y);
  const u = Math.max(0, Math.min(1, (swing - KICK_FROM) / (KICK_TO - KICK_FROM)));
  return u * u * (3 - 2 * u);
}

// Turns `pivot` so its point `at` (world) moves about `dist` along unit direction `n`.
function turnBy(pivot, at, n, dist) {
  if (dist <= 0) return;
  pivot.getWorldPosition(_o);
  _arm.copy(at).sub(_o);
  const len = _arm.length();
  if (len < 1e-4) return;
  _axis.crossVectors(_arm, n);
  if (_axis.lengthSq() < 1e-10) return;
  _axis.normalize();
  // Only the push across the arm turns it, so a push mostly along it needs a bigger turn.
  const across = Math.max(0.2, Math.sqrt(Math.max(0, 1 - (_arm.dot(n) / len) ** 2)));
  _rot.setFromAxisAngle(_axis, Math.min(MAX_STEP, dist / len / across));
  pivot.getWorldQuaternion(_wq);
  _goal.copy(_rot).multiply(_wq);
  pivot.parent.getWorldQuaternion(_pq);
  pivot.quaternion.copy(_goal.premultiply(_pq.invert()));
  pivot.updateMatrixWorld(true);
}

// Turns each limb about its pivot until its samples clear its obstacles (keeping at most the rest
// pose's own overlap). weight(k) in 0..1 scales the push (a planted foot keeps its contact). Returns
// the worst overlap left, metres.
export function pushOut(shape, weight = () => 1) {
  let worst = 0;
  for (const [k, limb] of Object.entries(shape.limbs)) {
    const w = weight(k);
    for (let it = 0; it < PUSH_ITERS; it++) {
      limb.pivot.updateMatrixWorld(true);
      let pen = 1e-4, at = null, obstacle = null;
      SAMPLES.forEach((f, i) => {
        pointOn(limb, f, _w);
        for (const [ok, o] of Object.entries(limb.obstacles)) {
          const need = Math.min(MARGIN, limb.rest?.[i]?.[ok] ?? MARGIN);
          const d = need - (o.dist(_w) - limb.r);
          if (d > pen) { pen = d; at = _w.clone(); obstacle = o; }
        }
      });
      if (!at) break;
      if (it === PUSH_ITERS - 1) { worst = Math.max(worst, pen); break; }
      obstacle.normal(at, _n).normalize();
      // The limb turns out along the obstacle's normal by its share; the obstacle (torso or head)
      // leans off it by the rest. A pinned limb leaves it all to the obstacle, and a leg meeting the
      // torso shares it, as a kicker leans back rather than kicking low.
      const lean = obstacle === shape.solids.torso && k.startsWith('leg') ? LEG_TORSO_LEAN * kickOf(limb.pivot)
        : obstacle === shape.solids.head && k.startsWith('arm') ? ARM_HEAD_TILT : 0;
      const share = w * (1 - lean);
      turnBy(limb.pivot, at, _n, pen * share);
      if (share < 1 && obstacle.pivot) turnBy(obstacle.pivot, at, _n.negate(), pen * (1 - share));
    }
  }
  return worst;
}
