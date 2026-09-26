import * as THREE from 'three';

export const HELD_READ_MEASURES = ['heldPalmGap', 'heldSupportGap', 'heldHeadDistance', 'heldHeadJoint', 'heldHandleVisible', 'heldHeadVisible', 'heldShaftProjection', 'heldHeadCross', 'heldScreenDistance'];

// A named shaft and head let a scene distinguish a held hammer from a nearby dark block.
export function measureHeldRead(R, id, pose = null) {
  const empty = Object.fromEntries(HELD_READ_MEASURES.map((k) => [k, null]));
  const prop = R.moments?.staging?.(id)?.held;
  const handle = prop?.getObjectByName('hammer-handle'), head = prop?.getObjectByName('hammer-head');
  const hands = (pose ?? R.probe(id))?.hands;
  if (!handle || !head || !hands?.length) return empty;
  for (const part of [handle, head]) for (let o = part; o; o = o.parent) if (!o.visible) return empty;
  const v = (a) => new THREE.Vector3(...a);
  const primary = prop.userData.primaryHand ?? 1;
  const palm = v(hands[primary]), support = v(hands[1 - primary]);
  handle.geometry.computeBoundingBox();
  const bounds = handle.geometry.boundingBox;
  const localPalm = handle.worldToLocal(palm.clone());
  const grip = handle.localToWorld(new THREE.Vector3(0, Math.max(bounds.min.y, Math.min(bounds.max.y, localPalm.y)), 0));
  const shaftEnd = handle.localToWorld(new THREE.Vector3(0, bounds.min.y, 0));
  const end = head.getWorldPosition(new THREE.Vector3());
  const axis = end.clone().sub(grip), length = axis.length();
  const near = grip.clone().addScaledVector(axis, Math.max(0, Math.min(1, support.clone().sub(grip).dot(axis) / axis.lengthSq())));
  const camera = R.camera, dir = camera.getWorldDirection(new THREE.Vector3());
  const ray = new THREE.Raycaster();
  ray.camera = camera;
  const belongs = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };
  const visible = (points, part) => points.filter((point) => {
    const ndc = point.clone().project(camera);
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || Math.abs(ndc.z) > 1) return false;
    ray.set(point.clone().addScaledVector(dir, -40), dir); ray.far = 40;
    const hit = ray.intersectObjects(R.scene.children.filter((o) => o.name !== 'surroundings'), true).find((h) => {
      if (!h.object.isMesh || h.object.userData.pickProxy) return false;
      for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
      return ![].concat(h.object.material).some((m) => m.transparent && m.opacity < 0.5);
    });
    return !hit || belongs(hit.object, part) || hit.distance >= 39.995;
  }).length / points.length;
  const shaftPoints = Array.from({ length: 9 }, (_, i) => grip.clone().lerp(end, (i + 1) / 10));
  head.geometry.computeBoundingBox();
  const box = head.geometry.boundingBox;
  const headPoints = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) headPoints.push(head.localToWorld(new THREE.Vector3(x, y, z)));
  // Camera-plane lengths keep the bounds independent of zoom and viewport size.
  const planar = (d) => d.clone().addScaledVector(dir, -d.dot(dir));
  const shaft = planar(axis), side = new THREE.Vector3().crossVectors(dir, shaft).normalize();
  const cross = headPoints.map((p) => p.clone().sub(end).dot(side));
  return {
    heldPalmGap: palm.distanceTo(grip), heldSupportGap: support.distanceTo(near),
    heldHeadDistance: palm.distanceTo(end), heldHeadJoint: end.distanceTo(shaftEnd), heldHandleVisible: visible(shaftPoints, handle),
    heldHeadVisible: visible(headPoints, head), heldShaftProjection: shaft.length() / length,
    heldHeadCross: (Math.max(...cross) - Math.min(...cross)) / shaft.length(),
    heldScreenDistance: planar(end.clone().sub(palm)).length(),
  };
}

