import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { mat, color, paletteMaterial, setGlowBase } from './materials.js';
import { roundedBox, roundedCylinder, mesh, mergeStatic } from './prims.js';
import { getModel, hasModel, itemModelName } from './models.js';
import { stageLayout, createNav, placedTransform, footprint } from './layout.js';

const T = 0.2;            // wall thickness
const SLAB = 0.35;        // floor slab thickness
const WALL_KEYS = ['x', 'z', 'px', 'pz'];
const OUTWARD = { x: [-1, 0], z: [0, -1], px: [1, 0], pz: [0, 1] };

// Tileable floor and wall textures, drawn once per kind.
const texCache = new Map();
function canvasTex(key, size, draw, repeat) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.userData.repeat = repeat;
  texCache.set(key, t);
  return t;
}

function speckle(ctx, s, n, colors, r = 1.2, seed = 1) {
  let k = seed;
  const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.25 + rnd() * 0.35;
    ctx.beginPath();
    ctx.arc(rnd() * s, rnd() * s, r * (0.5 + rnd()), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const FLOORS = {
  concrete: () => canvasTex('concrete', 256, (ctx, s) => {
    ctx.fillStyle = P.floor_concrete; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, [P.floor_concrete_dark, '#c8c1b6', '#a59c90'], 1.4, 7);
    ctx.strokeStyle = P.floor_concrete_dark; ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.globalAlpha = 1;
  }, 3),
  carpet: () => canvasTex('carpet', 256, (ctx, s) => {
    const h = s / 2;
    [[0, 0], [1, 1]].forEach(([a, b]) => { ctx.fillStyle = P.floor_carpet; ctx.fillRect(a * h, b * h, h, h); });
    [[1, 0], [0, 1]].forEach(([a, b]) => { ctx.fillStyle = P.floor_carpet_alt; ctx.fillRect(a * h, b * h, h, h); });
    speckle(ctx, s, 1600, ['#8b92a0', '#b3b8c2'], 0.9, 3);
    ctx.strokeStyle = '#868d9a'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
    for (const v of [0, h]) { ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, s); ctx.moveTo(0, v); ctx.lineTo(s, v); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }, 2),
  tile: () => canvasTex('tile', 256, (ctx, s) => {
    ctx.fillStyle = P.floor_tile; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = P.floor_tile_alt;
    ctx.fillRect(0, 0, s / 2, s / 2); ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
    ctx.strokeStyle = '#c9bfae'; ctx.lineWidth = 3;
    for (const v of [0, s / 2]) { ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, s); ctx.moveTo(0, v); ctx.lineTo(s, v); ctx.stroke(); }
  }, 1.6),
  wood: () => canvasTex('wood', 256, (ctx, s) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 3 === 0 ? P.floor_wood_dark : P.floor_wood;
      ctx.fillRect(0, (i * s) / n, s, s / n);
      ctx.fillStyle = '#b88352';
      ctx.fillRect(((i * 97) % s), (i * s) / n, 2, s / n);
    }
    ctx.strokeStyle = '#b07d4c'; ctx.lineWidth = 1.5;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(0, (i * s) / n); ctx.lineTo(s, (i * s) / n); ctx.stroke(); }
  }, 2.4),
};

const WALLS = {
  block: () => canvasTex('block', 256, (ctx, s) => {
    ctx.fillStyle = '#e4dccd'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#cfc4b1'; ctx.lineWidth = 3;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = (r * s) / rows;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
      const off = r % 2 ? s / 4 : 0;
      for (let x = off; x < s; x += s / 2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s / rows); ctx.stroke(); }
    }
    speckle(ctx, s, 300, ['#d3c9b8'], 1, 5);
  }, 1.6),
};

function surfaceMat(key, colorName, tex) {
  const cacheKey = `surf|${key}`;
  let m = texCache.get(cacheKey);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffffff'), map: tex ?? null, roughness: 0.85, metalness: 0 });
  if (!tex) m.color.copy(color(colorName));
  texCache.set(cacheKey, m);
  return m;
}

