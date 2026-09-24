import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paletteMaterial } from './materials.js';

export const PROP_NAMES = [
  'desk', 'chair', 'monitor', 'laptop', 'server_rack', 'plant_tall', 'plant_small', 'coffee_machine',
  'whiteboard', 'couch', 'bookshelf', 'garage_door', 'window_frame', 'monitoring_wall', 'water_cooler', 'trophy', 'kitchenette', 'ping_pong_table', 'foosball', 'balloons', 'waffle_station',
];

export const ITEM_IDS = [
  'espresso', 'plant_wall', 'nap_pod', 'arcade', 'standing_desk', 'trophy_case', 'server_rack', 'library',
  'monitoring_wall', 'whiteboard_wall',
];
export const itemModelName = (itemId, level) => `${itemId}_l${Math.max(1, Math.min(3, level | 0))}`;
const ITEM_MODELS = ITEM_IDS.flatMap((id) => [1, 2, 3].map((l) => itemModelName(id, l)));

const loader = new GLTFLoader();
const templates = new Map();
const pending = new Map();

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
  let p = pending.get(name);
  if (!p) {
    const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
    p = loader.loadAsync(url).then(
      (gltf) => { gltf.scene.userData.clips = gltf.animations; templates.set(name, prepare(gltf.scene)); },
      (err) => { console.warn(`models: could not load ${name}: ${err?.message ?? err}`); },
    );
    pending.set(name, p);
  }
  return p;
}

// Loads each named model once (cached per name) and resolves when all of them are ready.
export function loadModels(names = [...PROP_NAMES, ...ITEM_MODELS, 'chibi', 'chibi_rig', 'pets']) {
  return Promise.all(names.map(loadOne)).then(() => templates);
}

export function hasModel(name) {
  return templates.has(name);
}

// A clone sharing geometry and palette materials. Returns an empty Group if the model is missing.
// Materials are shared across every clone (all LEDs share one, all screens share one): to drive
// one instance, assign a new material to that clone's mesh; never mutate the shared material.
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
