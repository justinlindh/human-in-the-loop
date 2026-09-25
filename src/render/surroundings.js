import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { mat } from './materials.js';
import { roundedBox, roundedCylinder, mesh, mergeStatic } from './prims.js';

// The world round the office diorama, per stage: a garage on a suburban lot with a street out
// front; the Office Floor as a storey of a building above a plaza, among neighbouring towers; HQ on
// a campus plaza under a skyline. Everything sits on one diorama board with a cut edge.
//
// createSurroundings({ parent, low }) -> { setStage(stage, L), setViewYaw(yaw), update(dt, env) }
//
// Only flat things (ground, streets, paving, low fences) stand on the camera's side. Anything tall
// belongs to one side of the office (+x, -x, +z, -z) and shows only while that side faces away from
// the camera, as the cutaway walls do, so the view can rotate without scenery hiding the office.
// Low quality keeps the board, streets and buildings and drops trees, clouds, cars and lamps.

const T = 0.25;                    // wall thickness margin round the office footprint
const GROUND_Y = -0.3;             // board top on the ground-level stages
const FLOOR_UP = 7.5;              // how far the Office Floor sits above its plaza
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

const COL = {
  grass: '#bccb9f', grass_dark: '#a8bb8a', asphalt: '#77737c', line: '#efe6d2', kerb: '#d9d0c2',
  paving: '#ddd0bb', paving_dark: '#cdbfa8', soil: '#8a6a52', fence: '#efe6d8',
  house: ['#efe2cc', '#dfe3e6', '#ecd6c8'], roof: ['#b9765c', '#8d8a9a', '#a9816a'],
  tower: ['#c9d3de', '#e0d2c0', '#c7cfe0', '#e6dccb', '#d6c9d9', '#c4d6cf'], car: ['#6f8fc0', '#d9a441', '#9ab58a', '#c78a8a'],
};
const mats = new Map();
function m(hex, opts = {}) {
  const key = `${hex}|${JSON.stringify(opts)}`;
  let x = mats.get(key);
  if (!x) { x = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.9, ...opts }); mats.set(key, x); }
  return x;
}

// Facade materials: one per wall colour, a 4x4 tile of windows that repeats across every wall of
// that colour (the UVs are scaled per face to the building's size), with a random share of panes
// lit in the emissive map for the night. Buildings of one colour share it, so they merge into one
// draw call per side.
const WIN_W = 1.1, WIN_H = 2.4, TILE = 4;
const facades = new Map();
function facade(wallHex) {
  let f = facades.get(wallHex);
  if (f) return f;
  const S = 256, cell = S / TILE;
  const make = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cc = make(), ec = make();
  const cx = cc.getContext('2d'), ex = ec.getContext('2d');
  cx.fillStyle = wallHex; cx.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  for (let r = 0; r < TILE; r++) for (let c = 0; c < TILE; c++) {
    const x = c * cell + cell * 0.2, y = r * cell + cell * 0.22, w = cell * 0.6, h = cell * 0.56;
    cx.fillStyle = '#9fb3c4'; cx.fillRect(x, y, w, h);
    cx.fillStyle = 'rgba(255,255,255,0.35)'; cx.fillRect(x, y, w * 0.35, h);
    if (rnd() < 0.45) { ex.fillStyle = rnd() < 0.8 ? P.lamp_warm : '#cfe7ff'; ex.fillRect(x, y, w, h); }
  }
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  f = new THREE.MeshStandardMaterial({ map: tex(cc), emissiveMap: tex(ec), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.85 });
  facades.set(wallHex, f);
  return f;
}