// A plane lying on the floor with world-scaled UVs so tiles stay square.
function floorPlane(w, d, material, y = 0.001) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const rep = material.map?.userData.repeat ?? 1;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / rep, uv.getY(i) * d / rep);
  const m = new THREE.Mesh(g, material);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function place(obj, x, y, z, rotY = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = rotY;
  return obj;
}

// Wall `key` built as solid segments around its openings. Returns a group in world space.
function buildWall(L, key, wallMat) {
  const g = new THREE.Group();
  g.name = `wall_${key}`;
  const alongX = key === 'z' || key === 'pz';
  const len = alongX ? L.W : L.D + 2 * T;
  const H = L.wallH;
  const openings = L.openings.filter((o) => o.wall === key).sort((a, b) => a.at - b.at);
  const cap = mat('slab_edge');
  const base = mat('baseboard');
  const seg = (a, b, y0, y1) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    const c = (a + b) / 2, l = b - a, h = y1 - y0;
    const m = new THREE.Mesh(roundedBox(alongX ? l : T, h, alongX ? T : l, 0.01, 1), wallMat);
    const off = alongX ? [c, 0] : [0, c];
    m.position.set(off[0], y0 + h / 2, off[1]);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  };
  let cur = -len / 2;
  for (const o of openings) {
    const a = o.at - o.width / 2, b = o.at + o.width / 2;
    seg(cur, a, 0, H);
    seg(a, b, 0, o.bottom);
    seg(a, b, o.top, H);
    cur = b;
  }
  seg(cur, len / 2, 0, H);
  // Dark cap on the cut top edge and a baseboard on the inner face.
  const capM = new THREE.Mesh(roundedBox(alongX ? len : T + 0.02, 0.04, alongX ? T + 0.02 : len, 0.01, 1), cap);
  capM.position.y = H + 0.02;
  g.add(capM);
  let bcur = -len / 2;
  const doors = openings.filter((o) => o.bottom === 0);
  const inward = -OUTWARD[key][alongX ? 1 : 0] * (T / 2 + 0.012);
  const addBase = (a, b) => {
    if (b - a < 0.05) return;
    const bm = new THREE.Mesh(roundedBox(alongX ? b - a : 0.025, 0.1, alongX ? 0.025 : b - a, 0.008, 1), base);
    bm.position.set(alongX ? (a + b) / 2 : inward, 0.05, alongX ? inward : (a + b) / 2);
    g.add(bm);
  };
  for (const o of doors) { addBase(bcur, o.at - o.width / 2); bcur = o.at + o.width / 2; }
  addBase(bcur, len / 2);
  if (key === 'x') g.position.x = -L.W / 2 - T / 2;
  if (key === 'px') g.position.x = L.W / 2 + T / 2;
  if (key === 'z') g.position.z = -L.D / 2 - T / 2;
  if (key === 'pz') g.position.z = L.D / 2 + T / 2;
  return g;
}

// Rotation that turns a model's +Z front toward the room for a given wall.
const WALL_ROT = { x: Math.PI / 2, z: 0, px: -Math.PI / 2, pz: Math.PI };

function openingModel(L, o, screens) {
  const wx = o.wall === 'x' ? -L.W / 2 - T / 2 : o.wall === 'px' ? L.W / 2 + T / 2 : o.at;
  const wz = o.wall === 'z' ? -L.D / 2 - T / 2 : o.wall === 'pz' ? L.D / 2 + T / 2 : o.at;
  const rot = WALL_ROT[o.wall];
  if (o.kind === 'window') {
    const m = getModel('window_frame');
    m.scale.set(o.width / 1.6, (o.top - o.bottom) / 1.3, 1);
    place(m, wx, o.bottom, wz, rot);
    m.traverse((c) => { if (c.isMesh && c.name.startsWith('window_glass')) { c.material = screens.windowMaterial(); c.castShadow = false; } });
    return m;
  }
  if (o.kind === 'garage') {
    const m = getModel('garage_door');
    m.scale.set(o.width / 2.64, (o.top) / 2.09, 1);
    return place(m, wx, 0, wz, rot);
  }
  // Plain door: frame, leaf, knob.
  const g = new THREE.Group();
  const h = o.top, w = o.width;
  const frame = mat('wood_light');
  g.add(mesh(roundedBox(0.08, h, T + 0.06, 0.015), frame, -w / 2 + 0.04, h / 2, 0));
  g.add(mesh(roundedBox(0.08, h, T + 0.06, 0.015), frame, w / 2 - 0.04, h / 2, 0));
  g.add(mesh(roundedBox(w, 0.08, T + 0.06, 0.015), frame, 0, h - 0.04, 0));
  g.add(mesh(roundedBox(w - 0.16, h - 0.1, 0.05, 0.02), mat('wood_honey'), 0, (h - 0.1) / 2, -0.02));
  g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), mat('metal_soft'), w / 2 - 0.22, 1.0, 0.03));
  g.add(mesh(roundedBox(1.0, 0.02, 0.6, 0.01), mat('rug_teal'), 0, 0.01, 0.45, { cast: false }));
  return place(g, wx, 0, wz, rot);
}

