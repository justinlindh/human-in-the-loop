import * as THREE from 'three';
import { MeshBVH, StaticGeometryGenerator, acceleratedRaycast } from 'three-mesh-bvh';

const worldCache = new WeakMap();
const pairCache = new WeakMap();
const identity = new THREE.Matrix4();
const directions = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
const raycastMeshes = new WeakSet();

function accelerate(mesh) {
  if (raycastMeshes.has(mesh) || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.morphTargetInfluences) return;
  const g = mesh.geometry;
  if (!g?.attributes.position || g.morphAttributes.position || (g.index?.count ?? g.attributes.position.count) / 3 < 64) return;
  g.boundsTree ??= new MeshBVH(g, { indirect: true });
  mesh.raycast = acceleratedRaycast;
  raycastMeshes.add(mesh);
}

export function worldMesh(mesh) {
  const previous = worldCache.get(mesh);
  const dynamic = mesh.isSkinnedMesh || mesh.morphTargetInfluences;
  const positionVersion = mesh.geometry.attributes.position.version, indexVersion = mesh.geometry.index?.version;
  if (previous && !dynamic && previous.source === mesh.geometry && previous.positionVersion === positionVersion && previous.indexVersion === indexVersion && previous.matrix.equals(mesh.matrixWorld)) return previous;
  let geometry;
  if (dynamic) {
    const generator = new StaticGeometryGenerator([mesh]);
    generator.attributes = ['position'];
    geometry = generator.generate();
  } else geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  const result = { geometry, source: mesh.geometry, positionVersion, indexVersion, matrix: mesh.matrixWorld.clone(), bvh: new MeshBVH(geometry, { indirect: true }) };
  geometry.boundsTree = result.bvh;
  previous?.geometry.dispose();
  worldCache.set(mesh, result);
  return result;
}

function inside(point, target) {
  if (!target.geometry.boundingBox.containsPoint(point)) return false;
  return directions.every(direction => {
    const distances = target.bvh.raycast(new THREE.Ray(point, direction), THREE.DoubleSide).map(h => h.distance).sort((a, b) => a - b);
    let count = 0, last = -Infinity;
    for (const distance of distances) if (distance - last > 1e-7) { count++; last = distance; }
    return count % 2 === 1;
  });
}

// Vertex witnesses are a lower bound, not a minimum translation distance for arbitrary solids.
function witnessDepth(source, target) {
  const positions = source.geometry.attributes.position;
  const point = new THREE.Vector3();
  let depth = 0;
  for (let i = 0, stride = Math.max(1, Math.ceil(positions.count / 1500)); i < positions.count; i += stride) {
    point.fromBufferAttribute(positions, i);
    if (inside(point, target)) depth = Math.max(depth, target.bvh.closestPointToPoint(point)?.distance ?? 0);
  }
  return depth;
}

export function meshContact(a, b, { clearance = false } = {}) {
  const A = worldMesh(a), B = worldMesh(b);
  let pairs = pairCache.get(a);
  if (!pairs) { pairs = new WeakMap(); pairCache.set(a, pairs); }
  const previous = pairs.get(b);
  if (previous?.A === A && previous?.B === B && (!clearance || previous.clearance)) return previous.result;
  const boxesMeet = A.geometry.boundingBox.intersectsBox(B.geometry.boundingBox);
  const surfaceCrossing = boxesMeet && A.bvh.intersectsGeometry(B.geometry, identity);
  const point = mesh => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 0);
  const containment = boxesMeet && !surfaceCrossing && (inside(point(A), B) || inside(point(B), A));
  const intersects = surfaceCrossing || containment;
  const result = { intersects, surfaceCrossing, containment,
    depthM: null, depthStatus: 'general-solid-depth-unavailable',
    vertexDepthLowerBoundM: intersects ? Math.max(witnessDepth(A, B), witnessDepth(B, A)) : 0,
    clearanceM: intersects ? 0 : clearance ? A.bvh.closestPointToGeometry(B.geometry, identity)?.distance ?? null : null };
  pairs.set(b, { A, B, clearance, result });
  return result;
}

export function castLandmark(scene, camera, world, { exclude = () => false, identify = o => o.name } = {}) {
  const ndc = world.clone().project(camera);
  const onScreen = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
  const origin = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera);
  const ray = new THREE.Raycaster(origin, world.clone().sub(origin).normalize(), 0, origin.distanceTo(world) - 1e-4);
  ray.layers.mask = camera.layers.mask;
  const meshes = [];
  scene.traverseVisible(o => { if (o.isMesh && !o.userData.pickProxy && !exclude(o)) { accelerate(o); meshes.push(o); } });
  const hit = onScreen ? ray.intersectObjects(meshes, false).find(h => {
    const material = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material;
    return material?.visible !== false && !(material?.transparent && material.opacity < 0.5);
  }) : null;
  return { point: world.toArray(), origin: origin.toArray(), onScreen, visible: onScreen && !hit,
    blocker: hit ? identify(hit.object) : null, distanceM: hit?.distance ?? null };
}
