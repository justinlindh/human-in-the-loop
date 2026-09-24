import * as THREE from 'three';

export function createSceneGraph() {
  const scene = new THREE.Scene();
  // World matrices update once per frame in the renderer's render(), before its passes; left on,
  // the scene pass and the label pass would each walk the whole graph again.
  scene.matrixWorldAutoUpdate = false;
  const office = new THREE.Group(); office.name = 'office';
  const actors = new THREE.Group(); actors.name = 'actors';
  const fx = new THREE.Group(); fx.name = 'fx';
  scene.add(office, actors, fx);
  return { scene, office, actors, fx };
}