// Furniture ids the sim may use for the same thing, mapped to how the renderer builds it.
const KIND = {
  desk: 'desk', desk_set: 'desk', meeting_table: 'meeting', meeting: 'meeting', whiteboard: 'whiteboard',
  coffee_corner: 'coffee', coffee: 'coffee', kitchenette: 'coffee', plant: 'plant', plants: 'plant', plant_tall: 'plant',
  bookshelf: 'bookshelf', couch: 'couch', sofa: 'couch', rack: 'rack',
};
export const kindOf = (itemId) => KIND[itemId] ?? itemId;
const FREE_STANDING = new Set(['desk', 'meeting', 'plant', 'couch']);
const LOUNGE = new Set(['couch', 'nap_pod', 'arcade', 'library', 'plant_wall', 'bookshelf']);

// Desk sets face -Z at rot 0: desk in the back tile row, chair and sitter in the front row.
const DESK_Z = -0.35;
const SEAT_Z = 0.2;

function deskSet(i, stageIdx, screens) {
  const g = new THREE.Group();
  const desk = getModel('desk');
  desk.scale.x = 1.15;
  g.add(place(desk, 0, 0, DESK_Z));
  const chair = place(getModel('chair'), 0, 0, SEAT_Z + 0.05, Math.PI);
  g.add(chair);
  const laptop = stageIdx === 0;
  const mon = place(getModel(laptop ? 'laptop' : 'monitor'), 0, 0.62, laptop ? DESK_Z + 0.02 : DESK_Z - 0.14);
  g.add(mon);
  let screen = null;
  mon.traverse((c) => {
    if (c.isMesh && c.name.endsWith('_screen')) {
      if (screens) c.material = screens.deskMaterial(i);
      c.userData.dynamic = true;
      screen = c;
    }
  });
  const side = i % 2 ? 1 : -1;
  if (i % 3 === 0) g.add(mesh(roundedCylinder(0.04, 0.035, 0.09, 0.008, 12), mat('mug'), side * 0.5, 0.62, DESK_Z + 0.1));
  if (i % 4 === 1) {
    const p = mesh(roundedBox(0.22, 0.03, 0.3, 0.006), mat('paper_sheet'), -side * 0.48, 0.635, DESK_Z + 0.08);
    p.rotation.y = 0.2;
    g.add(p);
  }
  if (i % 5 === 2) {
    const pl = getModel('plant_small');
    pl.scale.setScalar(0.45);
    g.add(place(pl, side * 0.55, 0.62, DESK_Z - 0.12));
  }
  g.userData.screen = screen;
  return g;
}

