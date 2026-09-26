import * as THREE from 'three';

export const LANDMARKS = ['EyeLeft', 'EyeRight', 'Eye', 'Brow', 'Forehead', 'Mouth', 'Chin'];

// Read the unadorned model parts in the head pivot's frame, as character.js assembles them.
export function faceLandmarks(template) {
  const points = (name) => {
    const part = template.getObjectByName(name);
    if (!part?.geometry?.attributes.position) throw new Error(`pose: missing face geometry ${name}`);
    part.updateMatrix();
    const p = part.geometry.attributes.position;
    return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(part.matrix));
  };
  const eyes = points('eyes'), head = points('head');
  const bounds = new THREE.Box3().setFromPoints(head);
  const middle = new THREE.Box3().setFromPoints(eyes).getCenter(new THREE.Vector3());
  const halves = [eyes.filter(p => p.x < middle.x), eyes.filter(p => p.x > middle.x)];
  if (halves.some(p => !p.length)) throw new Error('pose: eyes must straddle their centre');
  const eyeBoxes = halves.map(p => new THREE.Box3().setFromPoints(p));
  const centers = eyeBoxes.map(b => b.getCenter(new THREE.Vector3()));
  const mouth = new THREE.Box3().setFromPoints(points('mouth_flat')).getCenter(new THREE.Vector3());
  const source = template.getObjectByName('head');
  const mesh = new THREE.Mesh(source.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorld.copy(source.matrix);
  const ray = new THREE.Raycaster();
  const surface = (x, y) => {
    ray.set(new THREE.Vector3(x, y, bounds.max.z + 1), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) throw new Error('pose: face landmark misses head geometry');
    return hit.point.clone();
  };
  try {
    const eye = centers.map(p => surface(p.x, p.y));
    const brow = eyeBoxes.map((b, i) => surface(centers[i].x, b.max.y));
    return {
      EyeLeft: [eye[0]], EyeRight: [eye[1]], Eye: eye, Brow: brow,
      Forehead: [surface(middle.x, (Math.max(...brow.map(p => p.y)) + bounds.max.y) / 2)],
      Mouth: [surface(mouth.x, mouth.y)], Chin: [surface(mouth.x, (mouth.y + bounds.min.y) / 2)],
    };
  } finally { mesh.material.dispose(); }
}

// Distances to points, not the entire front surface: chin contact cannot satisfy an eye rule.
export function landmarkContacts(local, matrixWorld, hands) {
  const world = Object.fromEntries(Object.entries(local).map(([name, points]) => [name, points.map(p => p.clone().applyMatrix4(matrixWorld))]));
  return Object.fromEntries(hands.flatMap((hand, h) => Object.entries(world).map(([name, points]) =>
    [`hand${h}${name}`, +Math.min(...points.map(p => hand.distanceTo(p))).toFixed(4)])));
}
