// Exact surface crossing for the clip checks (src/render/checks.js), installed by clip.mjs.
//
// Counting a person's sampled vertices inside furniture misses a thin slab: a head through a desk top
// has vertices above and below it and none within it. This tests triangles instead: a person's mesh
// part crosses a furniture mesh when their surfaces intersect (three-mesh-bvh), and the measure is the
// share of that part's triangles that cross, worst part first, the same scale as the vertex share.
import * as THREE from 'three';
import { MeshBVH, ExtendedTriangle } from 'three-mesh-bvh';

const bvhs = new WeakMap();
function bvhOf(geo) {
  let b = bvhs.get(geo);
  if (!b) { b = new MeshBVH(geo, { indirect: true, maxLeafSize: 8 }); bvhs.set(geo, b); }
  return b;
}

const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
const ctri = new ExtendedTriangle();

// Share of `part`'s triangles that cross `target` (0 when the meshes do not touch).
function partCross(part, target) {
  const bvh = bvhOf(target.geometry);
  rel.copy(inv.copy(target.matrixWorld).invert()).multiply(part.matrixWorld);
  if (!bvh.intersectsGeometry(part.geometry, rel)) return 0;
  const pos = part.geometry.attributes.position, idx = part.geometry.index;
  const n = idx ? idx.count / 3 : pos.count / 3;
  let hit = 0;
  const box = new THREE.Box3();
  for (let t = 0; t < n; t++) {
    const a = idx ? idx.getX(3 * t) : 3 * t, b = idx ? idx.getX(3 * t + 1) : 3 * t + 1, c = idx ? idx.getX(3 * t + 2) : 3 * t + 2;
    ctri.a.fromBufferAttribute(pos, a).applyMatrix4(rel);
    ctri.b.fromBufferAttribute(pos, b).applyMatrix4(rel);
    ctri.c.fromBufferAttribute(pos, c).applyMatrix4(rel);
    ctri.needsUpdate = true;
    box.makeEmpty().expandByPoint(ctri.a).expandByPoint(ctri.b).expandByPoint(ctri.c);
    let crossed = false;
    bvh.shapecast({
      intersectsBounds: (bx) => !crossed && bx.intersectsBox(box),
      intersectsTriangle: (tri) => { if (tri.intersectsTriangle(ctri)) { crossed = true; return true; } return false; },
    });
    if (crossed) hit++;
  }
  return n ? hit / n : 0;
}

// The worst share over a person's mesh parts passing `keep`, against the furniture meshes `targets`.
export function crossFraction(root, targets, keep = () => true) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => { if (o.isMesh && o.userData.staffId === undefined && !o.material?.transparent && o.visible && keep(o)) parts.push(o); });
  const wbox = new THREE.Box3(), tbox = new THREE.Box3();
  let worst = 0;
  for (const p of parts) {
    wbox.copy(p.geometry.boundingBox ?? (p.geometry.computeBoundingBox(), p.geometry.boundingBox)).applyMatrix4(p.matrixWorld);
    for (const t of targets) {
      if (!t.geometry.boundingBox) t.geometry.computeBoundingBox();
      tbox.copy(t.geometry.boundingBox).applyMatrix4(t.matrixWorld);
      if (!wbox.intersectsBox(tbox)) continue;
      worst = Math.max(worst, partCross(p, t));
    }
  }
  return worst;
}
