// In-page scene dump (dump.mjs): exact positions, poses and screen boxes of every character, item
// and staged prop on the current frame, and an annotated copy of the frame.
//
//   prepare()            loads what the dump reads from the sim; await it once before dumping
//   dumpFrame(R, S, { views }) -> { people: [...], items: [...], props: [...], nav, spots, camera }
//                           views (camera turns, e.g. [0, 1, 2, 3]) adds each person's and prop's
//                           visible share and occluder per turn, from the staging probe
//   annotate(R, frame)   -> PNG data URL: the frame with ids, screen boxes, facing arrows, gaze rays,
//                           the walk grid, paths and goals
//
// nav is the walk grid people path on (layout.js createNav): cell size, origin, and one row string
// per grid row (z), '#' blocked, 'o' walkable but under furniture (a meeting chair, a model that
// reaches past its blocked cells), '.' free. occupied lists what stands over each 'o' cell, and
// obstacles the rectangles the grid is built from and whose each is (an item id, 'prop' or
// 'pillar'): a cell is blocked when its centre is within 0.12 m of one, or at the room's edge.
// spots are the office's named spots (door, coffee, whiteboard, lounge, meeting, wander) and each
// item's front cells (the sim's front zones). Each person carries walk: their path, goal and what
// sent them (a moment, a perk visit), and pathHits: the furniture a body (radius BODY_R) would pass
// through along the rest of the path, first hit first.
//
// World coordinates are metres (y up; the floor is y = 0). Screen coordinates are canvas pixels from
// the top left. Yaw is radians about y; a character with yaw 0 faces +z. Nothing here changes the
// scene or the game: it runs on the harness's tool stream (window.__tool), not the game's.
import * as THREE from 'three';

const ownRandom = (fn) => (window.__tool ? window.__tool(fn) : fn());

const r3 = (v) => (v ? [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] : null);
const r2 = (p) => (p ? [+p.x.toFixed(1), +p.y.toFixed(1)] : null);
const arr3 = (a) => (a ? a.map((x) => +x.toFixed(3)) : null);

function screenOf(R, v) {
  const c = document.querySelector('canvas');
  const p = v.clone().project(R.camera);
  return { x: ((p.x + 1) / 2) * c.width, y: ((1 - p.y) / 2) * c.height, on: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1 };
}
// A world box's outline on screen, as [left, top, width, height] in canvas pixels.
function screenBox(R, box) {
  if (!box || box.isEmpty()) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const s = screenOf(R, new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
  }
  return [+x0.toFixed(1), +y0.toFixed(1), +(x1 - x0).toFixed(1), +(y1 - y0).toFixed(1)];
}
const boxJson = (b) => (b && !b.isEmpty() ? { min: r3(b.min), max: r3(b.max) } : null);

const BODY_R = 0.2;
// Furniture meshes at body height, as world boxes grouped by item (and staged prop), for the walk
// checks: rugs and mats (under 5 cm) and anything overhead (above 1.5 m) never block a body. Hidden
// meshes count: the office draws still furniture as merged batches and hides the item's own meshes.
function furniture(R) {
  const out = [];
  const add = (id, label, obj) => {
    const all = new THREE.Box3().setFromObject(obj);
    const parts = [];
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const b = new THREE.Box3().setFromObject(m);
      if (b.isEmpty() || b.max.y < 0.05 || b.min.y > 1.5) return;
      parts.push({ b, part: m.material?.name || m.name || 'mesh' });
    });
    if (parts.length) out.push({ id, label, all, parts });
  };
  for (const e of R.office?.placed.values() ?? []) add(e.id, e.itemId, e.obj);
  for (const p of R.props?.current() ?? []) add(p.obj.userData.propId ?? p.prop, p.prop, p.obj);
  return out;
}
const nearRect = (b, x, z, r) => x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r;
function hitAt(F, x, z, r, skip) {
  for (const f of F) {
    if (skip.has(f.id) || !nearRect(f.all, x, z, r)) continue;
    const p = f.parts.find((q) => nearRect(q.b, x, z, r));
    if (p) return { id: f.id, label: f.label, part: p.part };
  }
  return null;
}

// What furniture a body of radius r standing at (x, z) would pass through, or null.
export function furnitureAt(R, x, z, r = BODY_R) { R.scene.updateMatrixWorld(); return hitAt(furniture(R), x, z, r, new Set()); }

