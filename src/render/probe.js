import * as THREE from 'three';

// Staging probe (#350): how a character reads on screen this frame, measured from the scene.
// Shared by the readability checks (blender/checks/stage.mjs) and the scene sweep (#352).
//
// createProbe({ scene, camera, office, charOf, stagingOf }) -> { measure(id) }
//   charOf(id)     -> the character (character.js) for a staff id, or null
//   stagingOf(id)  -> what a moment says about them now (moments.js stage record), or null:
//                     { moment, beat, target: Vector3 | Object3D, held: Object3D, source: Object3D }
//
// measure(id) -> {
//   anim, beat, moment,
//   eyes: [x, y, z], forward: [x, y, z], headY,
//   gaze: { hit: 'held' | '<prop id>' | '<item id>' | 'furniture' | 'floor' | 'wall' | 'nothing', dist },
//                          // 'nothing': the line of sight meets nothing within GAZE_M
//   targetAngle,            // degrees between the face's direction and the direction to the target
//   faceCam,                // degrees between the face's direction and the direction to the camera
//   visible,                // share of sample points on the body the camera sees unblocked (0..1)
//   fadeOver,               // columns drawn faded over the character's screen box
//   hands: [[x, y, z], [x, y, z]], handsRel: hands relative to the eyes, in the face's heading
//   held: { dist, ahead } | null,   // held prop: distance from the eyes; angle off the face's direction
//   lean,                   // metres the head sits ahead of the feet toward the target (negative: away)
//   between,                // sprites of the moment's source (smoke) near the line from eyes to target
// }

const tmp = new THREE.Vector3();
const GAZE_M = 6;        // how far along the line of sight the probe looks

