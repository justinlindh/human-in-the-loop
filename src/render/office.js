import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { mat, color, glass, paletteMaterial, setGlowBase } from './materials.js';
import { roundedBox, roundedCylinder, mesh, mergeStatic } from './prims.js';
import { getModel, itemModelName } from './models.js';
import { stageLayout, deskTransforms, createNav } from './layout.js';

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

function meetingRoom(M) {
  const g = new THREE.Group();
  const post = mat('glass_frame');
  const gl = glass();
  const H = 2.2;
  const run = (ax, az, bx, bz, gap) => {
    const len = Math.hypot(bx - ax, bz - az);
    const dirX = (bx - ax) / len, dirZ = (bz - az) / len;
    const panes = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i < panes; i++) {
      const t0 = i / panes, t1 = (i + 1) / panes;
      const cx = ax + dirX * len * (t0 + t1) / 2, cz = az + dirZ * len * (t0 + t1) / 2;
      const pl = len / panes;
      if (gap && Math.abs((t0 + t1) / 2 - 0.5) < 0.5 / panes) continue;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(dirX) * pl + Math.abs(dirZ) * 0.03, H - 0.1, Math.abs(dirZ) * pl + Math.abs(dirX) * 0.03), gl);
      pane.position.set(cx, H / 2, cz);
      pane.userData.dynamic = true;
      pane.renderOrder = 2;
      g.add(pane);
    }
    for (let i = 0; i <= panes; i++) {
      g.add(mesh(roundedBox(0.06, H, 0.06, 0.015), post, ax + dirX * len * i / panes, H / 2, az + dirZ * len * i / panes));
    }
    g.add(mesh(roundedBox(Math.abs(dirX) * len + 0.06, 0.06, Math.abs(dirZ) * len + 0.06, 0.015), post, (ax + bx) / 2, H, (az + bz) / 2));
  };
  run(M.x1, M.z0, M.x1, M.z1, M.door === 'x');
  run(M.x0, M.z1, M.x1, M.z1, M.door === 'z');
  const cx = (M.x0 + M.x1) / 2, cz = (M.z0 + M.z1) / 2;
  const fl = floorPlane(M.x1 - M.x0 - 0.1, M.z1 - M.z0 - 0.1, surfaceMat('wood', null, FLOORS.wood()), 0.004);
  fl.position.x = cx; fl.position.z = cz;
  g.add(fl);
  const top = mat('wood_light');
  g.add(mesh(roundedBox(1.9, 0.06, 1.0, 0.025), top, cx, 0.66, cz));
  g.add(mesh(roundedCylinder(0.06, 0.1, 0.63, 0.01), mat('metal_dark'), cx - 0.6, 0, cz));
  g.add(mesh(roundedCylinder(0.06, 0.1, 0.63, 0.01), mat('metal_dark'), cx + 0.6, 0, cz));
  for (const [dx, dz, r] of [[-0.5, -0.8, 0], [0.5, -0.8, 0], [-0.5, 0.8, Math.PI], [0.5, 0.8, Math.PI]]) {
    g.add(place(getModel('chair'), cx + dx, 0, cz + dz, r));
  }
  g.add(mesh(roundedBox(0.3, 0.02, 0.22, 0.008), mat('paper_sheet'), cx - 0.3, 0.7, cz + 0.1));
  g.add(mesh(roundedBox(0.34, 0.02, 0.24, 0.008), mat('metal_soft'), cx + 0.35, 0.7, cz - 0.1));
  return g;
}

function metalShelf() {
  const g = new THREE.Group();
  const m = mat('metal_soft');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(roundedBox(0.04, 1.6, 0.04, 0.008), m, sx * 0.55, 0.8, sz * 0.2));
  for (const y of [0.1, 0.6, 1.1, 1.58]) g.add(mesh(roundedBox(1.14, 0.03, 0.44, 0.01), m, 0, y, 0));
  g.add(mesh(roundedBox(0.4, 0.32, 0.34, 0.03), mat('cardboard'), -0.3, 0.28, 0));
  g.add(mesh(roundedBox(0.3, 0.24, 0.3, 0.03), mat('cardboard'), 0.25, 0.24, 0.02));
  g.add(mesh(roundedCylinder(0.09, 0.09, 0.2, 0.01), mat('fabric_teal'), -0.3, 0.615, 0));
  g.add(mesh(roundedCylinder(0.09, 0.09, 0.2, 0.01), mat('fabric_terracotta'), -0.08, 0.615, 0));
  g.add(mesh(roundedBox(0.5, 0.12, 0.3, 0.02), mat('plastic_charcoal'), 0.25, 0.68, 0));
  g.add(mesh(roundedBox(0.36, 0.3, 0.3, 0.03), mat('cardboard'), 0.1, 1.27, 0));
  return g;
}

