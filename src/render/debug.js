import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE } from './palette.js';
import { mat, glow, glass } from './materials.js';
import { loadModels, getModel, PROP_NAMES, ITEM_IDS, itemModelName } from './models.js';
import { createCharacter, ANIMS } from './character.js';
import { EMOTES } from './emotes.js';
import { ROLE_COLORS } from './palette.js';
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

// Every Blender prop on a slab, labeled, with the shop items and their tiers beside it.
export function buildPropLineup(group) {
  const items = new THREE.Group();
  const ib = buildItemLineup(items);
  const perRow = 4, stepX = 3.0, stepZ = 3.0;
  const w = perRow * stepX, d = 4 * stepZ;
  // Both slabs overhang their content by 0.3; leave a clear 1 m gap between them.
  const ix = w / 2 + 0.3 + 1.0 + 0.3 + (ib.max.x - ib.min.x) / 2;
  items.position.x = ix;
  group.add(items);
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
  return new THREE.Box3(new THREE.Vector3(-w / 2, 0, ib.min.z), new THREE.Vector3(ix + ib.max.x, 2.4, ib.max.z));
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

const HAIRC = ['#2b1d16', '#4a3222', '#7a4b2a', '#c68b4e', '#e8c170', '#b8b8b8', '#1c1c24', '#a3442f'];
const SHIRTS = ['#4f8cff', '#ff7eb6', '#ffb020', '#34c38f', '#e5484d', '#9b6bff', '#f2efe6', '#2f3a4a', '#7fc8c0', '#d98c5f'];
const PANTS = ['#2e3440', '#4b5563', '#6b4f3a', '#1f3b5c', '#8a7f6a', '#3b3b46'];
const ROLES = Object.keys(ROLE_COLORS);

// Character lineup: hair, accessories and builds, skins, roles, animations, emotes and Legend.
export function buildCharLineup(group) {
  const step = 1.1, rowStep = 1.9;
  const rows = 6, cols = 9;
  const w = cols * step + 1, d = rows * rowStep;
  group.add(mesh(roundedBox(w + 0.6, 0.3, d + 0.6, 0.08), mat('slab_side'), 0, -0.15, 0));
  group.add(mesh(roundedBox(w + 0.4, 0.04, d + 0.4, 0.02), mat('floor_wood'), 0, 0.02, 0));
  group.userData.windowMaterials = [];
  const chars = [];
  group.userData.update = (dt) => { for (const c of chars) c.update(dt); };
  const at = (col, row) => [(col - (cols - 1) / 2) * step, (row - (rows - 1) / 2) * rowStep];
  const add = (col, row, app, role, setup) => {
    const c = createCharacter({ skin: 1, hair: 0, hairColor: HAIRC[1], shirt: SHIRTS[0], pants: PANTS[0], accessory: 'none', build: 1, ...app }, ROLE_COLORS[role], { role });
    const [x, z] = at(col, row);
    c.root.position.set(x, 0.04, z);
    c.root.rotation.y = Math.PI / 4;
    group.add(c.root);
    setup?.(c, x, z);
    chars.push(c);
    return c;
  };
  loadModels(['chibi', 'desk', 'chair', 'monitor']).then(() => {
    for (let i = 0; i < 8; i++) add(i, 0, { hair: i, hairColor: HAIRC[i], skin: i % 6, shirt: SHIRTS[i] }, ROLES[i % 6]);
    const accs = ['none', 'glasses', 'headphones', 'beanie', 'cap'];
    accs.forEach((a, i) => add(i, 1, { accessory: a, hair: [0, 2, 3, 1, 7][i], hairColor: HAIRC[(i + 3) % 8], shirt: SHIRTS[(i + 5) % 10], build: 1 }, 'engineer'));
    for (let b = 0; b < 3; b++) add(5 + b, 1, { build: b, hair: 5, hairColor: HAIRC[2], shirt: SHIRTS[8], pants: PANTS[b + 1] }, 'sales');
    for (let k = 0; k < 6; k++) add(k, 2, { skin: k, hair: (k * 3) % 8, hairColor: HAIRC[(k * 5) % 8], shirt: SHIRTS[(k + 2) % 10] }, ROLES[(k + 2) % 6]);
    ROLES.forEach((r, i) => add(i, 3, { hair: (i * 2 + 1) % 8, hairColor: HAIRC[i % 8], shirt: SHIRTS[(i * 3) % 10], skin: (i + 2) % 6, build: i % 3 }, r));
    ANIMS.forEach((a, i) => add(i, 4, { hair: i % 8, hairColor: HAIRC[(i + 1) % 8], shirt: SHIRTS[(i + 4) % 10], skin: (i * 2) % 6 }, ROLES[i % 6], (c, x, z) => {
      if (a === 'typing' || a === 'slumped' || a === 'burnout') {
        // Seated at a desk that faces the camera side, so the face stays visible.
        c.root.rotation.y = Math.PI / 2;
        const chair = getModel('chair');
        chair.position.set(x, 0.04, z);
        chair.rotation.y = Math.PI / 2;
        const desk = getModel('desk');
        desk.position.set(x + 0.5, 0.04, z);
        desk.rotation.y = Math.PI / 2;
        const mon = getModel('monitor');
        mon.position.set(x + 0.62, 0.66, z);
        mon.rotation.y = -Math.PI / 2;
        group.add(chair, desk, mon);
        c.root.position.x -= 0.02;
      }
      c.setAnim(a);
      if (a === 'slumped') c.setMood('coasting');
      if (a === 'burnout') c.setMood('burnout');
    }));
    EMOTES.forEach((e, i) => add(i, 5, { hair: (i + 4) % 8, hairColor: HAIRC[i % 8], shirt: SHIRTS[(i + 7) % 10], skin: (i + 1) % 6 }, ROLES[i % 6], (c) => c.setEmote(e)));
    add(8, 5, { hair: 7, hairColor: HAIRC[4], shirt: SHIRTS[5], skin: 3, accessory: 'glasses' }, 'engineer', (c) => { c.setLegend(true); c.setAnim('celebrate'); });
  });
  return new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, 1.4, d / 2));
}

