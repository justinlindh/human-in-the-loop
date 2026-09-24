import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paletteMaterial } from './materials.js';

export const PROP_NAMES = [
  'desk', 'chair', 'monitor', 'laptop', 'server_rack', 'plant_tall', 'plant_small', 'coffee_machine',
  'whiteboard', 'couch', 'bookshelf', 'garage_door', 'window_frame', 'monitoring_wall', 'water_cooler', 'trophy',
];

const loader = new GLTFLoader();
const templates = new Map();
let pending = null;

function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => paletteMaterial(m?.name) ?? m;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    const glowing = [].concat(o.material).some((m) => m.transparent || (m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() !== 0));
    o.castShadow = !glowing;
    o.receiveShadow = true;
  });
  return root;
}

function loadOne(name) {
  const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
  return loader.loadAsync(url).then(
    (gltf) => { templates.set(name, prepare(gltf.scene)); },
    (err) => { console.warn(`models: could not load ${name}: ${err?.message ?? err}`); },
  );
}

// Loads every model once; later calls return the same promise.
export function loadModels(names = [...PROP_NAMES, 'chibi']) {
  if (!pending) pending = Promise.all(names.map(loadOne)).then(() => templates);
  return pending;
}

export function hasModel(name) {
  return templates.has(name);
}

// A clone sharing geometry and palette materials. Returns an empty Group if the model is missing.
export function getModel(name) {
  const t = templates.get(name);
  if (!t) {
    const g = new THREE.Group();
    g.name = `${name}_missing`;
    return g;
  }
  const c = t.clone(true);
  c.name = name;
  return c;
}

// The template itself, for reading part geometry (characters assemble from named parts).
export function getTemplate(name) {
  return templates.get(name) ?? null;
}
