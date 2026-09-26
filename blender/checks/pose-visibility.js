import * as THREE from 'three';
import { faceLandmarks } from './pose-landmarks.js';

const templates = new WeakMap();
const EPSILON = 1e-4;

// Equal-weight bare-skin landmarks, in the animated head pivot's frame.
function samples(template) {
  if (!template) throw new Error('pose: face visibility requires the chibi face template');
  if (!templates.has(template)) {
    const p = faceLandmarks(template);
    templates.set(template, [
      ['eyeLeft', p.EyeLeft[0]], ['eyeRight', p.EyeRight[0]],
      ['browLeft', p.Brow[0]], ['browRight', p.Brow[1]],
      ['forehead', p.Forehead[0]], ['mouth', p.Mouth[0]], ['chin', p.Chin[0]],
    ]);
  }
  return templates.get(template);
}

function labelOf({ object, point }, R) {
  for (let o = object; o; o = o.parent) {
    if (o.userData.propId) return `prop ${o.userData.propId}`;
    if (o.userData.placedId) return `${o.userData.placedId} ${o.userData.itemId ?? ''}`.trim();
    if (o.userData.staffId != null) return String(o.userData.staffId);
    if (o.name === 'character') {
      let id = 'visitor';
      o.traverse(c => { if (c.userData.staffId != null) id = String(c.userData.staffId); });
      return id;
    }
    if (o === R.office?.current?.furniture || o.name === 'placed') {
      for (const e of R.office?.placed?.values() ?? []) {
        if (new THREE.Box3().setFromObject(e.obj).expandByScalar(0.01).containsPoint(point)) return `${e.id} ${e.itemId}`;
      }
      return 'furniture';
    }
    if (o.name === 'columns') return 'column';
    if (o.name.startsWith('wall_')) return o.name;
  }
  return object.name || `mesh ${object.id}`;
}

// Facial ink is part of the measured face, not an occluder of the skin beneath it.
// character.js attaches its active baked eyes/mouth beside the tagged head mesh.
function facialInk(o, head) {
  return o.parent === head.parent && o.name === 'baked' && o.userData.noAO && !o.userData.part;
}

export function faceVisibility(R, head, template) {
  const ray = new THREE.Raycaster();
  const meshes = [];
  R.scene.traverseVisible(o => {
    if (o.isMesh && !o.userData.pickProxy && !facialInk(o, head)) meshes.push(o);
  });
  const blocked = {};
  const points = samples(template).map(([name, local]) => {
    const world = local.clone().applyMatrix4(head.parent.matrixWorld);
    const ndc = world.clone().project(R.camera);
    const onScreen = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
    if (!onScreen) return { name, visible: false, occluder: null, onScreen };
    // Start on the near plane, so orthographic and perspective rays stop at the sample.
    const from = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(R.camera);
    ray.set(from, world.clone().sub(from).normalize());
    ray.far = from.distanceTo(world) - EPSILON;
    ray.layers.mask = R.camera.layers.mask;
    const hit = ray.intersectObjects(meshes, false).find(h => {
      const mat = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material;
      return mat?.visible !== false && !(mat?.transparent && mat.opacity < 0.5);
    });
    const occluder = hit ? labelOf(hit, R) : null;
    if (occluder) blocked[occluder] = (blocked[occluder] ?? 0) + 1;
    return { name, visible: !hit, occluder, onScreen };
  });
  return {
    faceVisible: points.filter(p => p.visible).length / points.length,
    occluder: Object.entries(blocked).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    faceSamples: points,
  };
}