function meetingTable(w, h) {
  const g = new THREE.Group();
  const L = Math.max(1.2, w - 1.1), D = Math.max(0.8, Math.min(1.0, h - 1.1));
  g.add(mesh(roundedBox(L, 0.06, D, 0.025), mat('wood_light'), 0, 0.66, 0));
  for (const sx of [-1, 1]) g.add(mesh(roundedCylinder(0.06, 0.1, 0.63, 0.01), mat('metal_dark'), sx * (L / 2 - 0.35), 0, 0));
  g.add(mesh(roundedBox(0.3, 0.02, 0.22, 0.008), mat('paper_sheet'), -0.3, 0.7, 0.1));
  g.add(mesh(roundedBox(0.34, 0.02, 0.24, 0.008), mat('metal_soft'), 0.35, 0.7, -0.1));
  // Chairs stay separate so a standup can tuck them under the table.
  const chairs = [];
  const per = Math.max(1, Math.floor(L / 0.85));
  for (const sz of [-1, 1]) {
    for (let k = 0; k < per; k++) {
      const x = (k - (per - 1) / 2) * (L / per);
      const z = sz * (D / 2 + 0.33);
      const ch = place(getModel('chair'), x, 0, z, sz < 0 ? 0 : Math.PI);
      ch.userData.dynamic = true;
      ch.userData.home = new THREE.Vector3(x, 0, z);
      ch.userData.tucked = new THREE.Vector3(x, 0, sz * (D / 2 - 0.05));
      g.add(ch);
      chairs.push(ch);
    }
  }
  g.userData.chairs = chairs;
  g.userData.table = { L, D };
  return g;
}

// A plain crate in the footprint so an item the renderer has no model for still shows up.
function crate(w, h) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(w - 0.3, 0.6, h - 0.3, 0.05), mat('cardboard'), 0, 0.3, 0));
  return g;
}

function screensFor(obj, screens, seed) {
  if (!screens) return;
  obj.traverse((c) => {
    if (!c.isMesh || !c.name.endsWith('_screen')) return;
    c.userData.dynamic = true;
    if (c.name.startsWith('wall_screen')) c.material = screens.wallMaterial();
    else if (c.name.startsWith('arcade')) c.material = screens.material('game', seed);
    else c.material = screens.material('code', seed + 1);
  });
}

// The model for a placed item in its local frame: origin at the footprint center, front toward +Z.
export function buildPlacedModel(p, stageIdx, screens = null, seed = 0) {
  const kind = kindOf(p.itemId);
  const f = footprint(p.itemId, 0);
  let inner;
  if (kind === 'desk') inner = deskSet(seed, stageIdx, screens);
  else if (kind === 'meeting') inner = meetingTable(f.w, f.h);
  else if (kind === 'whiteboard') inner = getModel('whiteboard');
  else if (kind === 'coffee') inner = getModel('kitchenette');
  else if (kind === 'plant') inner = getModel('plant_tall');
  else if (kind === 'bookshelf') inner = getModel('bookshelf');
  else if (kind === 'couch') inner = getModel('couch');
  else if (kind === 'rack') inner = getModel('server_rack');
  else if (hasModel(itemModelName(p.itemId, p.level))) inner = getModel(itemModelName(p.itemId, p.level));
  else inner = crate(f.w, f.h);
  if (kind !== 'desk') screensFor(inner, screens, seed);
  if (!FREE_STANDING.has(kind)) {
    // Wall pieces sit against the back edge of their footprint, centered along it.
    const b = new THREE.Box3().setFromObject(inner);
    inner.position.x -= (b.min.x + b.max.x) / 2;
    inner.position.z += -f.h / 2 + 0.06 - b.min.z;
  }
  const g = new THREE.Group();
  g.add(inner);
  g.userData.kind = kind;
  g.userData.chairs = inner.userData.chairs ?? [];
  g.userData.table = inner.userData.table ?? null;
  g.userData.screen = inner.userData.screen ?? null;
  return g;
}

