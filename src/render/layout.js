// Stage shells (floor, walls, windows, door) in meters, origin at the floor center. The two back
// walls are at x = -W/2 and z = -D/2; the camera looks at them from +x, +z. Everything inside the
// room comes from office.placed on a 1 m tile grid: tile (0, 0) is the back corner, tile x runs
// along world +x and tile y along world +z.

import { ITEMS } from '../data/items.js';
import { OFFICE_STAGES, officeShape } from '../data/office.js';

const PI = Math.PI;

function stage0() {
  const W = 9, D = 7;
  return {
    name: 'Garage', W, D, wallH: 2.5,
    floor: 'concrete', wall: 'block',
    openings: [
      { wall: 'x', at: -1.0, width: 2.6, bottom: 0, top: 2.1, kind: 'garage' },
      { wall: 'z', at: 1.5, width: 1.6, bottom: 1.05, top: 2.35, kind: 'window' },
      { wall: 'px', at: 0.5, width: 1.6, bottom: 1.05, top: 2.35, kind: 'window' },
    ],
    door: { x: 4, y: 6 },
    blocked: [[8, 0]],
    lights: [{ x: -1.5, z: 0.5 }, { x: 2.0, z: -1.5 }, { x: 1.5, z: 2.0 }],
  };
}

function stage1() {
  const W = 15, D = 12;
  return {
    name: 'Office Floor', W, D, wallH: 2.6,
    floor: 'carpet', wall: 'cream',
    openings: [
      { wall: 'z', at: -5.0, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'z', at: 0.0, width: 1.6, bottom: 1.25, top: 2.45, kind: 'window' },
      { wall: 'z', at: 4.5, width: 1.6, bottom: 1.25, top: 2.45, kind: 'window' },
      { wall: 'x', at: -2.5, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'x', at: 2.5, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'px', at: -2.5, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'px', at: 2.5, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'pz', at: -3.5, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'pz', at: 3.5, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
    ],
    door: { x: 7, y: 11 },
    blocked: [[5, 4], [9, 4], [5, 8], [9, 8]],
    lights: [{ x: -4.5, z: -3.0 }, { x: 0, z: -3.0 }, { x: 4.5, z: -3.0 }, { x: -4.5, z: 2.5 }, { x: 0, z: 2.5 }, { x: 4.5, z: 2.5 }],
  };
}

function stage2() {
  const W = 21, D = 16;
  return {
    name: 'HQ Building', W, D, wallH: 2.8,
    floor: 'twotone', wall: 'sage', split: -4.5,
    openings: [
      { wall: 'z', at: -7.5, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'z', at: -1.5, width: 2.4, bottom: 1.3, top: 2.6, kind: 'window', wide: true },
      { wall: 'z', at: 4.5, width: 2.4, bottom: 1.3, top: 2.6, kind: 'window', wide: true },
      { wall: 'x', at: -4.0, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'x', at: 1.5, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'px', at: -4, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'px', at: 3, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'x', at: 5.5, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'pz', at: -5, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'pz', at: 5, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
    ],
    door: { x: 10, y: 15 },
    blocked: [[6, 5], [14, 5], [6, 10], [14, 10]],
    lights: [{ x: -6, z: -4 }, { x: 0, z: -4 }, { x: 6, z: -4 }, { x: -6, z: 3 }, { x: 0, z: 3 }, { x: 6, z: 3 }],
  };
}

export const STAGES = [stage0(), stage1(), stage2()];

export function stageLayout(stage, expansion = 0) {
  if (stage === 2 && expansion > 0 && OFFICE_STAGES[2]?.expansions?.[expansion - 1]) return hqExpanded(expansion);
  const L = STAGES[Math.max(0, Math.min(STAGES.length - 1, stage | 0))];
  const data = OFFICE_STAGES[stage]?.grid;
  const grid = { w: data?.w ?? L.W, h: data?.h ?? L.D };
  const door = OFFICE_STAGES[stage]?.door ?? L.door;
  return {
    ...L, grid, door, doorWorld: tileCenter(L, door.x, door.y), openings: withDoor(L, grid, door),
    blocked: OFFICE_STAGES[stage]?.blocked ?? L.blocked ?? [],
    extras: {},
  };
}

// The HQ after expansion steps. Everything is placed by tile, so the original part of the floor keeps
// its windows, floor split and pillars. extras describes what the shell adds for each step:
//   seams:   floor threshold strips where an old wall stood ({ axis: 'x'|'z', at, from, to }, world m)
//   columns: pilasters left at the ends of a removed wall
//   decks:   decking areas (the roof terrace) with a glass rail on their outer edges
//   annex:   the new wing's floor rectangle
function hqExpanded(expansion) {
  const base = STAGES[2];
  const shape = officeShape(2, expansion);
  const W = shape.grid.w, D = shape.grid.h;
  const X = (tx) => -W / 2 + tx;           // world x of a tile edge
  const Z = (ty) => -D / 2 + ty;
  const zones = shape.zones ?? [];
  const terrace = zones.find((z) => z.id === 'terrace');
  const annex = zones.find((z) => z.id === 'annex');
  const win = (wall, at) => ({ wall, at, width: 2.4, bottom: wall === 'z' ? 1.3 : 1.0, top: wall === 'z' ? 2.6 : 2.5, kind: 'window', wide: true });
  const openings = [];
  // Back wall along x: a window every 6 tiles across the indoor part; the terrace span is open rail.
  const indoorW = terrace ? terrace.x0 : W;
  for (let t = 3; t + 1.2 <= indoorW - 0.6; t += 6) openings.push(win('z', X(t)));
  if (terrace) openings.push({ wall: 'z', at: X((terrace.x0 + terrace.x1 + 1) / 2), width: terrace.x1 + 1 - terrace.x0, bottom: 0, top: base.wallH, kind: 'rail' });
  // Left wall along z: the original windows, then one more per annex bay.
  for (const t of [4, 9.5, 13.5]) openings.push(win('x', Z(t)));
  if (annex) for (let t = annex.y0 + 3; t < D - 1; t += 5) openings.push(win('x', Z(t)));
  // Right wall: rail beside the terrace, wall with windows elsewhere.
  if (terrace) {
    openings.push({ wall: 'px', at: Z((terrace.y0 + terrace.y1 + 1) / 2), width: terrace.y1 + 1 - terrace.y0, bottom: 0, top: base.wallH, kind: 'rail' });
    if (annex) openings.push(win('px', Z((annex.y0 + D) / 2)));
  } else {
    for (const t of [4, 11]) openings.push(win('px', Z(t)));
  }
  // Front wall: windows spread between the corners, clear of the door.
  for (let t = 5.5; t < W - 2; t += 10) openings.push(win('pz', X(t)));
  const grid = { w: W, h: D };
  const door = shape.door;
  const L0 = { ...base, W, D, split: X(6), openings };
  // Interior lights: the renderer has six, spread evenly over the indoor floor.
  const lights = [];
  const rows = 2, cols = 3;
  for (let i = 0; i < cols; i++) for (let k = 0; k < rows; k++) lights.push({ x: X(indoorW * (i + 0.5) / cols), z: Z(D * (k + 0.5) / rows) });
  const extras = { seams: [], columns: [], decks: [], annex: null };
  // Knock-through: the old right wall line at tile 21, now open floor.
  extras.seams.push({ axis: 'x', at: X(21), from: Z(0), to: Z(16) });
  extras.columns.push({ x: X(21), z: Z(0) + 0.12 }, { x: X(21), z: Z(16) - 0.12 });
  if (terrace) {
    extras.decks.push({ x0: X(terrace.x0), x1: X(terrace.x1 + 1), z0: Z(terrace.y0), z1: Z(terrace.y1 + 1) });
    extras.seams.push({ axis: 'x', at: X(terrace.x0), from: Z(terrace.y0), to: Z(terrace.y1 + 1) });
  }
  if (annex) {
    extras.annex = { x0: X(annex.x0), x1: X(annex.x1 + 1), z0: Z(annex.y0), z1: Z(annex.y1 + 1) };
    extras.seams.push({ axis: 'z', at: Z(16), from: X(0), to: X(W) });
    extras.columns.push({ x: X(0) + 0.12, z: Z(16) }, { x: X(W) - 0.12, z: Z(16) });
  }
  return {
    ...L0, name: base.name, grid, door, doorWorld: tileCenter(L0, door.x, door.y), openings: withDoor(L0, grid, door),
    blocked: shape.blocked, lights, extras, expansion,
  };
}

// The door opening goes in whichever wall the door tile touches; windows it would overlap are dropped.
function withDoor(L, grid, door) {
  const c = tileCenter(L, door.x, door.y);
  const wall = door.y >= grid.h - 1 ? 'pz' : door.y <= 0 ? 'z' : door.x <= 0 ? 'x' : 'px';
  const at = wall === 'pz' || wall === 'z' ? c.x : c.z;
  const d = { wall, at, width: 1.2, bottom: 0, top: 2.1, kind: 'door' };
  const keep = L.openings.filter((o) => o.wall !== wall || Math.abs(o.at - at) > (o.width + d.width) / 2 + 0.1);
  return [...keep, d];
}

// Footprints the renderer falls back on when ITEMS has none.
const FOOTPRINTS = {
  desk: { w: 1, h: 2 }, meeting_table: { w: 3, h: 2 }, whiteboard: { w: 2, h: 1 }, coffee_corner: { w: 2, h: 1 },
  plant: { w: 1, h: 1 }, bookshelf: { w: 2, h: 1 },
  espresso: { w: 2, h: 1 }, plant_wall: { w: 2, h: 1 }, nap_pod: { w: 1, h: 2 }, arcade: { w: 1, h: 1 },
  standing_desk: { w: 2, h: 1 }, trophy_case: { w: 2, h: 1 }, server_rack: { w: 2, h: 1 }, library: { w: 2, h: 2 },
  monitoring_wall: { w: 3, h: 1 }, whiteboard_wall: { w: 3, h: 1 },
  couch: { w: 2, h: 1 }, ping_pong_table: { w: 2, h: 1 }, ping_pong: { w: 2, h: 1 }, foosball: { w: 1, h: 1 },
};

export function footprint(itemId, rot = 0) {
  const f = ITEMS[itemId]?.footprint ?? FOOTPRINTS[itemId] ?? { w: 1, h: 1 };
  return rot % 2 ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
}

export function tileCenter(L, tx, ty) {
  return { x: -L.W / 2 + tx + 0.5, z: -L.D / 2 + ty + 0.5 };
}

export function worldToTile(L, x, z) {
  return { x: Math.floor(x + L.W / 2), y: Math.floor(z + L.D / 2) };
}

// World transform of a placed item: its footprint center, and a yaw that turns the model's +Z
// front toward +y at rot 0, -x at rot 1, -y at rot 2, +x at rot 3 (the sim's rotation: local
// cell (lx, ly) goes to (h-1-ly, lx) at rot 1).
export function placedTransform(L, p) {
  const f = footprint(p.itemId, p.rot ?? 0);
  return { x: -L.W / 2 + p.x + f.w / 2, z: -L.D / 2 + p.y + f.h / 2, rotY: -(p.rot ?? 0) * PI / 2, w: f.w, h: f.h };
}

// Nav grid over the floor. Obstacles are axis-aligned rects { x0, z0, x1, z1 } in meters, with an
// optional margin: a cell is blocked when its centre is within that of one (NAV_MARGIN by default).
const NEAR_COST = 3;   // extra cost of a cell inside a soft clearance (one cell's move costs 1)
const NAV_MARGIN = 0.12;
export function createNav(L, obstacles, cell = 0.35) {
  const nx = Math.ceil(L.W / cell), nz = Math.ceil(L.D / cell);
  const blocked = new Uint8Array(nx * nz);
  const ix = (x) => Math.floor((x + L.W / 2) / cell);
  const iz = (z) => Math.floor((z + L.D / 2) / cell);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = -L.W / 2 + (i + 0.5) * cell, z = -L.D / 2 + (k + 0.5) * cell;
      const edge = x < -L.W / 2 + 0.35 || z < -L.D / 2 + 0.35 || x > L.W / 2 - 0.2 || z > L.D / 2 - 0.2;
      if (edge || obstacles.some((r) => { const m = r.margin ?? NAV_MARGIN; return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; })) blocked[i + k * nx] = 1;
    }
  }
  const N0 = nx * nz, grid0 = blocked;
  const center = (i, k) => ({ x: -L.W / 2 + (i + 0.5) * cell, z: -L.D / 2 + (k + 0.5) * cell });

  // The grid with every blocked cell grown by `clear` metres, for something wider than one person.
  const grown = new Map();
  function gridFor(clear) {
    const d = Math.round(clear / cell);
    if (d <= 0) return blocked;
    if (grown.has(d)) return grown.get(d);
    const out = new Uint8Array(N0);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (!blocked[i + k * nx]) continue;
      for (let a = Math.max(0, i - d); a <= Math.min(nx - 1, i + d); a++) for (let b = Math.max(0, k - d); b <= Math.min(nz - 1, k + d); b++) out[a + b * nx] = 1;
    }
    grown.set(d, out);
    return out;
  }

  function nearestFree(i, k, blocked = grid0) {
    for (let r = 0; r < Math.max(nx, nz); r++) {
      for (let di = -r; di <= r; di++) {
        for (let dk = -r; dk <= r; dk++) {
          if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
          const a = i + di, b = k + dk;
          if (a >= 0 && b >= 0 && a < nx && b < nz && !blocked[a + b * nx]) return [a, b];
        }
      }
    }
    return [i, k];
  }

  // A* on the grid with 8-way moves between two cells. Returns the cell each was reached from
  // (came) and whether the goal was reached; a failed search leaves `closed` holding every cell the
  // start can reach.
  function search(si, sk, gi, gk, blocked, near) {
    const N = nx * nz;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const start = si + sk * nx, goal = gi + gk * nx;
    const open = [start];
    const inOpen = new Uint8Array(N);
    const closed = new Uint8Array(N);
    const h = (n) => Math.hypot((n % nx) - gi, Math.floor(n / nx) - gk);
    g[start] = 0;
    inOpen[start] = 1;
    while (open.length) {
      let bi = 0;
      for (let j = 1; j < open.length; j++) if (g[open[j]] + h(open[j]) < g[open[bi]] + h(open[bi])) bi = j;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      inOpen[cur] = 0;
      if (cur === goal) break;
      closed[cur] = 1;
      const ci = cur % nx, ck = Math.floor(cur / nx);
      for (let di = -1; di <= 1; di++) {
        for (let dk = -1; dk <= 1; dk++) {
          if (!di && !dk) continue;
          const a = ci + di, b = ck + dk;
          if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
          const n = a + b * nx;
          if (blocked[n] || closed[n]) continue;
          if (di && dk && (blocked[ci + di + ck * nx] || blocked[ci + (ck + dk) * nx])) continue;
          const cost = g[cur] + (di && dk ? Math.SQRT2 : 1) + (near?.[n] ? NEAR_COST : 0);
          if (cost < g[n]) {
            g[n] = cost;
            came[n] = cur;
            if (!inOpen[n]) { open.push(n); inOpen[n] = 1; }
          }
        }
      }
    }
    return { came, closed, found: start === goal || came[goal] !== -1 };
  }

  // The cell of `region` (a mask) nearest to a world point, or -1 when the region is empty.
  function nearestIn(region, x, z) {
    let best = -1, bd = Infinity;
    for (let n = 0; n < region.length; n++) {
      if (!region[n]) continue;
      const c = center(n % nx, Math.floor(n / nx)), d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // A* on the grid with 8-way moves; returns world points from start to goal (inclusive). clear > 0
  // keeps the way that many metres from anything blocked; with no such way, the result is null.
  // soft: instead, cells nearer than that cost extra, so the way keeps its distance where it can.
  // When the start and goal cells don't connect (a sitter whose nearest free cell is a pocket
  // between desks), the smaller side is swapped for its nearest cell in the larger one, so nobody
  // walks a straight line through the furniture.
  // avoid: circles ({ x, z, r }) the way must also keep out of; with no such way, the result is null.
  function path(from, to, clear = 0, { soft = false, avoid = null } = {}) {
    const near = soft && clear > 0 ? gridFor(clear) : null;
    let blocked = near ? grid0 : gridFor(clear);
    if (avoid?.length) {
      blocked = Uint8Array.from(blocked);
      for (const c of avoid) {
        for (let i = Math.max(0, ix(c.x - c.r)); i <= Math.min(nx - 1, ix(c.x + c.r)); i++) for (let k = Math.max(0, iz(c.z - c.r)); k <= Math.min(nz - 1, iz(c.z + c.r)); k++) {
          const p = center(i, k);
          if (Math.hypot(p.x - c.x, p.z - c.z) < c.r) blocked[i + k * nx] = 1;
        }
      }
    }
    let [si, sk] = nearestFree(Math.max(0, Math.min(nx - 1, ix(from.x))), Math.max(0, Math.min(nz - 1, iz(from.z))), blocked);
    let [gi, gk] = nearestFree(Math.max(0, Math.min(nx - 1, ix(to.x))), Math.max(0, Math.min(nz - 1, iz(to.z))), blocked);
    let res = search(si, sk, gi, gk, blocked, near);
    let end = to;
    if (!res.found && avoid?.length) return null;
    if (!res.found) {
      if (clear > 0 && !near) return null;
      const fromStart = res.closed;
      const fromGoal = search(gi, gk, si, sk, blocked, near).closed;
      const size = (m) => m.reduce((a, v) => a + v, 0);
      if (size(fromGoal) >= size(fromStart)) {
        const n = nearestIn(fromGoal, from.x, from.z);
        if (n >= 0) { si = n % nx; sk = Math.floor(n / nx); }
      } else {
        const n = nearestIn(fromStart, to.x, to.z);
        if (n >= 0) { gi = n % nx; gk = Math.floor(n / nx); end = center(gi, gk); }
      }
      res = search(si, sk, gi, gk, blocked, near);
      if (!res.found) return [{ x: from.x, z: from.z }, { x: from.x, z: from.z }];
    }
    const cells = [];
    for (let n = gi + gk * nx; n !== -1; n = res.came[n]) cells.push(n);
    cells.reverse();
    const pts = [{ x: from.x, z: from.z }];
    // A start moved to another region begins at its cell, not across whatever lies between.
    if (cells.length && (cells[0] % nx !== Math.max(0, Math.min(nx - 1, ix(from.x))) || Math.floor(cells[0] / nx) !== Math.max(0, Math.min(nz - 1, iz(from.z))))) pts.push(center(cells[0] % nx, Math.floor(cells[0] / nx)));
    // Keep only turning points so walkers move in long straight runs.
    for (let j = 1; j < cells.length - 1; j++) {
      const a = cells[j - 1], b = cells[j], c = cells[j + 1];
      if (b - a !== c - b) pts.push(center(b % nx, Math.floor(b / nx)));
    }
    // A goal inside furniture (a seat's approach, a spot on an item) is reached from its cell, not
    // straight from the last turn across whatever lies between.
    const gc = cells.at(-1);
    const last = pts.at(-1), gcx = center(gc % nx, Math.floor(gc / nx));
    if (cells.length > 1 && (gc % nx !== Math.max(0, Math.min(nx - 1, ix(end.x))) || Math.floor(gc / nx) !== Math.max(0, Math.min(nz - 1, iz(end.z)))) && (last.x !== gcx.x || last.z !== gcx.z)) pts.push(gcx);
    pts.push({ x: end.x, z: end.z });
    return pts;
  }

  // The point itself when it is walkable, else the center of the nearest walkable cell.
  function freePoint(x, z) {
    const i = Math.max(0, Math.min(nx - 1, ix(x))), k = Math.max(0, Math.min(nz - 1, iz(z)));
    if (!blocked[i + k * nx]) return { x, z };
    const [a, b] = nearestFree(i, k);
    return center(a, b);
  }
  // r > 0 tests a body's footprint (its center and four points r out), not just the center.
  const isBlocked = (x, z, r = 0) => {
    const one = (px, pz) => { const i = ix(px), k = iz(pz); return i < 0 || k < 0 || i >= nx || k >= nz || !!blocked[i + k * nx]; };
    return one(x, z) || (r > 0 && (one(x + r, z) || one(x - r, z) || one(x, z + r) || one(x, z - r)));
  };

  return { path, blocked, nx, nz, cell, freePoint, isBlocked };
}
