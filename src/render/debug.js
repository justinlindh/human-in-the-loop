import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE } from './palette.js';
import { mat, glow, glass } from './materials.js';
import { loadModels, getModel, PROP_NAMES, ITEM_IDS, itemModelName } from './models.js';
import { roundedBox, roundedCylinder, pill, lathe, blob, mesh, mergeStatic } from './prims.js';

// Debug lineups selected by URL params (kit=1). Each builder fills a group and returns bounds.

const FAMILIES = [
  ['Structure', /^(ink|paper|wall_|baseboard|slab_|floor_|rug_)/],
  ['Furniture', /^(wood_|laminate|metal_|plastic_|fabric_|cardboard|paper_sheet|whiteboard|marker_|glass_frame|gold|mug|coffee)/],
  ['Nature', /^(leaf|pot_|soil)/],
  ['People', /^(skin_|eye|blush|role_)/],
];
const EMISSIVE = ['screen_blue', 'screen_cyan', 'screen_green', 'screen_amber', 'screen_pink', 'led_green', 'led_amber', 'led_red', 'alarm_red', 'lamp_warm', 'city_lit', 'window_day'];

function label(text, x, y, z) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `font:600 15px Fredoka, sans-serif;color:${PALETTE.ink};background:${PALETTE.paper};padding:2px 10px;border-radius:10px;box-shadow:0 2px 0 ${PALETTE.baseboard};white-space:nowrap`;
  const o = new CSS2DObject(el);
  o.position.set(x, y, z);
  return o;
}

export function buildKitBoard(group) {
  const names = Object.keys(PALETTE);
  const rows = FAMILIES.map(([title, re]) => [title, names.filter((n) => re.test(n))]);
  const COLS = 14, STEP = 1.0;
  const statics = new THREE.Group();
  let z = 0;
  const rowZ = [];
  for (const [title, list] of rows) {
    for (let i = 0; i < list.length; i++) {
      const cx = (i % COLS) * STEP, cz = z + Math.floor(i / COLS) * STEP;
      statics.add(mesh(roundedBox(0.8, 0.22, 0.8), mat(list[i]), cx, 0.11, cz));
      statics.add(mesh(new THREE.SphereGeometry(0.22, 24, 16), mat(list[i]), cx, 0.44, cz));
    }
    rowZ.push([title, z]);
    z += Math.ceil(list.length / COLS) * STEP + 0.4;
  }
  // Emissives
  for (let i = 0; i < EMISSIVE.length; i++) {
    const m = mesh(roundedBox(0.8, 0.22, 0.8), mat('plastic_charcoal'), i * STEP, 0.11, z);
    statics.add(m);
    const g = mesh(roundedBox(0.5, 0.5, 0.08), glow(EMISSIVE[i], 2), i * STEP, 0.5, z, { cast: false });
    statics.add(g);
  }
  rowZ.push(['Emissive', z]);
  z += STEP + 0.4;
  // Primitives and toon comparison
  const prims = [
    [roundedBox(0.7, 0.5, 0.7), 'wood_honey'],
    [roundedCylinder(0.3, 0.3, 0.55, 0.05), 'pot_terracotta'],
    [roundedCylinder(0.18, 0.32, 0.5, 0.04), 'pot_cream'],
    [pill(0.2, 0.3), 'role_engineer'],
    [lathe([[0, 0], [0.28, 0], [0.3, 0.05], [0.24, 0.35], [0.26, 0.5], [0, 0.5]], 24, 'kitvase'), 'fabric_teal'],
    [blob(0.3, 2, 0.14, 3), 'leaf'],
  ];
  prims.forEach(([geo, name], i) => {
    const y = geo.type === 'RoundedBoxGeometry' ? 0.25 : geo.type === 'IcosahedronGeometry' ? 0.3 : 0;
    statics.add(mesh(geo, mat(name), i * STEP, y, z));
    statics.add(mesh(geo, mat(name, { toon: true }), (i + 7) * STEP, y, z));
  });
  const pane = mesh(roundedBox(0.8, 0.8, 0.05), glass(), 13 * STEP, 0.4, z, { cast: false });
  pane.userData.dynamic = true;
  statics.add(pane);
  rowZ.push(['Primitives (standard | toon)', z]);
  z += STEP;

  const w = COLS * STEP;
  statics.add(mesh(roundedBox(w + 1, 0.3, z + 1, 0.08), mat('slab_side'), (COLS - 1) * STEP / 2, -0.15, (z - STEP) / 2));
  const merged = mergeStatic(statics);
  merged.position.set(-(COLS - 1) * STEP / 2, 0, -(z - STEP) / 2);
  group.add(merged);
  for (const [title, rz] of rowZ) group.add(label(title, -(COLS - 1) * STEP / 2 - 0.6, 0.3, rz - (z - STEP) / 2 - 0.55));
  group.userData.windowMaterials = [];
  return new THREE.Box3(new THREE.Vector3(-w / 2 - 0.5, 0, -z / 2 - 0.5), new THREE.Vector3(w / 2 + 0.5, 0.8, z / 2 + 0.5));
}

// Every Blender prop on a slab in two rows, labeled.
export function buildPropLineup(group) {
  const perRow = 4, stepX = 3.0, stepZ = 3.0;
  const w = perRow * stepX, d = 4 * stepZ;
  group.add(mesh(roundedBox(w + 0.6, 0.3, d + 0.6, 0.08), mat('slab_side'), 0, -0.15, 0));
  group.add(mesh(roundedBox(w + 0.4, 0.04, d + 0.4, 0.02), mat('floor_wood'), 0, 0.02, 0));
  group.userData.windowMaterials = [];
  loadModels().then(() => {
    PROP_NAMES.forEach((name, i) => {
      const x = (i % perRow - (perRow - 1) / 2) * stepX;
      const z = (Math.floor(i / perRow) - 1.5) * stepZ;
      const m = getModel(name);
      m.position.set(x, 0.04, z);
      group.add(m);
      group.add(label(name, x + 0.55, 0, z + 0.55));
    });
  });
  return new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, 2.4, d / 2));
}

// Every shop item: one row per item, tiers 1 to 3 left to right.
export function buildItemLineup(group) {
  const stepX = 3.2, stepZ = 2.6;
  const rows = ITEM_IDS.length;
  const w = 3 * stepX, d = rows * stepZ;
  group.add(mesh(roundedBox(w + 0.6, 0.3, d + 0.6, 0.08), mat('slab_side'), 0, -0.15, 0));
  group.add(mesh(roundedBox(w + 0.4, 0.04, d + 0.4, 0.02), mat('floor_tile'), 0, 0.02, 0));
  group.userData.windowMaterials = [];
  loadModels().then(() => {
    ITEM_IDS.forEach((id, r) => {
      for (let l = 1; l <= 3; l++) {
        const x = (l - 2) * stepX;
        const z = (r - (rows - 1) / 2) * stepZ;
        const m = getModel(itemModelName(id, l));
        m.position.set(x, 0.04, z);
        group.add(m);
        if (l === 1) group.add(label(id, x - stepX * 0.5 - 0.4, 0, z + 0.4));
      }
    });
  });
  return new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, 2.2, d / 2));
}