function navOf(R, F) {
  const n = R.office?.nav?.(), L = R.office?.current?.L;
  if (!n || !L) return null;
  const nz = n.blocked.length / n.nx, x0 = -L.W / 2, z0 = -L.D / 2;
  const rows = [], occupied = [];
  for (let k = 0; k < nz; k++) {
    let row = '';
    for (let i = 0; i < n.nx; i++) {
      if (n.blocked[i + k * n.nx]) { row += '#'; continue; }
      const x = x0 + (i + 0.5) * n.cell, z = z0 + (k + 0.5) * n.cell;
      const by = hitAt(F, x, z, 0, new Set());
      if (by) { row += 'o'; occupied.push({ cell: [i, k], at: [+x.toFixed(2), +z.toFixed(2)], by: `${by.id} ${by.label}`, part: by.part }); } else row += '.';
    }
    rows.push(row);
  }
  const obstacles = (R.office.obstacles?.() ?? []).map((r) => ({ ...r, x0: +r.x0.toFixed(3), x1: +r.x1.toFixed(3), z0: +r.z0.toFixed(3), z1: +r.z1.toFixed(3) }));
  return { cell: n.cell, nx: n.nx, nz, origin: [x0, z0], W: L.W, D: L.D, rows, occupied, obstacles };
}

// The sim's front zones, loaded once by prepare() so a dump never waits between drawing a frame and
// reading it back (a wait lets the canvas clear).
let frontCells = null;
export async function prepare() { ({ frontCells } = await import('/src/sim/office.js')); }

function spotsOf(R) {
  const Z = R.office?.current?.zones ?? {};
  const pt = (p) => (p ? [+p.x.toFixed(2), +p.z.toFixed(2)] : null);
  const out = { door: pt(Z.door), coffee: pt(Z.coffee), whiteboard: pt(Z.whiteboard), meeting: pt(Z.meeting), lounge: (Z.lounge ?? []).map(pt), wander: (Z.wander ?? []).map(pt), front: {} };
  const L = R.office?.current?.L;
  if (!frontCells || !L) { out.front = null; return out; }
  for (const e of R.office?.placed.values() ?? []) {
    const cells = frontCells(e.itemId, e.x, e.y, e.rot, e.level);
    if (cells?.length) out.front[e.id] = cells.map(([x, y]) => [x, y, +(x + 0.5 - L.W / 2).toFixed(2), +(y + 0.5 - L.D / 2).toFixed(2)]);
  }
  return out;
}

// The rest of someone's walk swept with their body: the first furniture it passes through, other
// than the desk they sit at and the item their goal is on.
function pathHits(F, pos, walk, seat) {
  if (!walk?.path?.length) return [];
  const skip = new Set([seat].filter(Boolean));
  const pts = [{ x: pos.x, z: pos.z }, ...walk.path];
  const out = [];
  for (let j = 1; j < pts.length && out.length < 3; j++) {
    const a = pts[j - 1], b = pts[j], d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.1));
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n, z = a.z + ((b.z - a.z) * s) / n;
      const h = hitAt(F, x, z, BODY_R, skip);
      if (h && !out.some((o) => o.id === h.id)) { out.push({ ...h, segment: j, at: [+x.toFixed(2), +z.toFixed(2)] }); break; }
    }
  }
  return out;
}

// Every character root by actor id: staff ids, and a moment's own actors by the id the probe knows
// them by ('visitor:0'), or 'extra:<n>' for anyone else.
function characters(R) {
  const out = new Map();
  const extras = new Map((R.moments?.extras?.() ?? []).map((e) => [e.char.root, e.id]));
  R.scene.traverse((o) => {
    if (o.name !== 'character') return;
    let id = null;
    o.traverse((c) => { if (c.userData.staffId !== undefined) id = c.userData.staffId; });
    out.set(id ?? extras.get(o) ?? `extra:${out.size}`, o);
  });
  return out;
}

// A body part's world points: the lowest (feet), or the centre (head, hands).
function partOf(root, name) { let m = null; root.traverse((c) => { if (!m && c.userData.part === name) m = c; }); return m; }
function lowest(mesh) {
  const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
  let best = null;
  for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); if (!best || v.y < best.y) best = v.clone(); }
  return best;
}