function trophyShelf() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.8, 0.06, 0.3, 0.02), mat('wood_walnut'), 0, 2.2, 0));
  for (const x of [-0.7, 0.7]) g.add(mesh(roundedBox(0.04, 0.16, 0.24, 0.01), mat('metal_dark'), x, 2.1, -0.02));
  for (const [x, s] of [[-0.55, 0.8], [0, 1.0], [0.55, 0.8]]) {
    const t = getModel('trophy');
    t.scale.setScalar(s);
    g.add(place(t, x, 2.23, 0));
  }
  return g;
}

function deskClutter(i, dt) {
  const g = new THREE.Group();
  const fx = Math.sin(dt.desk.rotY), fz = Math.cos(dt.desk.rotY);
  const side = (i % 2 ? 1 : -1);
  const rx = Math.cos(dt.desk.rotY), rz = -Math.sin(dt.desk.rotY);
  const at = (a, f) => [dt.desk.x + rx * a + fx * f, dt.desk.z + rz * a + fz * f];
  if (i % 3 === 0) {
    const [x, z] = at(side * 0.45, 0.1);
    g.add(mesh(roundedCylinder(0.04, 0.035, 0.09, 0.008, 12), mat('mug'), x, 0.62, z));
  }
  if (i % 4 === 1) {
    const [x, z] = at(-side * 0.42, 0.12);
    const p = mesh(roundedBox(0.22, 0.03, 0.3, 0.006), mat('paper_sheet'), x, 0.635, z);
    p.rotation.y = dt.desk.rotY + 0.2;
    g.add(p);
  }
  if (i % 5 === 2) {
    const [x, z] = at(side * 0.5, -0.12);
    const pl = getModel('plant_small');
    pl.scale.setScalar(0.45);
    g.add(place(pl, x, 0.62, z));
  }
  return g;
}

