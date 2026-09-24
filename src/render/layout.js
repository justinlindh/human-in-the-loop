// Stage shells (floor, walls, windows, door) in meters, origin at the floor center. The two back
// walls are at x = -W/2 and z = -D/2; the camera looks at them from +x, +z. Everything inside the
// room comes from office.placed on a 1 m tile grid: tile (0, 0) is the back corner, tile x runs
// along world +x and tile y along world +z.

import { ITEMS } from '../data/items.js';
import { OFFICE_STAGES } from '../data/office.js';

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

export function stageLayout(stage) {
  const L = STAGES[Math.max(0, Math.min(STAGES.length - 1, stage | 0))];
  const data = OFFICE_STAGES[stage]?.grid;
  const grid = { w: data?.w ?? L.W, h: data?.h ?? L.D };
  const door = OFFICE_STAGES[stage]?.door ?? L.door;
  return {
    ...L, grid, door, doorWorld: tileCenter(L, door.x, door.y), openings: withDoor(L, grid, door),
    blocked: OFFICE_STAGES[stage]?.blocked ?? L.blocked ?? [],
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

// Nav grid over the floor. Obstacles are axis-aligned rects { x0, z0, x1, z1 } in meters.
export function createNav(L, obstacles, cell = 0.35) {
  const nx = Math.ceil(L.W / cell), nz = Math.ceil(L.D / cell);
  const blocked = new Uint8Array(nx * nz);
  const ix = (x) => Math.floor((x + L.W / 2) / cell);
  const iz = (z) => Math.floor((z + L.D / 2) / cell);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = -L.W / 2 + (i + 0.5) * cell, z = -L.D / 2 + (k + 0.5) * cell;
      const edge = x < -L.W / 2 + 0.35 || z < -L.D / 2 + 0.35 || x > L.W / 2 - 0.2 || z > L.D / 2 - 0.2;
      if (edge || obstacles.some((r) => x > r.x0 - 0.12 && x < r.x1 + 0.12 && z > r.z0 - 0.12 && z < r.z1 + 0.12)) blocked[i + k * nx] = 1;
    }
  }
  const center = (i, k) => ({ x: -L.W / 2 + (i + 0.5) * cell, z: -L.D / 2 + (k + 0.5) * cell });

  function nearestFree(i, k) {
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

  // A* on the grid with 8-way moves; returns world points from start to goal (inclusive).
  function path(from, to) {
    const [si, sk] = nearestFree(Math.max(0, Math.min(nx - 1, ix(from.x))), Math.max(0, Math.min(nz - 1, iz(from.z))));
    const [gi, gk] = nearestFree(Math.max(0, Math.min(nx - 1, ix(to.x))), Math.max(0, Math.min(nz - 1, iz(to.z))));
    const N = nx * nz;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const open = [si + sk * nx];
    const inOpen = new Uint8Array(N);
    const closed = new Uint8Array(N);
    const h = (n) => Math.hypot((n % nx) - gi, Math.floor(n / nx) - gk);
    g[open[0]] = 0;
    inOpen[open[0]] = 1;
    const goal = gi + gk * nx;
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
          const cost = g[cur] + (di && dk ? Math.SQRT2 : 1);
          if (cost < g[n]) {
            g[n] = cost;
            came[n] = cur;
            if (!inOpen[n]) { open.push(n); inOpen[n] = 1; }
          }
        }
      }
    }
    if (came[goal] === -1 && goal !== si + sk * nx) return [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
    const cells = [];
    for (let n = goal; n !== -1; n = came[n]) cells.push(n);
    cells.reverse();
    const pts = [{ x: from.x, z: from.z }];
    // Keep only turning points so walkers move in long straight runs.
    for (let j = 1; j < cells.length - 1; j++) {
      const a = cells[j - 1], b = cells[j], c = cells[j + 1];
      if (b - a !== c - b) pts.push(center(b % nx, Math.floor(b / nx)));
    }
    pts.push({ x: to.x, z: to.z });
    return pts;
  }

  return { path, blocked, nx, nz, cell };
}
