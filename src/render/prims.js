import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural building blocks. Geometries are cached by parameters and shared; never
// dispose a geometry returned from here.

const geoCache = new Map();
const cached = (key, make) => {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};
const r3 = (v) => Math.round(v * 1000) / 1000;

// Box with rounded edges. Radius defaults to 12% of the smallest side, never below 2%.
export function roundedBox(w, h, d, r = null, seg = 2) {
  const min = Math.min(w, h, d);
  const rad = Math.min(min / 2 - 1e-4, Math.max(min * 0.02, r ?? min * 0.12));
  return cached(`rb|${r3(w)}|${r3(h)}|${r3(d)}|${r3(rad)}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rad));
}

// Profile points for a lathe: a cylinder whose top and bottom rims are rounded.
function roundedCylProfile(rTop, rBot, h, bevel, steps) {
  const pts = [new THREE.Vector2(0, 0)];
  const b = Math.min(bevel, rBot * 0.9, rTop * 0.9, h / 2);
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rBot - b + Math.cos(a) * b, b + Math.sin(a) * b));
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rTop - b + Math.cos(a) * b, h - b + Math.sin(a) * b));
  }
  pts.push(new THREE.Vector2(0, h));
  return pts;
}

// Cylinder with rounded rims, base at y = 0.
export function roundedCylinder(rTop, rBot, h, bevel = 0.02, radial = 24) {
  return cached(`rc|${r3(rTop)}|${r3(rBot)}|${r3(h)}|${r3(bevel)}|${radial}`, () => {
    const g = new THREE.LatheGeometry(roundedCylProfile(rTop, rBot, h, bevel, 3), radial);
    g.computeVertexNormals();
    return g;
  });
}

// Capsule standing on y = 0, total height len + 2r.
export function pill(r, len, radial = 16) {
  return cached(`pill|${r3(r)}|${r3(len)}|${radial}`, () => {
    const g = new THREE.CapsuleGeometry(r, len, 6, radial);
    g.translate(0, len / 2 + r, 0);
    return g;
  });
}

// Lathe from [[x, y], ...] profile points, base at y = 0.
export function lathe(points, radial = 24, key = null) {
  const make = () => {
    const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), radial);
    g.computeVertexNormals();
    return g;
  };
  return key ? cached(`lathe|${key}|${radial}`, make) : make();
}

// Smooth blob for foliage: icosphere with low-frequency noise pushed along the normal.
export function blob(radius, detail = 2, wobble = 0.12, seed = 1) {
  return cached(`blob|${r3(radius)}|${detail}|${r3(wobble)}|${seed}`, () => {
    const g = new THREE.IcosahedronGeometry(radius, detail);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 7.1 + seed) * Math.cos(v.y * 6.3 + seed * 2) * Math.sin(v.z * 5.7 + seed * 3);
      v.multiplyScalar(1 + n * wobble);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

// Mesh helper: geometry + material placed at (x, y, z), shadows on.
export function mesh(geo, material, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Merge every static mesh under root into one mesh per material. Anything flagged
// userData.dynamic (and its whole subtree), non-mesh objects (lights, labels), and multi-material
// meshes are kept as separate objects. Invisible meshes are dropped. Returns a new Group.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const keep = [];
  const visit = (o) => {
    if (o !== root && (o.userData.dynamic || !o.isMesh && !o.isGroup && o.type !== 'Object3D')) { keep.push(o); return; }
    if (o.isMesh) {
      if (!o.visible) return;
      if (Array.isArray(o.material)) { keep.push(o); return; }
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) { b = { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] }; buckets.set(key, b); }
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      b.geos.push(g);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  const out = new THREE.Group();
  out.name = `${root.name || 'static'}_merged`;
  for (const b of buckets.values()) {
    const g = mergeGeometries(b.geos, false);
    for (const x of b.geos) x.dispose();
    if (!g) { console.warn(`mergeStatic: could not merge ${b.geos.length} geometries for ${b.material.name}`); continue; }
    g.userData.merged = true;
    const m = new THREE.Mesh(g, b.material);
    m.castShadow = b.cast; m.receiveShadow = b.receive;
    out.add(m);
  }
  for (const o of keep) {
    const world = o.matrixWorld.clone();
    o.removeFromParent();
    new THREE.Matrix4().multiplyMatrices(inv, world).decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

// Merges the given meshes into one mesh per material (and shadow flags), in `root`'s space.
// The inputs are left untouched so they can be shown again when the batch is dropped.
export function batchMeshes(meshes, root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  for (const o of meshes) {
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) { b = { material: o.material, cast: o.castShadow, receive: o.receiveShadow, noAO: !!o.userData.noAO, geos: [] }; buckets.set(key, b); }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    b.geos.push(g);
  }
  const out = new THREE.Group();
  out.name = 'batch';
  for (const b of buckets.values()) {
    const g = mergeGeometries(b.geos, false);
    for (const x of b.geos) x.dispose();
    if (!g) continue;
    const m = new THREE.Mesh(g, b.material);
    m.castShadow = b.cast; m.receiveShadow = b.receive;
    if (b.noAO) m.userData.noAO = true;
    out.add(m);
  }
  return out;
}
