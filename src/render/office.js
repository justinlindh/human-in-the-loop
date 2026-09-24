import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { mat, color, glow, paletteMaterial, setGlowBase } from './materials.js';
import { ROLE_COLORS } from './palette.js';
import { roundedBox, roundedCylinder, mesh, mergeStatic, batchMeshes } from './prims.js';
import { getModel, hasModel, itemModelName } from './models.js';
import { stageLayout, createNav, placedTransform, footprint, tileCenter } from './layout.js';

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
  ping_pong_table: 'pingpong', ping_pong: 'pingpong', foosball: 'foosball',
};
export const kindOf = (itemId) => KIND[itemId] ?? itemId;
const FREE_STANDING = new Set(['desk', 'meeting', 'plant', 'couch', 'pingpong', 'foosball']);
const LOUNGE = new Set(['couch', 'nap_pod', 'arcade', 'library', 'plant_wall', 'bookshelf']);

// Desk sets face -Z at rot 0: desk in the back tile row, chair and sitter in the front row.
const DESK_Z = -0.35;
const KEYS_Z = -0.09;            // keyboard centre, just behind the desk's front edge
const SEAT_Z = 0.18;
// Desk sets are a little lower than the desk model so seated chibi hands reach the keys.
const TOP = 0.57;
const DY = TOP - 0.62;           // everything modelled on a 0.62 m top moves down by this

const STICKY = ['fabric_mustard', 'marker_orange', 'fabric_teal'];

// Era dressing on a desk: a boxier monitor before AI, prompt sticky notes in the ChatGBT era,
// a status light in the Agents era, and compliance binders once the lawyers arrive.
function deskEra(g, i, era, laptop) {
  if (era === 'chatgbt' && i % 2 === 0) {
    for (let k = 0; k < 2 + (i % 3 ? 0 : 1); k++) {
      const n = mesh(roundedBox(0.07, 0.07, 0.006, 0.002, 1), mat(STICKY[(i + k) % 3]), (k - 1) * 0.1, laptop ? 0.64 : 0.95 + k * 0.03, DESK_Z - 0.1, { cast: false });
      n.rotation.z = (k - 1) * 0.2;
      if (laptop) { n.rotation.x = -Math.PI / 2; n.position.z = DESK_Z + 0.05 + k * 0.02; n.position.x = 0.36 + k * 0.035; }
      g.add(n);
    }
  }
  if (era === 'agents') {
    const led = mesh(new THREE.SphereGeometry(0.022, 10, 8), glow('led_green', 3), 0.38, 0.645, DESK_Z - 0.22, { cast: false });
    led.name = 'desk_status';
    led.userData.noAO = true;
    g.add(led);
    g.add(mesh(roundedCylinder(0.035, 0.04, 0.02, 0.005, 12), mat('plastic_charcoal'), 0.38, 0.62, DESK_Z - 0.22));
  }
  if (era === 'plateau') {
    // Analog notebooks and handmade things: people, taste, and craft are the edge now.
    const side = i % 2 ? -1 : 1;
    const cover = ['fabric_terracotta', 'fabric_teal', 'fabric_mustard', 'fabric_sage'][i % 4];
    const nb = mesh(roundedBox(0.15, 0.022, 0.21, 0.008), mat(cover), side * 0.37, 0.632, DESK_Z + 0.12);
    nb.rotation.y = side * 0.25;
    g.add(nb);
    const pg = mesh(roundedBox(0.135, 0.008, 0.195, 0.003, 1), mat('paper'), side * 0.37, 0.646, DESK_Z + 0.12, { cast: false });
    pg.rotation.y = side * 0.25;
    g.add(pg);
    const pen = mesh(roundedCylinder(0.007, 0.007, 0.15, 0.002, 6), mat('wood_honey'), side * 0.42, 0.66, DESK_Z + 0.1);
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = 0.5;
    g.add(pen);
    if (i % 3 === 1) {
      // A lumpy hand-thrown cup.
      g.add(mesh(roundedCylinder(0.042, 0.036, 0.085, 0.015, 9), mat('pot_cream'), -side * 0.38, 0.62, DESK_Z + 0.16));
      g.add(mesh(roundedCylinder(0.043, 0.043, 0.02, 0.006, 9), mat('pot_terracotta'), -side * 0.38, 0.69, DESK_Z + 0.16));
    }
  }
  if (era === 'consolidation' && i % 3 === 0) {
    const b = mesh(roundedBox(0.07, 0.28, 0.22, 0.012), mat('fabric_slate'), -0.36, 0.76, DESK_Z - 0.14);
    g.add(b);
    g.add(mesh(roundedBox(0.072, 0.1, 0.12, 0.004, 1), mat('paper_sheet'), -0.36, 0.8, DESK_Z - 0.14));
  }
}