// Builds one stage shell: slab, floor, walls, windows, and the door. Furniture is placed separately.
function buildStage(stageIdx, screens) {
  const L = stageLayout(stageIdx);
  const root = new THREE.Group();
  root.name = `stage_${stageIdx}`;
  const statics = new THREE.Group();

  statics.add(mesh(roundedBox(L.W + 2 * T + 0.3, SLAB, L.D + 2 * T + 0.3, 0.08, 3), mat('slab_side'), 0, -SLAB / 2, 0));
  statics.add(mesh(roundedBox(L.W + 2 * T + 0.34, 0.06, L.D + 2 * T + 0.34, 0.03, 2), mat('slab_edge'), 0, -SLAB + 0.03, 0));
  if (L.floor === 'twotone') {
    const split = L.split;
    statics.add(floorPlane(split + L.W / 2, L.D, surfaceMat('wood', null, FLOORS.wood())).translateX((split - L.W / 2) / 2));
    statics.add(floorPlane(L.W / 2 - split, L.D, surfaceMat('tile', null, FLOORS.tile())).translateX((split + L.W / 2) / 2));
    statics.add(mesh(roundedBox(0.06, 0.012, L.D, 0.004, 1), mat('metal_soft'), split, 0.004, 0, { cast: false }));
  } else {
    statics.add(floorPlane(L.W, L.D, surfaceMat(L.floor, null, FLOORS[L.floor]())));
  }

  const wallMat = L.wall === 'block' ? surfaceMat('block', null, WALLS.block()) : mat(L.wall === 'sage' ? 'wall_sage' : 'wall_cream');
  const walls = {};
  for (const key of WALL_KEYS) {
    const wg = buildWall(L, key, wallMat);
    for (const o of L.openings.filter((op) => op.wall === key)) {
      const m = openingModel(L, o, screens);
      m.position.sub(wg.position);
      wg.add(m);
    }
    walls[key] = wg;
  }

  root.add(mergeStatic(statics));
  for (const key of WALL_KEYS) {
    const merged = mergeStatic(walls[key]);
    merged.position.copy(walls[key].position);
    merged.name = `wall_${key}`;
    walls[key] = merged;
    root.add(merged);
  }
  const furniture = new THREE.Group();
  furniture.name = 'placed';
  root.add(furniture);

  return {
    stage: stageIdx, L, root, walls, furniture,
    desks: [], zones: { door: inward(L) }, dyn: { screens: [], racks: [], wallScreens: [], meetingChairs: [] },
    bounds: new THREE.Box3(new THREE.Vector3(-L.W / 2 - T, 0, -L.D / 2 - T), new THREE.Vector3(L.W / 2 + T, L.wallH, L.D / 2 + T)),
    nav: null,
  };
}

// The door tile's center, nudged into the room.
function inward(L) {
  const d = L.doorWorld;
  return { x: d.x + (L.door.x === 0 ? 0.2 : 0), z: d.z + (L.door.y === 0 ? 0.2 : 0) };
}

// A point in front of a placed item, `dist` meters past its front edge.
function frontOf(e, dist = 0.45) {
  const f = footprint(e.itemId, 0);
  const r = e.target.rotY;
  const k = f.h / 2 + dist;
  return { x: e.target.x + Math.sin(r) * k, z: e.target.z + Math.cos(r) * k, yaw: r + Math.PI };
}

