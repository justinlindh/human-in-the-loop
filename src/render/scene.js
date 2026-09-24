import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from './palette.js';

export function createSceneGraph() {
  const scene = new THREE.Scene();
  const office = new THREE.Group(); office.name = 'office';
  const actors = new THREE.Group(); actors.name = 'actors';
  const fx = new THREE.Group(); fx.name = 'fx';
  scene.add(office, actors, fx);
  return { scene, office, actors, fx };
}

// Minimal stand-in diorama used until the office module provides real stages.
export function buildTestDiorama(group) {
  const m = (k, extra = {}) => new THREE.MeshStandardMaterial({ color: PALETTE[k], roughness: 0.8, metalness: 0, ...extra });
  const add = (geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const W = 8, D = 8;
  add(new RoundedBoxGeometry(W, 0.4, D, 3, 0.08), m('slab_side'), 0, -0.2, 0);
  add(new RoundedBoxGeometry(W - 0.1, 0.06, D - 0.1, 2, 0.02), m('floor_concrete'), 0, 0.03, 0);
  add(new RoundedBoxGeometry(W, 3, 0.25, 2, 0.05), m('wall_cream'), 0, 1.5, -D / 2 + 0.125);
  add(new RoundedBoxGeometry(0.25, 3, D, 2, 0.05), m('wall_warm'), -W / 2 + 0.125, 1.5, 0);
  const win = add(new RoundedBoxGeometry(2.2, 1.2, 0.08, 2, 0.03), m('window_day', { emissive: new THREE.Color(PALETTE.window_day), emissiveIntensity: 0.4 }), 1.2, 1.8, -D / 2 + 0.27);
  win.castShadow = false;
  group.userData.windowMaterials = [win.material];
  add(new RoundedBoxGeometry(1.4, 0.08, 0.75, 2, 0.03), m('wood_honey'), -0.5, 0.72, -1);
  for (const [x, z] of [[-1.1, -1.3], [0.1, -1.3], [-1.1, -0.7], [0.1, -0.7]]) add(new RoundedBoxGeometry(0.06, 0.7, 0.06, 1, 0.02), m('metal_dark'), x, 0.35, z);
  const screen = add(new RoundedBoxGeometry(0.6, 0.38, 0.04, 2, 0.015), m('screen_bg', { emissive: new THREE.Color(PALETTE.screen_blue), emissiveIntensity: 2.2 }), -0.5, 1.05, -1.2);
  screen.castShadow = false;
  add(new RoundedBoxGeometry(0.6, 1.9, 0.6, 3, 0.05), m('plastic_charcoal'), -3.3, 0.95, -3.2);
  const led = add(new THREE.SphereGeometry(0.03, 8, 6), m('led_green', { emissive: new THREE.Color(PALETTE.led_green), emissiveIntensity: 4 }), -3.3, 1.6, -2.88);
  led.castShadow = false;
  add(new THREE.CylinderGeometry(0.22, 0.17, 0.35, 16), m('pot_terracotta'), 2.8, 0.18, -2.8);
  add(new THREE.IcosahedronGeometry(0.42, 1), m('leaf', { flatShading: true }), 2.8, 0.75, -2.8);
  add(new THREE.CapsuleGeometry(0.2, 0.35, 4, 12), m('role_engineer'), 0.6, 0.45, 0.4);
  add(new THREE.SphereGeometry(0.28, 20, 16), m('skin_1'), 0.6, 1.08, 0.4);
  return new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, 3, D / 2));
}