// Builds one stage. Returns the group and everything sync and fx need to find later.
function buildStage(stageIdx, screens) {
  const L = stageLayout(stageIdx);
  const root = new THREE.Group();
  root.name = `stage_${stageIdx}`;
  const statics = new THREE.Group();
  const obstacles = [];
  const dyn = { screens: [], racks: [], wallScreens: [] };

  // Slab and floor
  statics.add(mesh(roundedBox(L.W + 2 * T + 0.3, SLAB, L.D + 2 * T + 0.3, 0.08, 3), mat('slab_side'), 0, -SLAB / 2, 0));
  statics.add(mesh(roundedBox(L.W + 2 * T + 0.34, 0.06, L.D + 2 * T + 0.34, 0.03, 2), mat('slab_edge'), 0, -SLAB + 0.03, 0));
  if (L.floor === 'twotone') {
    const split = -4.5;
    statics.add(floorPlane(split + L.W / 2, L.D, surfaceMat('wood', null, FLOORS.wood())).translateX((split - L.W / 2) / 2));
    statics.add(floorPlane(L.W / 2 - split, L.D, surfaceMat('tile', null, FLOORS.tile())).translateX((split + L.W / 2) / 2));
    statics.add(mesh(roundedBox(0.06, 0.012, L.D, 0.004, 1), mat('metal_soft'), split, 0.004, 0, { cast: false }));
  } else {
    statics.add(floorPlane(L.W, L.D, surfaceMat(L.floor, null, FLOORS[L.floor]())));
  }

  // Walls: one group per side so the cutaway can hide the two facing the camera.
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

  // Fixtures
  for (const f of L.fixtures) {
    let o = null;
    if (f.model) {
      o = getModel(f.model);
      place(o, f.x, 0, f.z, f.rotY ?? 0);
      if (f.rack) { o.userData.dynamic = true; o.userData.kind = 'rack'; dyn.racks.push(o); }
      o.traverse((c) => {
        if (!c.isMesh) return;
        if (c.name.endsWith('_screen')) {
          c.material = c.name.startsWith('wall_screen') ? screens.wallMaterial() : screens.deskMaterial(dyn.screens.length + 3);
          c.userData.dynamic = true;
          if (c.name.startsWith('wall_screen')) dyn.wallScreens.push(c);
        }
      });
    } else if (f.box) {
      o = mesh(roundedBox(f.w, f.h, f.d, 0.03), mat(f.box), f.x, (f.y ?? 0) + f.h / 2, f.z);
      o.rotation.y = f.rotY ?? 0;
    } else if (f.rug) {
      o = mesh(roundedBox(f.w, 0.02, f.d, 0.01, 1), mat(f.rug), f.x, 0.012, f.z, { cast: false });
    } else if (f.shelf) {
      o = place(metalShelf(), f.x, 0, f.z, f.rotY ?? 0);
    } else if (f.trophyShelf) {
      o = place(trophyShelf(), f.x, 0, f.z, f.rotY ?? 0);
    }
    if (!o) continue;
    (o.userData.dynamic ? root : statics).add(o);
    if (!f.rug && !f.trophyShelf) obstacles.push(o);
  }
  if (L.meeting) {
    const mr = meetingRoom(L.meeting);
    statics.add(mr);
    const M = L.meeting;
    obstacles.push({ x0: M.x1 - 0.05, x1: M.x1 + 0.05, z0: M.z0, z1: (M.z0 + M.z1) / 2 - 0.45 });
    obstacles.push({ x0: M.x0, x1: M.x1, z0: M.z1 - 0.05, z1: M.z1 + 0.05 });
    obstacles.push({ x0: (M.x0 + M.x1) / 2 - 1.0, x1: (M.x0 + M.x1) / 2 + 1.0, z0: (M.z0 + M.z1) / 2 - 0.55, z1: (M.z0 + M.z1) / 2 + 0.55 });
  }

  // Desks
  const desks = L.desks.map((slot, i) => {
    const dt = deskTransforms(slot);
    const desk = place(getModel('desk'), dt.desk.x, 0, dt.desk.z, dt.desk.rotY);
    const chair = place(getModel('chair'), dt.chair.x, 0, dt.chair.z, dt.chair.rotY);
    const screenModel = stageIdx === 0 ? 'laptop' : 'monitor';
    const mon = place(getModel(screenModel), dt.monitor.x, 0.62, dt.monitor.z, dt.monitor.rotY);
    if (stageIdx === 0) mon.position.set(dt.desk.x, 0.62, dt.desk.z);
    let screen = null;
    mon.traverse((c) => {
      if (c.isMesh && c.name.endsWith('_screen')) {
        c.material = screens.deskMaterial(i);
        c.userData.dynamic = true;
        screen = c;
      }
    });
    statics.add(desk, chair, mon, deskClutter(i, dt));
    obstacles.push(desk);
    dyn.screens.push(screen);
    return { ...slot, index: i, screen, chair, seat: { x: slot.x, z: slot.z, rotY: slot.face } };
  });

  root.add(mergeStatic(statics));
  for (const key of WALL_KEYS) {
    const merged = mergeStatic(walls[key]);
    merged.position.copy(walls[key].position);
    merged.name = `wall_${key}`;
    walls[key] = merged;
    root.add(merged);
  }

  // Nav grid from object footprints (AABBs are fine: everything sits on 90 degree turns).
  const rects = obstacles.map((o) => {
    if (o.x0 !== undefined) return o;
    const b = new THREE.Box3().setFromObject(o);
    return { x0: b.min.x, z0: b.min.z, x1: b.max.x, z1: b.max.z };
  });
  const itemRects = L.items.map((s) => {
    const alongX = Math.abs(Math.sin(s.rotY)) < 0.5;
    const hw = alongX ? 1.1 : 0.62, hd = alongX ? 0.62 : 1.1;
    return { x0: s.x - hw, x1: s.x + hw, z0: s.z - hd, z1: s.z + hd };
  });

  return {
    stage: stageIdx, L, root, walls, desks, dyn, rects, itemRects,
    bounds: new THREE.Box3(new THREE.Vector3(-L.W / 2 - T, 0, -L.D / 2 - T), new THREE.Vector3(L.W / 2 + T, L.wallH, L.D / 2 + T)),
    nav: null,
  };
}