export function dumpFrame(R, S, { views = null } = {}) {
  const spots = spotsOf(R);
  return ownRandom(() => {
    R.scene.updateMatrixWorld();
    const F = furniture(R);
    const people = [];
    for (const [id, root] of characters(R)) {
      if (!root.visible) continue;
      const staff = S.staff?.find((p) => p.id === id);
      const actor = !!staff || String(id).startsWith('visitor:');
      const probe = actor ? R.probe?.(id) ?? null : null;
      const pk = staff ? R.perks?.peek(id) ?? null : null;
      const st = actor ? R.moments?.staging?.(id) ?? null : null;
      const box = new THREE.Box3();
      root.traverse((c) => { if (c.isMesh && c.userData.part) { c.geometry.computeBoundingBox(); box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld)); } });
      const pos = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
      const yaw = new THREE.Euler().setFromQuaternion(root.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      const head = partOf(root, 'head');
      const headAt = head ? new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3()) : null;
      const feet = ['legL', 'legR'].map((n) => partOf(root, n)).map((m) => (m ? lowest(m) : null));
      const hands = probe?.hands?.map((h) => new THREE.Vector3(...(h.isVector3 ? [h.x, h.y, h.z] : h))) ?? [];
      const held = st?.held ?? null;
      const walk = staff ? R.walkOf?.(id) ?? null : null;
      const r2w = (p) => p && { ...p, x: +p.x.toFixed(3), z: +p.z.toFixed(3) };
      people.push({
        id, name: staff?.name ?? null, role: staff?.role ?? null, mood: staff?.mood ?? null,
        pos: r3(pos), yaw: +yaw.toFixed(3), bounds: boxJson(box), screen: screenBox(R, box),
        anim: probe?.anim ?? pk?.temp?.anim ?? null, animT: pk?.temp?.t != null ? +pk.temp.t.toFixed(2) : null,
        moment: st?.moment ?? null, beat: st?.beat ?? null,
        seated: R.isSeated?.(id) ?? null, seat: pk?.seat ?? null, using: pk?.temp?.key ?? null, walking: !!pk?.path,
        head: headAt ? { world: r3(headAt), screen: r2(screenOf(R, headAt)) } : null,
        eyes: arr3(probe?.eyes), forward: arr3(probe?.forward),
        hands: hands.map((h) => ({ world: r3(h), screen: r2(screenOf(R, h)) })),
        feet: feet.map((f) => (f ? { world: r3(f), screen: r2(screenOf(R, f)) } : null)),
        held: held ? { name: held.name || null, world: r3(new THREE.Box3().setFromObject(held).getCenter(new THREE.Vector3())), ...(probe?.held ?? {}) } : null,
        gaze: probe?.gaze ?? null, faceCam: probe?.faceCam ?? null, visible: probe?.visible ?? null, occluder: probe?.occluder ?? null,
        views: actor && views ? R.probeViews?.(id, views) ?? null : null, role: st?.role ?? null,
        walk: walk && { ...walk, path: walk.path.map(r2w), goal: r2w(walk.goal), temp: walk.temp && { ...walk.temp, goal: r2w(walk.temp.goal) } },
        pathHits: pathHits(F, pos, walk, pk?.seat),
      });
    }
    const items = [];
    for (const e of R.office?.placed.values() ?? []) {
      const box = new THREE.Box3().setFromObject(e.obj);
      items.push({
        id: e.id, itemId: e.itemId, level: e.level, tile: { x: e.x, y: e.y, rot: e.rot }, desk: !!e.desk,
        pos: r3(e.obj.position), yaw: +e.obj.rotation.y.toFixed(3), bounds: boxJson(box), screen: screenBox(R, box),
        seat: e.desk?.seat ? { x: +e.desk.seat.x.toFixed(3), z: +e.desk.seat.z.toFixed(3) } : null,
      });
    }
    const props = [];
    for (const p of R.props?.current() ?? []) {
      const box = new THREE.Box3().setFromObject(p.obj);
      const seen = R.probeViews?.(p.prop, views ?? [0]) ?? null;
      props.push({ id: p.obj.userData.propId ?? null, prop: p.prop, pos: r3(p.obj.position), yaw: +p.obj.rotation.y.toFixed(3), bounds: boxJson(box), screen: screenBox(R, box), deskId: p.obj.userData.follow?.deskId ?? null,
        visible: seen?.[0]?.visible ?? null, occluder: seen?.[0]?.occluder ?? null, views: views ? seen : null });
    }
    const c = document.querySelector('canvas');
    return { people, items, props, nav: navOf(R, F), spots, spotSearches: JSON.parse(JSON.stringify(R.debug?.spots ?? {})), camera: { pos: r3(R.camera.position), zoom: R.camera.zoom, width: c.width, height: c.height } };
  });
}