// The office: current stage shell, placed furniture, cutaway, night lamps, and stage transitions.
export function createOffice({ parent, screens, lighting }) {
  const holder = new THREE.Group();
  holder.name = 'officeHolder';
  parent.add(holder);
  let cur = null;
  let leaving = null;
  const placed = new Map();      // placed id -> { id, itemId, level, x, y, rot, obj, target, desk }
  const dying = [];
  let dust = null;
  let deskSeed = 0;
  const lampMat = paletteMaterial('pal_lamp');
  const growMat = paletteMaterial('pal_grow');

  function nav() {
    if (!cur.nav) {
      const rects = [];
      for (const e of placed.values()) rects.push(...obstaclesOf(e));
      for (const [bx, by] of cur.L.blocked) rects.push({ x0: bx - cur.L.W / 2, x1: bx + 1 - cur.L.W / 2, z0: by - cur.L.D / 2, z1: by + 1 - cur.L.D / 2 });
      cur.nav = createNav(cur.L, rects);
      cur.zones.wander = wanderSpots(cur.nav, cur.L);
    }
    return cur.nav;
  }

  // Floor rectangles a placed item blocks. Desk chairs stay walkable so people can reach the seat.
  function obstaclesOf(e) {
    const t = e.target;
    const kind = kindOf(e.itemId);
    const rot = (x, z) => ({ x: t.x + Math.cos(t.rotY) * x + Math.sin(t.rotY) * z, z: t.z - Math.sin(t.rotY) * x + Math.cos(t.rotY) * z });
    const rect = (x0, z0, x1, z1) => {
      const a = rot(x0, z0), b = rot(x1, z1);
      return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
    };
    const f = footprint(e.itemId, 0);
    if (kind === 'desk') return [rect(-0.75, DESK_Z - 0.35, 0.75, DESK_Z + 0.35)];
    if (kind === 'meeting') {
      const tb = e.obj.userData.table;
      return [rect(-tb.L / 2, -tb.D / 2, tb.L / 2, tb.D / 2)];
    }
    return [rect(-f.w / 2 + 0.08, -f.h / 2, f.w / 2 - 0.08, f.h / 2 - 0.1)];
  }

  // A few free spots spread over the room for idle wandering.
  function wanderSpots(n, L) {
    const out = [];
    for (const [fx, fz] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7], [0.5, 0.5]]) {
      const x = -L.W / 2 + fx * L.W, z = -L.D / 2 + fz * L.D;
      const i = Math.floor((x + L.W / 2) / n.cell), k = Math.floor((z + L.D / 2) / n.cell);
      if (!n.blocked[i + k * n.nx]) out.push({ x, z });
    }
    if (!out.length) out.push(inward(L));
    return out;
  }

  function setStage(stage, { animate = false } = {}) {
    if (cur && cur.stage === stage) return false;
    const next = buildStage(stage, screens);
    if (cur && animate) {
      leaving = { s: cur, t: 0 };
    } else if (cur) {
      disposeStage(cur);
    }
    cur = next;
    placed.clear();
    ledCache = null;
    holder.add(cur.root);
    lighting?.fitShadow(cur.bounds);
    lighting?.setInteriorLights(cur.L.lights.map((l) => ({ ...l, y: cur.L.wallH - 0.3 })));
    if (animate) {
      cur.root.position.y = -4;
      cur.enterT = 0;
      spawnDust(cur.L);
    }
    return true;
  }

  function disposeStage(s) {
    holder.remove(s.root);
    s.root.traverse((o) => { if (o.isMesh && o.geometry.userData.merged) o.geometry.dispose(); });
  }

  function spawnDust(L) {
    if (dust) holder.remove(dust.group);
    const tex = dustTexture();
    const g = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: color('wall_warm'), transparent: true, depthWrite: false, opacity: 0 }));
      const side = i % 4, u = (i / 36) * 4 % 1 - 0.5;
      const x = side < 2 ? u * L.W : (side === 2 ? -1 : 1) * L.W / 2;
      const z = side >= 2 ? u * L.D : (side === 0 ? -1 : 1) * L.D / 2;
      s.position.set(x, 0.2, z);
      s.userData.v = new THREE.Vector3(x, 0, z).normalize().multiplyScalar(1.5 + (i % 5) * 0.3);
      parts.push(s);
      g.add(s);
    }
    holder.add(g);
    dust = { group: g, parts, t: 0 };
  }

  function makeEntry(p) {
    const seed = kindOf(p.itemId) === 'desk' ? deskSeed++ : placed.size;
    const model = buildPlacedModel(p, cur.stage, screens, seed);
    const obj = mergeStatic(model);
    obj.userData = { ...model.userData, kind: 'placed', placedId: p.id, itemId: p.itemId };
    const target = placedTransform(cur.L, p);
    place(obj, target.x, 0, target.z, target.rotY);
    cur.furniture.add(obj);
    return { id: p.id, itemId: p.itemId, level: p.level, x: p.x, y: p.y, rot: p.rot, obj, target, seed };
  }

  // Mirrors office.placed. New items pop in, moved items slide, removed items shrink away.
  function setPlaced(list = []) {
    if (!cur) return [];
    const seen = new Set();
    const changed = [];
    let dirty = false;
    for (const p of list) {
      if (!p) continue;
      seen.add(p.id);
      const prev = placed.get(p.id);
      if (prev && prev.itemId === p.itemId && prev.level === p.level) {
        if (prev.x !== p.x || prev.y !== p.y || prev.rot !== p.rot) {
          Object.assign(prev, { x: p.x, y: p.y, rot: p.rot, target: placedTransform(cur.L, p), sliding: true });
          dirty = true;
        }
        continue;
      }
      if (prev) cur.furniture.remove(prev.obj);
      const e = makeEntry(p);
      placed.set(p.id, e);
      changed.push({ id: p.id, obj: e.obj, isNew: !prev });
      dirty = true;
    }
    for (const [id, e] of placed) {
      if (seen.has(id)) continue;
      placed.delete(id);
      dying.push({ obj: e.obj, t: 0 });
      dirty = true;
    }
    if (dirty) refresh();
    return changed;
  }

  // Rebuilds everything derived from placed furniture: desks, racks, zones, nav.
  function refresh() {
    const desks = [];
    const Z = { door: inward(cur.L), coffee: null, whiteboard: null, lounge: [], meeting: null };
    cur.dyn.racks = [];
    cur.dyn.meetingChairs = [];
    cur.dyn.screens = [];
    for (const e of placed.values()) {
      const kind = kindOf(e.itemId);
      const t = e.target;
      if (kind === 'desk') {
        const sx = t.x + Math.sin(t.rotY) * SEAT_Z, sz = t.z + Math.cos(t.rotY) * SEAT_Z;
        const d = e.desk ?? { id: e.id, screen: e.obj.userData.screen, obj: e.obj, seed: e.seed };
        d.index = desks.length;
        d.face = t.rotY + Math.PI;
        d.seat = { x: sx, z: sz, rotY: t.rotY + Math.PI };
        e.desk = d;
        desks.push(d);
        cur.dyn.screens.push(d.screen);
      } else if (kind === 'meeting') {
        Z.meeting ??= { x: t.x, z: t.z, rotY: t.rotY, ...e.obj.userData.table, id: e.id };
        cur.dyn.meetingChairs.push(...e.obj.userData.chairs);
      } else if (kind === 'rack' || e.itemId === 'server_rack') {
        cur.dyn.racks.push(e.obj);
      } else if (kind === 'coffee' || e.itemId === 'espresso') {
        Z.coffee ??= frontOf(e, 0.5);
      } else if (kind === 'whiteboard' || e.itemId === 'whiteboard_wall') {
        Z.whiteboard ??= frontOf(e, 0.9);
      }
      if (LOUNGE.has(kind)) Z.lounge.push(frontOf(e, 0.45));
    }
    cur.desks = desks;
    cur.zones = { ...cur.zones, ...Z };
    cur.nav = null;
    ledCache = null;
    nav();
  }

  function deskById(id) {
    return placed.get(id)?.desk ?? null;
  }

  // kind: 'work' (the desk's own variant) | 'gray' | 'red' | 'off'. Swaps only on change.
  function setDeskScreen(id, kind) {
    const d = deskById(id);
    if (!d?.screen || d.screenKind === kind) return;
    d.screenKind = kind;
    d.screen.material = kind === 'work' ? screens.deskMaterial(d.seed) : screens.material(kind);
  }

  // LED meshes on racks and wall screens, rebuilt when furniture changes.
  let ledCache = null;
  function leds() {
    if (!ledCache) {
      ledCache = [];
      for (const e of placed.values()) {
        if (!['server_rack', 'rack', 'monitoring_wall'].includes(e.itemId)) continue;
        e.obj.traverse((c) => { if (c.isMesh && /_led/.test(c.name)) ledCache.push({ mesh: c, phase: ledCache.length * 1.7 }); });
      }
    }
    return ledCache;
  }

  // "On sabbatical" sign on a desk, created on first use; it rides along with the desk.
  const signTex = sabbaticalTexture();
  function setDeskSign(id, on) {
    const d = deskById(id);
    if (!d) return;
    if (on && !d.sign) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8, side: THREE.DoubleSide }));
      m.position.set(0, 0.74, DESK_Z + 0.2);
      m.rotation.x = -0.25;
      m.castShadow = true;
      d.obj.add(m);
      d.sign = m;
    }
    if (d.sign) d.sign.visible = on;
  }

  let tuck = false;
  function tuckMeetingChairs(on) { tuck = on; }

  const camDir = new THREE.Vector2();
  function update(dt, { yaw = Math.PI / 4, env } = {}) {
    if (!cur) return;
    camDir.set(Math.sin(yaw), Math.cos(yaw));
    for (const key of WALL_KEYS) {
      const [ox, oz] = OUTWARD[key];
      cur.walls[key].visible = ox * camDir.x + oz * camDir.y < 0.2;
    }
    if (env) {
      const n = THREE.MathUtils.smoothstep(env.night, 0.2, 0.9);
      if (lampMat) setGlowBase(lampMat, THREE.MathUtils.lerp(0.9, 3.2, n));
      if (growMat) setGlowBase(growMat, THREE.MathUtils.lerp(1.4, 2.8, n));
    }
    const k = 1 - Math.exp(-dt * 10);
    for (const e of placed.values()) {
      if (!e.sliding) continue;
      const o = e.obj;
      o.position.x += (e.target.x - o.position.x) * k;
      o.position.z += (e.target.z - o.position.z) * k;
      let dr = ((e.target.rotY - o.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dr < -Math.PI) dr += Math.PI * 2;
      o.rotation.y += dr * k;
      if (Math.hypot(e.target.x - o.position.x, e.target.z - o.position.z) < 0.005 && Math.abs(dr) < 0.005) {
        place(o, e.target.x, 0, e.target.z, e.target.rotY);
        e.sliding = false;
      }
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i];
      d.t += dt;
      const s = Math.max(0.001, 1 - d.t / 0.18);
      d.obj.scale.setScalar(s);
      if (d.t >= 0.18) { d.obj.removeFromParent(); dying.splice(i, 1); }
    }
    for (const ch of cur.dyn.meetingChairs) {
      ch.position.lerp(tuck ? ch.userData.tucked : ch.userData.home, 1 - Math.exp(-dt * 6));
    }
    if (leaving) {
      leaving.t += dt;
      const q = Math.min(1, leaving.t / 0.7);
      leaving.s.root.position.y = -q * q * 5;
      leaving.s.root.scale.setScalar(1 - q * 0.15);
      if (q >= 1) { disposeStage(leaving.s); leaving = null; }
    }
    if (cur.enterT !== undefined) {
      cur.enterT += dt;
      const q = Math.min(1, Math.max(0, (cur.enterT - 0.35) / 0.8));
      const e = 1 - Math.pow(1 - q, 3);
      const over = Math.sin(q * Math.PI) * 0.25;
      cur.root.position.y = -4 * (1 - e) + over * (q > 0.6 ? 1 : 0);
      if (q >= 1) { cur.root.position.y = 0; delete cur.enterT; }
    }
    if (dust) {
      dust.t += dt;
      const q = dust.t / 1.4;
      for (const s of dust.parts) {
        s.position.addScaledVector(s.userData.v, dt * (1 - q));
        s.position.y += dt * 0.4;
        const sc = 0.6 + q * 1.6;
        s.scale.set(sc, sc, 1);
        s.material.opacity = Math.max(0, Math.min(1, dust.t / 0.35 - 0.3) * (1 - q)) * 0.7;
      }
      if (q >= 1) { holder.remove(dust.group); for (const s of dust.parts) s.material.dispose(); dust = null; }
    }
  }

  return {
    setStage, setPlaced, setDeskScreen, setDeskSign, leds, update, nav, tuckMeetingChairs, deskById,
    get current() { return cur; },
    get placed() { return placed; },
    get bounds() { return cur?.bounds; },
  };
}

let dustTex = null;
function dustTexture() {
  if (dustTex) return dustTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dustTex = new THREE.CanvasTexture(c);
  return dustTex;
}


function sabbaticalTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 150;
  const ctx = c.getContext('2d');
  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, 256, 150);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 140);
  ctx.fillStyle = P.ink;
  ctx.textAlign = 'center';
  ctx.font = '700 40px Fredoka, sans-serif';
  ctx.fillText('ON', 128, 62);
  ctx.font = '700 34px Fredoka, sans-serif';
  ctx.fillText('SABBATICAL', 128, 108);
  ctx.fillStyle = P.leaf;
  ctx.beginPath(); ctx.arc(128, 130, 7, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