// One character at four headings, for checking the face and silhouette up close.
export function buildCharTurnaround(group) {
  group.add(mesh(roundedBox(5, 0.3, 2, 0.08), mat('slab_side'), 0, -0.15, 0));
  group.add(mesh(roundedBox(4.8, 0.04, 1.8, 0.02), mat('floor_wood'), 0, 0.02, 0));
  group.userData.windowMaterials = [];
  const chars = [];
  group.userData.update = (dt) => { for (const c of chars) c.update(dt); };
  loadModels(['chibi']).then(() => {
    [0, 1, 2, 3].forEach((i) => {
      const c = createCharacter({ skin: 1, hair: 1, hairColor: HAIRC[3], shirt: SHIRTS[3], pants: PANTS[0], accessory: 'none', build: 1 }, ROLE_COLORS.designer, { role: 'designer' });
      c.root.position.set((i - 1.5) * 1.1, 0.04, 0);
      c.root.rotation.y = Math.PI / 4 + i * Math.PI / 2;
      group.add(c.root);
      chars.push(c);
    });
  });
  return new THREE.Box3(new THREE.Vector3(-2.4, 0, -0.9), new THREE.Vector3(2.4, 1.2, 0.9));
}

// Object icon board: every icon in public/icons/objects at 16, 24, and 48 px on cream and ink.
export function buildIconBoard(group, overlayEl) {
  group.userData.windowMaterials = [];
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;inset:0;z-index:50;overflow:auto;padding:16px;background:${PALETTE.wall_cream};
    display:grid;grid-template-columns:repeat(4,max-content);gap:10px 26px;align-content:start;
    font:600 13px Fredoka,sans-serif;color:${PALETTE.ink}`;
  overlayEl?.appendChild(box);
  fetch(`${import.meta.env.BASE_URL}icons/objects/manifest.json`).then((r) => r.json()).then((m) => {
    for (const [name, e] of Object.entries(m)) {
      const cell = document.createElement('div');
      cell.style.cssText = 'display:flex;gap:6px;align-items:center;width:max-content';
      for (const [bg, fg] of [[PALETTE.paper, PALETTE.ink], [PALETTE.ink, PALETTE.paper]]) {
        const p = document.createElement('div');
        p.style.cssText = `display:flex;gap:5px;align-items:center;padding:5px 7px;border-radius:9px;background:${bg};color:${fg}`;
        for (const s of [16, 24, 48]) {
          const img = document.createElement('img');
          img.src = `${import.meta.env.BASE_URL}icons/${e.file}`;
          img.width = img.height = s;
          p.appendChild(img);
        }
        cell.appendChild(p);
      }
      const t = document.createElement('span');
      t.textContent = name;
      cell.appendChild(t);
      box.appendChild(cell);
    }
  });
  return new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
}