// The office: current stage, item slots, cutaway, night lamps, and stage transitions.
export function createOffice({ parent, screens, lighting }) {
  const holder = new THREE.Group();
  holder.name = 'officeHolder';
  parent.add(holder);
  let cur = null;
  let leaving = null;
  let items = new Map();       // item id -> { obj, itemId, level, slot }
  let outage = false;
  let dust = null;
  const lampMat = paletteMaterial('pal_lamp');
  const growMat = paletteMaterial('pal_grow');

  function nav() {
    if (!cur.nav) {
      const itemBlocks = [...items.values()].map((it) => cur.itemRects[it.slot]).filter(Boolean);
      cur.nav = createNav(cur.L, [...cur.rects, ...itemBlocks]);
    }
    return cur.nav;
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
    items.clear();
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

  // Place state.items by slot index; key by item id so an existing model is reused.
  function setItems(list = []) {
    if (!cur) return [];
    const L = cur.L;
    const seen = new Set();
    const changed = [];
    list.slice(0, L.items.length).forEach((it, slot) => {
      if (!it) return;
      seen.add(it.id);
      const prev = items.get(it.id);
      const s = L.items[slot];
      if (prev && prev.level === it.level && prev.itemId === it.itemId) {
        if (prev.slot !== slot) { place(prev.obj, s.x, 0, s.z, s.rotY); prev.slot = slot; cur.nav = null; }
        return;
      }
      if (prev) cur.root.remove(prev.obj);
      const obj = getModel(itemModelName(it.itemId, it.level));
      obj.userData.kind = 'item';
      obj.userData.itemId = it.itemId;
      obj.traverse((c) => {
        if (!c.isMesh || !c.name.endsWith('_screen')) return;
        if (c.name.startsWith('wall_screen')) c.material = screens.wallMaterial();
        else if (c.name.startsWith('arcade')) c.material = screens.material('game', slot);
        else c.material = screens.material('code', slot + 1);
      });
      place(obj, s.x, 0, s.z, s.rotY);
      cur.root.add(obj);
      items.set(it.id, { obj, itemId: it.itemId, level: it.level, slot });
      changed.push({ id: it.id, obj, isNew: !prev });
      cur.nav = null;
    });
    for (const [id, it] of items) {
      if (!seen.has(id)) { cur.root.remove(it.obj); items.delete(id); cur.nav = null; }
    }
    return changed;
  }

  function setOutage(on) {
    if (on === outage || !cur) return;
    outage = on;
    cur.desks.forEach((d, i) => { if (d.screen) d.screen.material = on ? screens.material('red') : screens.deskMaterial(i); });
  }

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
    if (leaving) {
      leaving.t += dt;
      const k = Math.min(1, leaving.t / 0.7);
      leaving.s.root.position.y = -k * k * 5;
      leaving.s.root.scale.setScalar(1 - k * 0.15);
      if (k >= 1) { disposeStage(leaving.s); leaving = null; }
    }
    if (cur.enterT !== undefined) {
      cur.enterT += dt;
      const k = Math.min(1, Math.max(0, (cur.enterT - 0.35) / 0.8));
      const e = 1 - Math.pow(1 - k, 3);
      const over = Math.sin(k * Math.PI) * 0.25;
      cur.root.position.y = -4 * (1 - e) + over * (k > 0.6 ? 1 : 0);
      if (k >= 1) { cur.root.position.y = 0; delete cur.enterT; }
    }
    if (dust) {
      dust.t += dt;
      const k = dust.t / 1.4;
      for (const s of dust.parts) {
        s.position.addScaledVector(s.userData.v, dt * (1 - k));
        s.position.y += dt * 0.4;
        const sc = 0.6 + k * 1.6;
        s.scale.set(sc, sc, 1);
        s.material.opacity = Math.max(0, Math.min(1, dust.t / 0.35 - 0.3) * (1 - k)) * 0.7;
      }
      if (k >= 1) { holder.remove(dust.group); for (const s of dust.parts) s.material.dispose(); dust = null; }
    }
  }

  return {
    setStage, setItems, setOutage, update, nav,
    get current() { return cur; },
    get items() { return items; },
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