// A building: facade walls (a box whose UVs count windows), a cap over the roof in the wall colour,
// and rooftop clutter. haze: 0 near, toward 1 far; far buildings fade toward the horizon colour.
// roof: false for the Office Floor's own building, whose roof is the office.
function building(w, h, d, wallHex, haze = 0, roof = true) {
  if (haze) wallHex = `#${new THREE.Color(wallHex).lerp(new THREE.Color(P.sky_day_bottom), haze).getHexString()}`;
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.clearGroups();
  const uv = geo.attributes.uv;
  // Faces in BoxGeometry order: +x, -x, +y, -y, +z, -z; four vertices each.
  const span = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * span[f][0]) / (WIN_W * TILE), (uv.getY(i) * span[f][1]) / (WIN_H * TILE));
  }
  const g = new THREE.Group();
  const walls = new THREE.Mesh(geo, facade(wallHex));
  walls.userData.facade = walls.material;
  g.add(walls);
  g.userData.facade = walls.material;
  if (!roof) return g;
  g.add(mesh(roundedBox(w + 0.12, 0.25, d + 0.12, 0.06, 1), m(wallHex), 0, h / 2 + 0.1, 0));
  g.add(mesh(roundedBox(Math.min(1.4, w * 0.3), 0.6, Math.min(1.1, d * 0.3), 0.08, 2), m('#b9b4bd'), w * 0.2, h / 2 + 0.5, -d * 0.15));
  if (h > 12) g.add(mesh(roundedCylinder(0.5, 0.5, 1.1, 0.1, 12), m('#a88f7a'), -w * 0.2, h / 2 + 0.2, d * 0.15));
  g.userData.facade = walls.material;
  return g;
}

function house(w, d, wallHex, roofHex) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(w, 2.4, d, 0.06, 2), m(wallHex), 0, 1.2, 0));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.62, 1.5, 4, 1), m(roofHex));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, (d / w) * 1.02);
  roof.position.y = 2.4 + 0.75;
  g.add(roof);
  const door = mesh(roundedBox(0.8, 1.6, 0.06, 0.02, 1), m(P.wood_dark), 0, 0.8, d / 2 + 0.02);
  g.add(door);
  for (const sx of [-1, 1]) g.add(mesh(roundedBox(0.8, 0.8, 0.05, 0.02, 1), m('#9fb3c4'), sx * w * 0.28, 1.5, d / 2 + 0.02));
  return g;
}

function tree(h = 2.6) {
  const g = new THREE.Group();
  g.add(mesh(roundedCylinder(0.1, 0.14, h * 0.45, 0.03, 8), m(P.wood_dark), 0, 0, 0));
  const leaf = m(rnd() < 0.5 ? P.leaf : P.leaf_dark);
  for (const [x, y, z, r] of [[0, 0.62, 0, 0.5], [0.28, 0.5, 0.1, 0.36], [-0.25, 0.52, -0.1, 0.38], [0.05, 0.82, -0.05, 0.36]]) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r * h * 0.5, 1), leaf);
    s.position.set(x * h * 0.5, y * h, z * h * 0.5);
    g.add(s);
  }
  return g;
}

function car(hex) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(2.2, 0.55, 1.05, 0.14, 3), m(hex), 0, 0.42, 0));
  g.add(mesh(roundedBox(1.2, 0.45, 0.95, 0.14, 3), m('#dfe7ee'), -0.1, 0.88, 0));
  for (const x of [-0.7, 0.7]) for (const z of [-0.5, 0.5]) {
    const wh = mesh(roundedCylinder(0.2, 0.2, 0.16, 0.04, 12), m(P.ink), x, 0.2, z);
    wh.rotation.x = Math.PI / 2; wh.position.z += z > 0 ? -0.08 : 0.08;
    g.add(wh);
  }
  return g;
}

function lamp() {
  const g = new THREE.Group();
  g.add(mesh(roundedCylinder(0.05, 0.07, 3.2, 0.02, 8), m(P.metal_dark), 0, 0, 0));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(P.lamp_warm), emissive: new THREE.Color(P.lamp_warm), emissiveIntensity: 0 }));
  bulb.position.y = 3.25;
  bulb.userData.bulb = true;
  g.add(bulb);
  return g;
}

// Soft cloud sprites, shared texture.
let cloudTex = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  for (const [cx, cy, r] of [[40, 38, 22], [64, 30, 28], [90, 38, 20], [64, 44, 22]]) {
    const g = x.createRadialGradient(cx, cy, 2, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 64);
  }
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  return cloudTex;
}