// The current frame with the dump drawn over it: item boxes (thin), people boxes with ids, facing
// arrows on the floor, gaze rays from the eyes, and hands as dots.
export function annotate(R, f) {
  const src = document.querySelector('canvas');
  const t = document.createElement('canvas');
  t.width = src.width; t.height = src.height;
  const g = t.getContext('2d');
  g.drawImage(src, 0, 0);
  g.font = '600 12px sans-serif';
  g.textBaseline = 'bottom';
  const label = (text, x, y, color) => {
    const w = g.measureText(text).width + 6;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x, y - 15, w, 15);
    g.fillStyle = color; g.fillText(text, x + 3, y - 2);
  };
  const at = (w) => screenOf(R, new THREE.Vector3(...w));
  // The walk grid, faintly: blocked cells red, walkable cells under furniture orange.
  if (f.nav) {
    const { cell, origin: [x0, z0] } = f.nav;
    f.nav.rows.forEach((row, k) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '.') continue;
        const c = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => at([x0 + (i + a) * cell, 0.01, z0 + (k + b) * cell]));
        g.fillStyle = row[i] === '#' ? 'rgba(255,40,40,0.16)' : 'rgba(255,150,0,0.35)';
        g.beginPath(); g.moveTo(c[0].x, c[0].y); for (const q of c.slice(1)) g.lineTo(q.x, q.y); g.closePath(); g.fill();
      }
    });
  }
  for (const it of f.items) {
    if (!it.screen) continue;
    g.strokeStyle = 'rgba(255,200,0,0.7)'; g.lineWidth = 1;
    g.strokeRect(...it.screen);
    label(`${it.id} ${it.itemId}`, it.screen[0], it.screen[1], '#ffd34d');
  }
  for (const p of f.props) {
    if (!p.screen) continue;
    g.strokeStyle = '#4dd2ff'; g.lineWidth = 1.5;
    g.strokeRect(...p.screen);
    label(p.prop, p.screen[0], p.screen[1] + p.screen[3] + 15, '#4dd2ff');
  }
  for (const p of f.people) {
    // The rest of the path (cyan) to the goal (a ring), and where the body would pass through
    // furniture (a cross).
    const w = p.walk;
    if (w?.path?.length) {
      g.strokeStyle = '#00e5ff'; g.lineWidth = 2;
      g.beginPath(); const s0 = at(p.pos); g.moveTo(s0.x, s0.y);
      for (const q of w.path) { const s = at([q.x, 0.02, q.z]); g.lineTo(s.x, s.y); }
      g.stroke();
    }
    const goal = w?.temp?.goal ?? w?.goal;
    if (goal && !w?.goal?.hidden) { const s = at([goal.x, 0.02, goal.z]); g.strokeStyle = '#00e5ff'; g.lineWidth = 2; g.beginPath(); g.arc(s.x, s.y, 6, 0, Math.PI * 2); g.stroke(); }
    for (const h of p.pathHits ?? []) {
      const s = at([h.at[0], 0.02, h.at[1]]);
      g.strokeStyle = '#ff00ff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(s.x - 6, s.y - 6); g.lineTo(s.x + 6, s.y + 6); g.moveTo(s.x + 6, s.y - 6); g.lineTo(s.x - 6, s.y + 6); g.stroke();
    }
    if (!p.screen) continue;
    g.strokeStyle = '#ff2d55'; g.lineWidth = 2;
    g.strokeRect(...p.screen);
    // Facing: an arrow on the floor from the feet, 0.5 m along the yaw.
    const a = at(p.pos), b = at([p.pos[0] + Math.sin(p.yaw) * 0.5, p.pos[1], p.pos[2] + Math.cos(p.yaw) * 0.5]);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - 8 * Math.cos(ang - 0.5), b.y - 8 * Math.sin(ang - 0.5)); g.lineTo(b.x - 8 * Math.cos(ang + 0.5), b.y - 8 * Math.sin(ang + 0.5)); g.closePath(); g.fillStyle = '#ff2d55'; g.fill();
    // Gaze: from the eyes along the face's direction, as far as the probe's hit (or 1 m).
    if (p.eyes && p.forward) {
      const d = p.gaze?.dist ?? 1;
      const e = at(p.eyes), q = at(p.eyes.map((v, i) => v + p.forward[i] * Math.min(d, 3)));
      g.strokeStyle = '#7CFC00'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
    }
    g.fillStyle = '#ffffff';
    for (const h of p.hands) if (h.screen) { g.beginPath(); g.arc(h.screen[0], h.screen[1], 3, 0, Math.PI * 2); g.fill(); }
    label(`${p.id}${p.anim ? ` ${p.anim}` : ''}${p.moment ? ` [${p.moment}]` : ''}`, p.screen[0], p.screen[1], '#ff8fa6');
  }
  return t.toDataURL('image/png');
}
