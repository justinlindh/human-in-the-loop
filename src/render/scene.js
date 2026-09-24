import * as THREE from 'three';

export function createSceneGraph() {
  const scene = new THREE.Scene();
  const office = new THREE.Group(); office.name = 'office';
  const actors = new THREE.Group(); actors.name = 'actors';
  const fx = new THREE.Group(); fx.name = 'fx';
  scene.add(office, actors, fx);
  return { scene, office, actors, fx };
}