export function createSurroundings({ parent, low = () => false }) {
  const root = new THREE.Group();
  root.name = 'surroundings';
  parent.add(root);
  let cur = null;          // { group, sides: { px, nx, pz, nz }, facades, bulbs, movers, clouds }
  let viewYaw = Math.PI / 4;

  function clear() {
    if (!cur) return;
    root.remove(cur.group);
    cur.group.traverse((o) => { if (o.isMesh && o.geometry.userData.merged) o.geometry.dispose(); });
    cur = null;
  }

  // The side of the office a point belongs to, for tall things.
  function sideOf(L, x, z) {
    const ox = Math.abs(x) - L.W / 2, oz = Math.abs(z) - L.D / 2;
    return ox > oz ? (x > 0 ? 'px' : 'nx') : (z > 0 ? 'pz' : 'nz');
  }

  function setStage(stage, L) {
    clear();
    const group = new THREE.Group();
    const flat = new THREE.Group();
    const sides = { px: new THREE.Group(), nx: new THREE.Group(), pz: new THREE.Group(), nz: new THREE.Group() };
    const dyn = new THREE.Group();
    const facadeMats = new Set(), bulbs = [], movers = [], clouds = [];
    const lite = low();
    const tall = (obj, x, z) => { obj.position.x = x; obj.position.z = z; sides[sideOf(L, x, z)].add(obj); if (obj.userData.facade) facadeMats.add(obj.userData.facade); return obj; };
    const onFlat = (obj, x, y, z) => { obj.position.set(x, y, z); flat.add(obj); return obj; };

    const hw = L.W / 2 + T, hd = L.D / 2 + T;
    const up = stage === 1 ? FLOOR_UP : 0;
    const gy = GROUND_Y - up;
    const M = stage === 0 ? 9 : stage === 1 ? 12 : 14;
    const BW = 2 * (hw + M), BD = 2 * (hd + M);

    // The diorama board: a thick slab with a soil edge and the stage's ground on top.
    const groundHex = stage === 0 ? COL.grass : COL.paving;
    // The soil slab's top sits under the ground plate, not level with it (no z-fighting).
    onFlat(mesh(roundedBox(BW, 0.8, BD, 0.25, 3), m(COL.soil), 0, 0, 0, { cast: false }), 0, gy - 0.45, 0);
    onFlat(mesh(roundedBox(BW - 0.05, 0.06, BD - 0.05, 0.03, 2), m(groundHex), 0, gy - 0.03, 0, { cast: false }), 0, gy - 0.03, 0);

    // A street across the front (+z), kerbs and a dashed centre line.
    const street = (z0, width, x0 = -BW / 2 + 0.2, x1 = BW / 2 - 0.2) => {
      const cz = z0 + width / 2, len = x1 - x0, cx = (x0 + x1) / 2;
      onFlat(mesh(roundedBox(len, 0.04, width, 0.01, 1), m(COL.asphalt), 0, 0, 0, { cast: false }), cx, gy + 0.01, cz);
      for (const zz of [z0 - 0.35, z0 + width + 0.35]) onFlat(mesh(roundedBox(len, 0.08, 0.7, 0.02, 1), m(COL.kerb), 0, 0, 0, { cast: false }), cx, gy + 0.03, zz);
      for (let x = x0 + 0.6; x < x1 - 1; x += 2.2) onFlat(mesh(roundedBox(1.1, 0.012, 0.14, 0.004, 1), m(COL.line), 0, 0, 0, { cast: false }), x + 0.55, gy + 0.035, cz);
      return cz;
    };

    if (stage === 0) {
      // Suburban lot: lawn, the street out front, a driveway from the garage door, houses behind.
      const sz = street(hd + 3.2, 3.4);
      const garage = L.openings.find((o) => o.kind === 'garage');
      if (garage) {
        const dz = garage.at;
        onFlat(mesh(roundedBox(M - 0.4, 0.04, garage.width + 0.6, 0.01, 1), m(P.floor_concrete), 0, 0, 0, { cast: false }), -hw - (M - 0.4) / 2, gy + 0.01, dz);
        if (!lite) tall(car(COL.car[0]), -hw - 3.2, dz).rotation.y = Math.PI / 2;
        for (const [i, dx] of [[0, 1.2], [1, 1.9]]) tall(mesh(roundedBox(0.6, 1.05, 0.65, 0.08, 2), m(i ? P.leaf_dark : P.metal_dark), 0, 0.52, 0), -hw - dx, dz + garage.width / 2 + 0.9);
      }
      // Picket fences along the back and left of the lot.
      const fence = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 0.35);
        const g = new THREE.Group();
        for (let i = 0; i <= n; i++) g.add(mesh(roundedBox(0.1, 0.75, 0.05, 0.02, 1), m(COL.fence), (i / n - 0.5) * len, 0.37, 0));
        g.add(mesh(roundedBox(len, 0.06, 0.04, 0.01, 1), m(COL.fence), 0, 0.55, 0.03));
        g.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        g.position.y = gy;
        return tall(g, (x0 + x1) / 2, (z0 + z1) / 2);
      };
      fence(-hw - M + 1, -hd - 2.5, hw + M - 1, -hd - 2.5);
      // Houses behind the fence and to the far left.
      [[-hw + 1, -hd - 6.5, 5, 4], [hw + 2.5, -hd - 6, 6, 4.5], [-hw - 7, -hd - 3, 4.5, 4]].forEach(([x, z, w, d], i) => {
        const h = house(w, d, COL.house[i % 3], COL.roof[i % 3]);
        h.position.y = gy;
        tall(h, x, z);
      });
      if (!lite) {
        for (const [x, z, s] of [[hw + 1.6, -hd - 1.2, 2.6], [-hw - 2.2, -hd - 1.4, 3], [hw + M - 2, hd - 1, 2.4], [-hw - M + 2.5, hd + 0.5, 2.8], [hw + 2.8, 1, 2.2]]) {
          const t = tree(s); t.position.y = gy; tall(t, x, z);
        }
        movers.push({ make: () => car(COL.car[1 + Math.floor(rnd() * 3)]), z: sz + 0.85, x0: -BW / 2 + 1, x1: BW / 2 - 1, speed: 3.2, gap: [8, 16] });
        movers.push({ make: () => car(COL.car[Math.floor(rnd() * 4)]), z: sz - 0.85, x0: BW / 2 - 1, x1: -BW / 2 + 1, speed: 2.8, gap: [10, 20] });
      }
    }

    if (stage === 1) {
      // A storey of a building: the facade runs down from the slab to the plaza below.
      const fh = up - 0.35;
      const shaft = building(2 * hw + 0.3, fh, 2 * hd + 0.3, COL.tower[1], 0, false);
      shaft.position.set(0, -0.35 - fh / 2, 0);
      flat.add(shaft);
      facadeMats.add(shaft.userData.facade);
      const sz = street(hd + 4.5, 4);
      // Neighbouring towers behind and to the sides, some rising above this floor.
      // Neighbours: a near row a storey or two taller than this floor, a hazier row further back.
      const towers = [[-hw - 3, -hd - 8, 5, 12, 5, 0], [hw - 4, -hd - 9, 6, 10, 5, 0], [0, -hd - 15, 8, 16, 6, 0.35], [hw + 6, -hd - 14, 6, 14, 6, 0.35],
        [-hw - 9, -2, 5, 11, 5, 0], [-hw - 14, hd - 4, 6, 15, 6, 0.35], [-hw - 8, -hd - 4, 4, 8, 4, 0]];
      towers.forEach(([x, z, w, h, d, hz], i) => { const b = building(w, h, d, COL.tower[i % COL.tower.length], hz); b.position.y = gy + h / 2; tall(b, x, z); });
      if (!lite) {
        for (const [x, z] of [[hw + 2, hd + 1.5], [-hw - 1.5, hd + 1.8], [hw + 3, -hd + 2]]) { const t = tree(2.4); t.position.y = gy; tall(t, x, z); }
        for (const x of [-hw, 0, hw]) { const l = lamp(); l.position.y = gy; bulbs.push(l.children[1]); tall(l, x, sz - 2.6); }
        movers.push({ make: () => car(COL.car[Math.floor(rnd() * 4)]), z: sz + 1, x0: -BW / 2 + 1, x1: BW / 2 - 1, speed: 3.6, gap: [5, 11] });
        movers.push({ make: () => car(COL.car[Math.floor(rnd() * 4)]), z: sz - 1, x0: BW / 2 - 1, x1: -BW / 2 + 1, speed: 3.2, gap: [6, 12] });
      }
    }

    if (stage === 2) {
      // Campus plaza: paving bands, planters with trees, lamps, a road, and a skyline behind.
      for (let i = 0; i < 6; i++) onFlat(mesh(roundedBox(BW - 1, 0.012, 0.5, 0.004, 1), m(COL.paving_dark), 0, 0, 0, { cast: false }), 0, gy + 0.01, hd + 1 + i * 1.6);
      const sz = street(hd + M - 4.5, 3.6);
      // Skyline: a near row of mid-rise blocks and a hazier far row of towers, behind and to the left.
      const sky = [];
      for (let i = 0; i < 9; i++) sky.push([-hw - 2 + (i / 8) * (2 * hw + 6), -hd - 9 - rnd() * 3, 4 + rnd() * 2, 7 + rnd() * 8, 4 + rnd() * 2, 0]);
      for (let i = 0; i < 6; i++) sky.push([-hw - 8 - rnd() * 3, -hd + (i / 5) * (2 * hd - 2), 4 + rnd() * 2, 6 + rnd() * 7, 4 + rnd() * 2, 0]);
      for (let i = 0; i < 10; i++) sky.push([-hw - 6 + (i / 9) * (2 * hw + 16), -hd - 17 - rnd() * 4, 5 + rnd() * 3, 16 + rnd() * 16, 5 + rnd() * 3, 0.45]);
      sky.forEach(([x, z, w, h, d, hz], i) => { const b = building(w, h, d, COL.tower[i % COL.tower.length], hz); b.position.y = gy + h / 2; tall(b, x, z); });
      // Lawn beds on the plaza in front (flat) and a green strip behind for the trees.
      for (const [x, z, w, d] of [[-hw + 3, hd + 2.3, 5, 1.6], [hw - 3, hd + 2.3, 5, 1.6], [hw + 2.4, 0, 1.6, 6]]) onFlat(mesh(roundedBox(w, 0.08, d, 0.04, 2), m(COL.grass), 0, 0, 0, { cast: false }), x, gy + 0.02, z);
      onFlat(mesh(roundedBox(2 * hw + 4, 0.08, 3, 0.04, 2), m(COL.grass), 0, 0, 0, { cast: false }), 0, gy + 0.02, -hd - 3);
      onFlat(mesh(roundedBox(3, 0.08, 2 * hd + 4, 0.04, 2), m(COL.grass), 0, 0, 0, { cast: false }), -hw - 3, gy + 0.02, 0);
      if (!lite) {
        const planters = [];
        for (let i = 0; i < 7; i++) { const t = tree(2.6 + rnd() * 1.2); t.position.y = gy; tall(t, -hw + 1 + (i / 6) * (2 * hw - 2), -hd - 3 + (rnd() - 0.5)); }
        for (let i = 0; i < 5; i++) { const t = tree(2.6 + rnd() * 1.2); t.position.y = gy; tall(t, -hw - 3 + (rnd() - 0.5), -hd + 1 + (i / 4) * (2 * hd - 2)); }
        for (const [x, z] of planters) {
          const g = new THREE.Group();
          g.add(mesh(roundedBox(1.3, 0.5, 1.3, 0.1, 2), m(COL.kerb), 0, 0.25, 0));
          const t = tree(2.3); t.position.y = 0.45; g.add(t);
          g.position.y = gy;
          tall(g, x, z);
        }
        for (const x of [-hw + 4, 0, hw - 4]) { const l = lamp(); l.position.y = gy; bulbs.push(l.children[1]); tall(l, x, sz - 2.5); }
        movers.push({ make: () => car(COL.car[Math.floor(rnd() * 4)]), z: sz + 0.85, x0: -BW / 2 + 1, x1: BW / 2 - 1, speed: 3.4, gap: [6, 12] });
      }
    }

    // Clouds drift slowly past high up behind the office.
    if (!lite) {
      const cm = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: 0.8 });
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Sprite(cm);
        s.scale.set(7 + rnd() * 5, 3 + rnd() * 1.5, 1);
        s.position.set(-BW / 2 + rnd() * BW, 14 + rnd() * 6, -hd - M - 2 - rnd() * 6);
        s.userData.speed = 0.25 + rnd() * 0.3;
        s.userData.noAO = true;
        dyn.add(s);
        clouds.push(s);
      }
      clouds.bounds = [-BW / 2 - 8, BW / 2 + 8];
    }

    // Static parts merge per material; tall parts merge per side so each side hides as one.
    const merged = { flat: mergeStatic(flat) };
    for (const k of Object.keys(sides)) merged[k] = mergeStatic(sides[k]);
    // No shadows either way: the sun's shadow map is fitted to the office, and the board would take
    // acne stripes outside it.
    for (const g of Object.values(merged)) g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    group.add(merged.flat, merged.px, merged.nx, merged.pz, merged.nz, dyn);
    // Bulbs are emissive and change at night: they stay separate (mergeStatic keeps dynamic ones).
    root.add(group);
    cur = { group, sides: { px: merged.px, nx: merged.nx, pz: merged.pz, nz: merged.nz }, facadeMats, bulbs: collectBulbs(group), movers: movers.map((mv) => ({ ...mv, t: rnd() * mv.gap[1], car: null })), clouds, dyn, gy };
    applyYaw();
  }

  function collectBulbs(g) {
    const out = [];
    g.traverse((o) => { if (o.isMesh && o.material?.emissive && o.material.color?.getHexString() === new THREE.Color(P.lamp_warm).getHexString()) out.push(o); });
    return out;
  }

  function applyYaw() {
    if (!cur) return;
    const cx = Math.sin(viewYaw), cz = Math.cos(viewYaw);
    const show = { px: cx < 0.3, nx: cx > -0.3, pz: cz < 0.3, nz: cz > -0.3 };
    for (const k of Object.keys(cur.sides)) cur.sides[k].visible = show[k];
  }

  function setViewYaw(yaw) {
    if (Math.abs(yaw - viewYaw) < 1e-3) return;
    viewYaw = yaw;
    applyYaw();
  }

  function update(dt, env) {
    if (!cur) return;
    const night = env?.night ?? 0;
    for (const fm of cur.facadeMats) fm.emissiveIntensity = night * 1.1;
    for (const b of cur.bulbs) b.material.emissiveIntensity = night * 2.2;
    for (const c of cur.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > cur.clouds.bounds[1]) c.position.x = cur.clouds.bounds[0];
      c.material.opacity = 0.8 * (1 - night * 0.8);
    }
    for (const mv of cur.movers) {
      if (!mv.car) {
        mv.t -= dt;
        if (mv.t > 0) continue;
        mv.car = mv.make();
        mv.car.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
        mv.car.position.set(mv.x0, cur.gy, mv.z);
        mv.car.rotation.y = mv.x1 > mv.x0 ? 0 : Math.PI;
        cur.dyn.add(mv.car);
        continue;
      }
      const dir = Math.sign(mv.x1 - mv.x0);
      mv.car.position.x += dir * mv.speed * dt;
      if ((mv.car.position.x - mv.x1) * dir > 0) {
        cur.dyn.remove(mv.car);
        mv.car = null;
        mv.t = mv.gap[0] + rnd() * (mv.gap[1] - mv.gap[0]);
      }
    }
  }

  return { setStage, setViewYaw, update, get group() { return root; } };
}