export function createProbe({ scene, camera, office, charOf, stagingOf = () => null }) {
  const ray = new THREE.Raycaster();
  const visCache = new Map();

  const targetPoint = (t) => (!t ? null : t.isVector3 ? t.clone() : new THREE.Box3().setFromObject(t).getCenter(new THREE.Vector3()));

  // What owns a hit mesh: the held prop, a staged prop, a placed item, or the shell.
  // (Furniture merged into the idle batch has lost which item it was: 'furniture'.)
  function labelOf(o, held) {
    for (let x = o; x; x = x.parent) {
      if (x === held) return 'held';
      if (x.userData.propId) return x.userData.propId;
      if (x.userData.placedId) return x.userData.itemId ?? x.userData.placedId;
      if (x === office.current?.furniture) return 'furniture';
    }
    return null;
  }

  // skip: objects (and their subtrees) to ignore; allow: a subtree kept even inside a skipped one.
  function opaqueHits(from, dir, far, skip, allow = null) {
    ray.set(from, dir);
    ray.far = far;
    ray.camera = camera;
    // The backdrop (surroundings.js) stands outside the office and never hides anyone in it.
    return ray.intersectObjects(scene.children.filter((o) => o.name !== 'surroundings'), true).filter((h) => {
      const m = h.object;
      if (!m.visible || m.isSprite || m.isPoints || m.isLine) return false;
      if ([].concat(m.material).some((x) => x?.transparent && x.opacity < 0.5)) return false;
      for (let x = m; x; x = x.parent) { if (x === allow) break; if (skip.has(x) || !x.visible) return false; }
      return true;
    });
  }

  function measure(id) {
    const c = charOf(id);
    if (!c) return null;
    const st = stagingOf(id) ?? {};
    const p = c.probe();
    const target = targetPoint(st.target);
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const toCam = camDir.clone().negate();
    const deg = (a, b) => THREE.MathUtils.radToDeg(a.angleTo(b));

    // Gaze: what the line of sight from the eyes meets first (not the character's own body).
    const self = new Set([c.root]);
    const hits = opaqueHits(p.eyes, p.forward, GAZE_M, self).filter((h) => h.distance > 0.02);
    let gaze = { hit: 'nothing', dist: null };
    const heldHit = st.held && opaqueHits(p.eyes, p.forward, GAZE_M, self, st.held)
      .find((h) => labelOf(h.object, st.held) === 'held');
    if (heldHit && (!hits.length || heldHit.distance <= hits[0].distance + 1e-3)) gaze = { hit: 'held', dist: +heldHit.distance.toFixed(3) };
    else if (hits.length) {
      const h = hits[0];
      gaze = { hit: labelOf(h.object, st.held) ?? (h.point.y < 0.03 ? 'floor' : 'wall'), dist: +h.distance.toFixed(3) };
    } else if (p.forward.y < -0.01 && p.eyes.y / -p.forward.y <= GAZE_M) {
      gaze = { hit: 'floor', dist: +(p.eyes.y / -p.forward.y).toFixed(3) };
    }

    // Visibility: body sample points the camera reaches before anything else. The costliest measure,
    // so it is refreshed every third call per character.
    const vc = visCache.get(id) ?? { n: 0, v: 0 };
    visCache.set(id, vc);
    c.root.updateMatrixWorld(true);
    const pts = [];
    if (vc.n++ % 3 === 0) c.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position || o.userData.pickProxy) return;
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 6));
      for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    });
    let seen = 0;
    for (const q of pts) {
      const from = q.clone().addScaledVector(toCam, 40);
      const hs = opaqueHits(from, camDir, 40.5, new Set());
      const first = hs[0];
      if (!first || first.distance >= 40 - 0.03 || self.has(ownerRoot(first.object, c.root))) seen++;
    }
    if (pts.length) vc.v = seen / pts.length;
    const visible = vc.v;

    // Columns drawn faded over the character's screen box.
    const box = new THREE.Box3().setFromObject(c.root);
    const sb = screenBox(box, camera);
    // Faded columns in front of the character (nearer the camera) whose screen box meets theirs.
    let fadeOver = 0;
    const own = camera.position.distanceTo(tmp.set(c.root.position.x, 0.5, c.root.position.z));
    for (const col of office.current?.columns ?? []) {
      if (col.fade >= 0.99 || camera.position.distanceTo(tmp.set(col.x, 0.5, col.z)) >= own) continue;
      const cb = screenBox(new THREE.Box3(new THREE.Vector3(col.x - 0.3, 0, col.z - 0.3), new THREE.Vector3(col.x + 0.3, col.h, col.z + 0.3)), camera);
      if (cb.x0 < sb.x1 && cb.x1 > sb.x0 && cb.y0 < sb.y1 && cb.y1 > sb.y0) fadeOver++;
    }

    // Hands relative to the eyes in the face's heading (x right, y up, z ahead), so walking and
    // turning drop out of the motion measures.
    const yaw = Math.atan2(p.forward.x, p.forward.z);
    const handsRel = p.hands.map((h) => h.clone().sub(p.eyes).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw));

    let held = null;
    if (st.held) {
      const hc = targetPoint(st.held);
      held = { dist: +hc.distanceTo(p.eyes).toFixed(3), ahead: +deg(p.forward, hc.clone().sub(p.eyes)).toFixed(1) };
    }

    const root = c.root.position;
    let lean = null, targetAngle = null, between = null;
    if (target) {
      targetAngle = +deg(p.forward, target.clone().sub(p.eyes)).toFixed(1);
      const flat = tmp.set(target.x - root.x, 0, target.z - root.z).normalize();
      lean = +((p.head.x - root.x) * flat.x + (p.head.z - root.z) * flat.z).toFixed(3);
      if (st.source) {
        between = 0;
        const seg = new THREE.Line3(p.eyes, target), cp = new THREE.Vector3();
        st.source.traverse((o) => {
          if (!o.isSprite || !o.visible || (o.material.opacity ?? 1) < 0.15) return;
          const w = o.getWorldPosition(new THREE.Vector3());
          seg.closestPointToPoint(w, true, cp);
          if (cp.distanceTo(w) < 0.4) between++;
        });
      }
    }

    const r3 = (v) => v.toArray().map((x) => +x.toFixed(3));
    return {
      anim: p.anim, moment: st.moment ?? null, beat: st.beat ?? null,
      eyes: r3(p.eyes), forward: r3(p.forward), headY: +p.head.y.toFixed(3),
      gaze, targetAngle, faceCam: +deg(p.forward, toCam).toFixed(1), visible: +visible.toFixed(3), fadeOver,
      hands: p.hands.map(r3), handsRel: handsRel.map(r3), held, lean, between,
    };
  }

  return { measure };
}

function ownerRoot(o, root) {
  for (let x = o; x; x = x.parent) if (x === root) return root;
  return null;
}

function screenBox(box, camera) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0, y0, x1, y1 };
}
