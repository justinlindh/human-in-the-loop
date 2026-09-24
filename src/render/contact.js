import * as THREE from 'three';

// Resting contact: how far a posed character has sunk into a piece of furniture. For each sampled
// vertex that is inside the furniture (both an upward and a downward ray cross it an odd number of
// times), the depth is the distance up to where the ray leaves it. The largest depth is how much to
// lift the character so it lies on the surface instead of in it.

const ray = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export function furnitureMeshes(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position && !o.material?.transparent) out.push(o); });
  return out;
}

// parts: only these body parts (userData.part, e.g. ['head']) count; soft furniture lets the rest sink.
export function sinkDepth(charRoot, targets, { step = 3, max = 0.6, parts = null } = {}) {
  charRoot.updateMatrixWorld(true);
  for (const t of targets) t.updateMatrixWorld(true);
  const sides = targets.map((m) => m.material.side);
  for (const m of targets) m.material.side = THREE.DoubleSide;
  let depth = 0;
  const v = new THREE.Vector3();
  charRoot.traverse((o) => {
    if (!o.isMesh || !o.visible || o.material?.transparent || o.userData.staffId !== undefined) return;
    if (parts && !parts.includes(o.userData.part)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += step) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      ray.set(v, UP);
      const up = ray.intersectObjects(targets, false);
      if (up.length % 2 === 0) continue;
      ray.set(v, DOWN);
      if (ray.intersectObjects(targets, false).length % 2 === 0) continue;
      depth = Math.max(depth, Math.min(max, up[0].distance));
    }
  });
  targets.forEach((m, i) => { m.material.side = sides[i]; });
  return depth;
}