function oldMonitor(g) {
  // A deeper, smaller pre-AI screen: the same panel on a chunky warm-white housing.
  g.scale.set(0.82, 0.9, 1);
  g.add(mesh(roundedBox(0.4, 0.3, 0.2, 0.04), mat('plastic_white'), 0, 0.3, -0.13));
}

function deskSet(i, stageIdx, screens, era) {
  const g = new THREE.Group();
  // Desk sets are one tile wide, so neighbours butt together into a bench.
  const desk = getModel('desk');
  desk.scale.set(0.96 / 1.3, TOP / 0.62, 1);
  g.add(place(desk, 0, 0, DESK_Z));
  const onTop = new THREE.Group();
  onTop.position.y = DY;
  g.add(onTop);
  const chair = place(getModel('chair'), 0, 0, SEAT_Z + 0.05, Math.PI);
  g.add(chair);
  const laptop = stageIdx === 0;
  // The keys sit about 0.3 m in front of the sitter, where chibi arms reach: a laptop is pulled
  // to the front of the desk; a monitor stays at the back with a keyboard and mouse in front.
  const mon = place(getModel(laptop ? 'laptop' : 'monitor'), 0, 0.62, laptop ? KEYS_Z + 0.02 : DESK_Z - 0.14);
  if (!laptop) {
    onTop.add(mesh(roundedBox(0.36, 0.018, 0.13, 0.006), mat('plastic_charcoal'), 0, 0.629, KEYS_Z));
    onTop.add(mesh(roundedBox(0.33, 0.006, 0.1, 0.002, 1), mat('metal_soft'), 0, 0.64, KEYS_Z, { cast: false }));
    onTop.add(mesh(roundedBox(0.055, 0.02, 0.085, 0.02), mat('plastic_charcoal'), 0.27, 0.63, KEYS_Z + 0.01));
  }
  if (era === 'classic' && !laptop) oldMonitor(mon);
  onTop.add(mon);
  deskEra(onTop, i, era, laptop);
  // Team mat under the whole set, tinted by whoever sits here (hidden until someone does).
  const rug = mesh(roundedBox(0.92, 0.012, 1.9, 0.006, 1), mat('laminate'), 0, 0.008, 0, { cast: false });
  rug.userData.dynamic = true;
  rug.userData.batch = true;
  rug.userData.noAO = true;
  g.add(rug);
  g.userData.rug = rug;
  let screen = null;
  mon.traverse((c) => {
    if (c.isMesh && c.name.endsWith('_screen')) {
      if (screens) c.material = screens.deskMaterial(i);
      c.userData.dynamic = true;
      c.userData.batch = true;
      screen = c;
    }
  });
  const side = i % 2 ? 1 : -1;
  if (i % 3 === 0) onTop.add(mesh(roundedCylinder(0.04, 0.035, 0.09, 0.008, 12), mat('mug'), side * 0.36, 0.62, DESK_Z + 0.12));
  if (i % 4 === 1 && era !== 'plateau') {
    const p = mesh(roundedBox(0.16, 0.02, 0.22, 0.006), mat('paper_sheet'), -side * 0.38, 0.63, DESK_Z + 0.08);
    p.rotation.y = 0.2;
    onTop.add(p);
  }
  if (i % 5 === 2) {
    const pl = getModel('plant_small');
    pl.scale.setScalar(0.45);
    onTop.add(place(pl, side * 0.36, 0.62, DESK_Z - 0.16));
  }
  g.userData.screen = screen;
  return g;
}

function meetingTable(w, h, era) {
  const g = new THREE.Group();
  const L = Math.max(1.2, w - 1.1), D = Math.max(0.8, Math.min(1.0, h - 1.1));
  // Consolidation-era boardrooms go lawyer grey.
  g.add(mesh(roundedBox(L, 0.06, D, 0.025), mat(era === 'consolidation' ? 'metal_soft' : 'wood_light'), 0, 0.66, 0));
  if (era === 'consolidation') g.add(mesh(roundedBox(0.07, 0.28, 0.22, 0.012), mat('fabric_slate'), L / 2 - 0.3, 0.83, 0.1));
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

// Before AI there is no agent wall: a status TV on a cart stands in for it.
function statusTv(screens) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.7, 0.05, 0.45, 0.015), mat('metal_dark'), 0, 0.72, 0));
  g.add(mesh(roundedBox(0.7, 0.04, 0.45, 0.015), mat('metal_dark'), 0, 0.12, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(roundedCylinder(0.015, 0.015, 0.7, 0.004, 8), mat('metal_soft'), sx * 0.32, 0.05, sz * 0.2));
  g.add(mesh(roundedBox(0.62, 0.46, 0.4, 0.05), mat('plastic_charcoal'), 0, 1.0, -0.02));
  // Screen canvases follow glTF's top-down V, so this plane's UVs are flipped to match.
  const tvGeo = new THREE.PlaneGeometry(0.5, 0.36);
  const tvUv = tvGeo.attributes.uv;
  for (let i = 0; i < tvUv.count; i++) tvUv.setY(i, 1 - tvUv.getY(i));
  const scr = mesh(tvGeo, screens ? screens.material('chart', 2) : mat('screen_bg'), 0, 1.0, 0.185, { cast: false });
  scr.name = 'tv_screen';
  scr.userData.dynamic = true;
  g.add(scr);
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

// Turns a model's long side along the footprint's long side and shrinks it to fit. Wall pieces
// then sit against the back edge; the rest are centered.
function fitFootprint(inner, f, againstBack) {
  let b = new THREE.Box3().setFromObject(inner);
  let sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
  if (f.h > f.w && sx > sz * 1.2) {
    inner.rotation.y = Math.PI / 2;
    b = new THREE.Box3().setFromObject(inner);
    sx = b.max.x - b.min.x; sz = b.max.z - b.min.z;
  }
  const k = Math.min(1, (f.w - 0.06) / sx, (f.h + 0.15) / sz);
  inner.scale.multiplyScalar(k);
  b = new THREE.Box3().setFromObject(inner);
  inner.position.x -= (b.min.x + b.max.x) / 2;
  inner.position.z -= againstBack ? b.min.z + f.h / 2 - 0.06 : (b.min.z + b.max.z) / 2;
}

// The model for a placed item in its local frame: origin at the footprint center, front toward +Z.
export function buildPlacedModel(p, stageIdx, screens = null, seed = 0, era = 'classic') {
  const kind = kindOf(p.itemId);
  const f = footprint(p.itemId, 0);
  let inner;
  if (kind === 'desk') inner = deskSet(seed, stageIdx, screens, era);
  else if (kind === 'meeting') inner = meetingTable(f.w, f.h, era);
  else if (p.itemId === 'monitoring_wall' && era === 'classic') inner = statusTv(screens);
  else if (kind === 'whiteboard') inner = getModel('whiteboard');
  else if (kind === 'coffee') inner = getModel('kitchenette');
  else if (kind === 'plant') inner = getModel('plant_tall');
  else if (kind === 'bookshelf') inner = getModel('bookshelf');
  else if (kind === 'couch') inner = getModel('couch');
  else if (kind === 'rack') inner = getModel('server_rack');
  else if (kind === 'pingpong') inner = getModel('ping_pong_table');
  else if (kind === 'foosball') inner = getModel('foosball');
  else if (hasModel(itemModelName(p.itemId, p.level))) inner = getModel(itemModelName(p.itemId, p.level));
  else inner = crate(f.w, f.h);
  if (kind !== 'desk') screensFor(inner, screens, seed);
  // LEDs blink per mesh, so they stay out of the static merge.
  inner.traverse((c) => { if (c.isMesh && /_led/.test(c.name)) { c.userData.dynamic = true; c.userData.noAO = true; } });
  if (kind !== 'desk' && kind !== 'meeting') fitFootprint(inner, f, !FREE_STANDING.has(kind));
  const g = new THREE.Group();
  g.add(inner);
  inner.updateMatrix();
  // Model space to item space (the footprint fit), so interaction spots can be authored per model.
  g.userData.fit = inner.matrix.clone();
  g.userData.model = inner.name;
  g.userData.kind = kind;
  g.userData.chairs = inner.userData.chairs ?? [];
  g.userData.table = inner.userData.table ?? null;
  g.userData.screen = inner.userData.screen ?? null;
  g.userData.rug = inner.userData.rug ?? null;
  return g;
}

function wallMatFor(L) {
  return L.wall === 'block' ? surfaceMat('block', null, WALLS.block()) : mat(L.wall === 'sage' ? 'wall_sage' : 'wall_cream');
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

  const wallMat = wallMatFor(L);
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

  // Blocked tiles: a water heater in the garage, structural pillars elsewhere.
  for (const [bx, by] of L.blocked) {
    const c = tileCenter(L, bx, by);
    if (stageIdx === 0) {
      statics.add(mesh(roundedCylinder(0.3, 0.3, 1.45, 0.05, 20), mat('plastic_white'), c.x, 0, c.z));
      statics.add(mesh(roundedCylinder(0.22, 0.3, 0.12, 0.03, 20), mat('metal_soft'), c.x, 1.45, c.z));
      statics.add(mesh(roundedCylinder(0.04, 0.04, 0.9, 0.01, 8), mat('metal_dark'), c.x + 0.18, 1.5, c.z + 0.1));
      statics.add(mesh(roundedBox(0.16, 0.1, 0.06, 0.02), mat('pot_terracotta'), c.x, 0.3, c.z + 0.3));
    } else {
      // Pillars are cut like the front walls so they never hide the people behind them.
      const H = 1.15;
      statics.add(mesh(roundedBox(0.5, H, 0.5, 0.04), wallMatFor(L), c.x, H / 2, c.z));
      statics.add(mesh(roundedBox(0.54, 0.1, 0.54, 0.02), mat('baseboard'), c.x, 0.05, c.z));
      statics.add(mesh(roundedBox(0.52, 0.04, 0.52, 0.01), mat('slab_edge'), c.x, H + 0.02, c.z));
    }
  }
  const dm = tileCenter(L, L.door.x, L.door.y);
  statics.add(mesh(roundedBox(0.9, 0.02, 0.6, 0.01), mat('rug_teal'), dm.x, 0.011, dm.z + 0.1, { cast: false }));

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

// The door tile's center, nudged toward the middle of the room.
function inward(L) {
  const d = L.doorWorld;
  const len = Math.hypot(d.x, d.z) || 1;
  return { x: d.x - (d.x / len) * 0.3, z: d.z - (d.z / len) * 0.3 };
}

// A point in front of a placed item, `dist` meters past its front edge.
// How far an item's model reaches toward its front (+z in its own frame) from its footprint center.
// Models often stop short of their footprint (an espresso machine against the wall), and a use spot
// measured from the footprint would leave people standing a tile away. Measured once per entry.
export function frontEdge(e) {
  return localBox(e).max.z;
}

// The model's bounds in its own frame (x across, z toward its front), at full size. Measured once.
export function localBox(e) {
  if (e.box) return e.box;
  const o = e.obj;
  // Measured at full size: a newly placed item may still be popping in.
  const saved = { x: o.position.x, z: o.position.z, r: o.rotation.y, s: o.scale.clone() };
  o.position.set(0, o.position.y, 0); o.rotation.y = 0; o.scale.set(1, 1, 1);
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  o.position.set(saved.x, o.position.y, saved.z); o.rotation.y = saved.r; o.scale.copy(saved.s);
  o.updateMatrixWorld(true);
  if (b.isEmpty()) {
    const f = footprint(e.itemId, 0);
    b.set(new THREE.Vector3(-f.w / 2, 0, -f.h / 2), new THREE.Vector3(f.w / 2, 1, f.h / 2));
  }
  e.box = b;
  return b;
}

function frontOf(e, dist = 0.45) {
  const r = e.target.rotY;
  const k = frontEdge(e) + dist;
  return { x: e.target.x + Math.sin(r) * k, z: e.target.z + Math.cos(r) * k, yaw: r + Math.PI };
}

// Where a group gathers at a whiteboard: 0.9 m out from its front, or from its back when the front
// faces a wall (a free-standing board reads from either side). The side kept is the one farther
// inside the room.
function boardSide(e, L = e.L) {
  const f = frontOf(e, 0.9);
  const r = e.target.rotY;
  const k = -localBox(e).min.z + 0.9;
  const b = { x: e.target.x - Math.sin(r) * k, z: e.target.z - Math.cos(r) * k, yaw: r };
  const room = (p) => Math.min(L.W / 2 - Math.abs(p.x), L.D / 2 - Math.abs(p.z));
  return e.itemId === 'whiteboard_wall' || room(f) >= room(b) ? f : b;
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
  let era = 'classic';
  let poster = null;
  const lampMat = paletteMaterial('pal_lamp');
  const growMat = paletteMaterial('pal_grow');

  let navVersion = 0;
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
    // A desk blocks its top and its chair: only the sitter goes in, from behind the chair.
    if (kind === 'desk') return [rect(-0.75, DESK_Z - 0.35, 0.75, DESK_Z + 0.35), rect(-0.3, SEAT_Z - 0.15, 0.3, SEAT_Z + 0.42)];
    if (kind === 'meeting') {
      const tb = e.obj.userData.table;
      return [rect(-tb.L / 2, -tb.D / 2, tb.L / 2, tb.D / 2)];
    }
    // Blocked where the model actually stands (a little past its footprint at most), so people walk
    // round what they can see and a use spot just in front stays walkable.
    const b = localBox(e);
    const cl = (v, lim) => Math.max(-lim, Math.min(lim, v));
    return [rect(cl(b.min.x, f.w / 2 + 0.1), cl(b.min.z, f.h / 2), cl(b.max.x, f.w / 2 + 0.1), cl(b.max.z, f.h / 2))];
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
    eraQueue = [];
    batch = null;
    ledCache = null;
    holder.add(cur.root);
    poster = null;
    updatePoster();
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

  function makeEntry(p, fixedSeed) {
    const seed = fixedSeed ?? (kindOf(p.itemId) === 'desk' ? deskSeed++ : placed.size);
    const model = buildPlacedModel(p, cur.stage, screens, seed, era);
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
    if (dirty) { dropBatch(); refresh(); }
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
        Z.whiteboard ??= boardSide(e, cur.L);
      }
      if (LOUNGE.has(kind)) Z.lounge.push(frontOf(e, 0.45));
    }
    cur.desks = desks;
    cur.zones = { ...cur.zones, ...Z };
    cur.nav = null;
    navVersion++;
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
    dropBatch();
  }

  // LED meshes on racks and wall screens, rebuilt when furniture changes.
  let ledCache = null;
  function leds() {
    if (!ledCache) {
      ledCache = [];
      for (const e of placed.values()) {
        if (!['server_rack', 'rack', 'monitoring_wall', 'desk'].includes(e.itemId)) continue;
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
      m.position.set(0, 0.74 + DY, DESK_Z + 0.2);
      m.rotation.x = -0.25;
      m.castShadow = true;
      m.userData.dynamic = true;
      d.obj.add(m);
      d.sign = m;
      dropBatch();
    }
    if (d.sign) d.sign.visible = on;
  }

  let tuck = false;
  function tuckMeetingChairs(on) { tuck = on; }

  // Era dressing: rebuild placed models in place (no pop) and swap the wall poster.
  function setEra(id) {
    if (!id || id === era) return false;
    era = id;
    if (!cur) return true;
    // Only era-dressed pieces change; they are rebuilt a few per frame so a big office never hitches.
    eraQueue = [...placed.keys()].filter((pid) => ERA_DRESSED.has(kindOf(placed.get(pid).itemId)) || placed.get(pid).itemId === 'monitoring_wall');
    updatePoster();
    return true;
  }

  const ERA_DRESSED = new Set(['desk', 'meeting']);
  const ERA_PER_FRAME = 4;
  let eraQueue = [];
  function rebuildForEra() {
    let n = 0;
    while (eraQueue.length && n < ERA_PER_FRAME) {
      const old = placed.get(eraQueue.shift());
      if (!old) continue;
      n++;
      cur.furniture.remove(old.obj);
      const e = makeEntry(old, old.seed);
      if (old.desk) e.desk = { ...old.desk, screen: e.obj.userData.screen, obj: e.obj, sign: null, screenKind: null, role: undefined };
      placed.set(old.id, e);
    }
    if (n) { dropBatch(); refresh(); }
  }

  function updatePoster() {
    if (poster) { poster.removeFromParent(); poster = null; }
    if (!cur) return;
    if (era === 'chatgbt') poster = makePoster(cur.L);
    if (era === 'plateau') poster = makeCraftWall(cur.L);
    if (poster) cur.root.add(poster);
  }

  // Team mat under a desk set, tinted by the sitter's role; an empty desk gets a neutral mat.
  const rugMats = new Map();
  function setDeskRole(id, role) {
    const d = deskById(id);
    const rug = d?.obj.userData.rug;
    if (!rug || d.role === role) return;
    d.role = role;
    dropBatch();
    const key = role ?? 'none';
    let m = rugMats.get(key);
    if (!m) {
      const base = color(cur.L.floor === 'concrete' ? 'floor_concrete' : 'laminate');
      m = new THREE.MeshStandardMaterial({ color: role ? new THREE.Color(ROLE_COLORS[role] ?? P.laminate).lerp(base, 0.55) : color('wall_trim').lerp(base, 0.5), roughness: 0.95 });
      rugMats.set(key, m);
    }
    rug.material = m;
  }

  // Idle furniture is drawn as one merged batch per material. Any change (placement, era, a mat
  // colour, an item hidden for a move) drops the batch and shows the originals until things settle.
  let batch = null;
  let idleT = 0;
  const BATCH_AFTER = 0.5;
  function dropBatch() {
    idleT = 0;
    if (!batch) return;
    for (const m of batch.members) m.visible = true;
    batch.group.removeFromParent();
    batch.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    batch = null;
  }
  function buildBatch() {
    const members = [];
    const owners = [];
    for (const e of placed.values()) {
      if (!e.obj.visible || e.sliding) continue;
      owners.push(e.obj);
      for (const m of e.obj.children) {
        if (m.isMesh && m.visible && (!m.userData.dynamic || m.userData.batch)) members.push(m);
      }
    }
    if (members.length < 2) return;
    const group = batchMeshes(members, cur.furniture);
    for (const m of members) m.visible = false;
    cur.furniture.add(group);
    batch = { group, members, owners };
  }
  function updateBatch(dt) {
    if (batch) {
      // Something hid or moved an item (build mode moving it, a pop): fall back to the originals.
      if (batch.owners.some((o) => !o.visible || o.scale.x !== 1 || !o.parent)) dropBatch();
      return;
    }
    const busy = eraQueue.length || dying.length || [...placed.values()].some((e) => e.sliding || e.obj.scale.x !== 1);
    idleT = busy ? 0 : idleT + dt;
    if (idleT >= BATCH_AFTER && placed.size) buildBatch();
  }

  const camDir = new THREE.Vector2();
  function update(dt, { yaw = Math.PI / 4, env } = {}) {
    if (!cur) return;
    if (eraQueue.length) rebuildForEra();
    updateBatch(dt);
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
    setStage, setPlaced, setDeskScreen, setDeskSign, setDeskRole, setEra, leds, update, nav, tuckMeetingChairs, deskById,
    get era() { return era; },
    get current() { return cur; },
    get placed() { return placed; },
    get bounds() { return cur?.bounds; },
    // Bumps whenever the walkable grid is rebuilt (furniture placed, moved or removed).
    get navVersion() { return navVersion; },
  };
}

// The widest stretch of a back wall between openings, as [from, to] along the wall.
export function wallGap(L, wall) {
  const len = wall === 'x' ? L.D : L.W;
  const ops = L.openings.filter((o) => o.wall === wall).map((o) => [o.at - o.width / 2, o.at + o.width / 2]).sort((a, b) => a[0] - b[0]);
  let best = null, cursor = -len / 2 + 0.4;
  for (const [a, b] of [...ops, [len / 2 - 0.4, len / 2]]) {
    if (a - cursor > (best ? best[1] - best[0] : 0)) best = [cursor, a];
    cursor = Math.max(cursor, b);
  }
  return best;
}

function pinboardTexture() {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c99a63'; ctx.fillRect(0, 0, 384, 256);
  let k = 7;
  const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { ctx.fillStyle = rnd() < 0.5 ? '#b8874f' : '#d9ad75'; ctx.fillRect(rnd() * 384, rnd() * 256, 2, 2); }
  // Sketches, index cards, and a photo, joined by yarn.
  const cards = [[30, 30, 90, 70, P.paper], [150, 22, 80, 100, P.paper_sheet], [260, 40, 95, 70, P.fabric_mustard], [60, 140, 100, 80, P.paper_sheet], [200, 150, 70, 70, P.pot_cream], [290, 140, 70, 90, P.paper]];
  const pins = [];
  for (const [x, y, w, h, col] of cards) {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate((rnd() - 0.5) * 0.18);
    ctx.fillStyle = col; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
    for (let l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(-w / 2 + 8, -h / 2 + 16 + l * 14); ctx.lineTo(w / 2 - 10 - rnd() * 20, -h / 2 + 16 + l * 14); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.restore();
    pins.push([x + w / 2, y + 6]);
  }
  ctx.strokeStyle = P.fabric_terracotta; ctx.lineWidth = 2.5;
  ctx.beginPath(); pins.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  for (const [x, y] of pins) { ctx.fillStyle = P.fabric_teal; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Plateau craft wall: a pinboard of sketches on the left back wall, and a shelf of handmade
// pottery on the right one.
function makeCraftWall(L) {
  const g = new THREE.Group();
  const gx = wallGap(L, 'x');
  if (gx && gx[1] - gx[0] >= 1.3) {
    const z = (gx[0] + gx[1]) / 2;
    g.add(mesh(roundedBox(0.04, 0.82, 1.2, 0.012), mat('wood_dark'), -L.W / 2 + 0.02, 1.5, z));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.72), new THREE.MeshStandardMaterial({ map: pinboardTexture(), roughness: 0.95 }));
    face.position.set(-L.W / 2 + 0.045, 1.5, z);
    face.rotation.y = Math.PI / 2;
    g.add(face);
  }
  const gz = wallGap(L, 'z');
  if (gz && gz[1] - gz[0] >= 1.3) {
    const x = (gz[0] + gz[1]) / 2, zw = -L.D / 2;
    for (const y of [1.25, 1.75]) {
      g.add(mesh(roundedBox(1.1, 0.04, 0.24, 0.012), mat('wood_honey'), x, y, zw + 0.13));
      for (const sx of [-0.45, 0.45]) g.add(mesh(roundedBox(0.03, 0.12, 0.2, 0.008), mat('metal_dark'), x + sx, y - 0.07, zw + 0.11));
    }
    const pots = [[-0.35, 1.27, 0.07, 0.16, 'pot_terracotta'], [-0.08, 1.27, 0.05, 0.1, 'pot_cream'], [0.2, 1.27, 0.08, 0.13, 'fabric_teal'], [0.4, 1.27, 0.04, 0.18, 'pot_cream'],
      [-0.3, 1.77, 0.06, 0.12, 'pot_cream'], [0.05, 1.77, 0.07, 0.09, 'fabric_mustard'], [0.33, 1.77, 0.05, 0.14, 'pot_terracotta']];
    for (const [dx, y, r, h, m] of pots) g.add(mesh(roundedCylinder(r * 0.8, r, h, Math.min(0.02, r * 0.3), 10), mat(m), x + dx, y + 0.02, zw + 0.13));
    const pl = getModel('plant_small');
    pl.scale.setScalar(0.5);
    g.add(place(pl, x - 0.1, 1.79, zw + 0.13));
  }
  return g.children.length ? g : null;
}

// "Try AI" poster on the left back wall, in the widest gap between openings.
function makePoster(L) {
  const best = wallGap(L, 'x');
  if (!best || best[1] - best[0] < 0.9) return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 340;
  const ctx = c.getContext('2d');
  ctx.fillStyle = P.paper; ctx.fillRect(0, 0, 256, 340);
  ctx.fillStyle = P.screen_cyan; ctx.fillRect(0, 0, 256, 120);
  ctx.fillStyle = P.ink;
  ctx.textAlign = 'center';
  ctx.font = '700 64px Fredoka, sans-serif';
  ctx.fillText('TRY', 128, 200);
  ctx.fillText('AI', 128, 262);
  ctx.font = '600 22px Fredoka, sans-serif';
  ctx.fillText('ask it anything*', 128, 300);
  ctx.font = '500 14px Fredoka, sans-serif';
  ctx.fillText('*results may vary', 128, 326);
  ctx.fillStyle = P.paper;
  ctx.beginPath(); ctx.arc(128, 60, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = P.screen_cyan;
  ctx.beginPath(); ctx.arc(116, 54, 6, 0, Math.PI * 2); ctx.arc(140, 54, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = P.screen_cyan; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(128, 64, 16, 0.2, Math.PI - 0.2); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const z = (best[0] + best[1]) / 2;
  const frame = mesh(roundedBox(0.03, 0.9, 0.68, 0.01), mat('wood_dark'), -L.W / 2 + 0.015, 1.55, z);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  face.position.set(-L.W / 2 + 0.035, 1.55, z);
  face.rotation.y = Math.PI / 2;
  g.add(frame, face);
  return g;
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
