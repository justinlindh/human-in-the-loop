// Floor plans for the three office stages, in meters. Origin at the floor center. The two
// back walls are at x = -W/2 and z = -D/2; the camera looks at them from +x, +z.
//
// A desk slot says where a person sits and which way they face. Desks come in facing pairs
// ("pods"): one side faces +X (toward the camera, faces visible), the other faces -X (backs
// visible, screens visible). Item slots hold shop items; a slot's model faces rotY.

const PI = Math.PI;
export const FACE_PX = PI / 2;      // character yaw that faces +X
export const FACE_NX = -PI / 2;
export const FACE_PZ = 0;

const DESK_REACH = 0.55;            // chair center to desk center
const DESK_PITCH = 1.35;            // desk spacing along a pod
const POD_GAP = 0.72;               // desk center to facing desk center

// A pod of `n` desk pairs starting at the +X-facing chair (x0, z0), running along +z.
function pod(x0, z0, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const z = z0 + i * DESK_PITCH;
    out.push({ x: x0, z, face: FACE_PX });
    out.push({ x: x0 + 2 * DESK_REACH + POD_GAP, z, face: FACE_NX });
  }
  return out;
}

// Seat position -> desk and monitor transforms.
export function deskTransforms(slot) {
  const fx = Math.sin(slot.face), fz = Math.cos(slot.face);
  return {
    chair: { x: slot.x, z: slot.z, rotY: slot.face },
    desk: { x: slot.x + fx * DESK_REACH, z: slot.z + fz * DESK_REACH, rotY: slot.face + PI },
    monitor: { x: slot.x + fx * (DESK_REACH + 0.14), z: slot.z + fz * (DESK_REACH + 0.14), rotY: slot.face + PI },
  };
}

const wallSlot = (wall, at, W, D) => (wall === 'z'
  ? { x: at, z: -D / 2 + 0.2 + 0.62, rotY: 0 }
  : { x: -W / 2 + 0.2 + 0.62, z: at, rotY: PI / 2 });

function stage0() {
  const W = 9, D = 7;
  return {
    name: 'Garage', W, D, wallH: 2.5,
    floor: 'concrete', wall: 'block',
    desks: pod(-0.4, 0.2, 2),
    items: [wallSlot('z', 3.1, W, D), wallSlot('x', 2.15, W, D), wallSlot('z', 0.45, W, D)],
    openings: [
      { wall: 'x', at: -1.0, width: 2.6, bottom: 0, top: 2.1, kind: 'garage' },
      { wall: 'z', at: 0.45, width: 1.6, bottom: 1.05, top: 2.35, kind: 'window' },
      { wall: 'px', at: 0.8, width: 1.6, bottom: 1.05, top: 2.35, kind: 'window' },
    ],
    fixtures: [
      { model: 'server_rack', x: -3.95, z: -2.95, rotY: 0, rack: true },
      { model: 'whiteboard', x: -1.9, z: -2.85, rotY: 0, zone: 'whiteboard' },
      { model: 'plant_tall', x: -4.0, z: 0.75, rotY: 0.4 },
      { model: 'plant_small', x: 4.0, z: 3.0, rotY: 0 },
      { box: 'cardboard', x: -3.15, z: -3.05, w: 0.5, h: 0.4, d: 0.45, rotY: 0.2 },
      { box: 'cardboard', x: -3.2, z: -3.0, w: 0.4, h: 0.3, d: 0.38, y: 0.4, rotY: -0.3 },
      { box: 'cardboard', x: 2.2, z: 3.0, w: 0.55, h: 0.42, d: 0.5, rotY: 0.5 },
      { shelf: true, x: 4.05, z: 0.5, rotY: -PI / 2 },
      { model: 'kitchenette', x: 4.05, z: -2.15, rotY: -PI / 2, zone: 'coffee' },
    ],
    zones: {
      door: { x: -3.4, z: -1.0 },
      coffee: { x: 3.25, z: -2.3 },
      whiteboard: { x: -1.9, z: -1.9 },
      oversight: [{ x: -3.2, z: -2.1 }],
      wander: [{ x: 2.8, z: -1.0 }, { x: 2.8, z: 2.6 }, { x: -2.2, z: 2.6 }],
    },
    lights: [{ x: -0.4, z: 0.9 }, { x: 2.6, z: -1.5 }, { x: -2.8, z: -1.8 }],
  };
}

function stage1() {
  const W = 15, D = 12;
  return {
    name: 'Office Floor', W, D, wallH: 2.6,
    floor: 'carpet', wall: 'cream',
    desks: [...pod(-2.2, -1.6, 3), ...pod(1.6, -1.6, 3)],
    items: [
      wallSlot('z', -1.1, W, D), wallSlot('z', 1.2, W, D), wallSlot('z', 3.5, W, D), wallSlot('z', 5.8, W, D),
      wallSlot('x', 0.0, W, D), wallSlot('x', 2.4, W, D),
      { x: 5.6, z: 3.4, rotY: 0 }, { x: 5.6, z: 5.8 - 0.62, rotY: 0 },
    ],
    openings: [
      { wall: 'x', at: 5.0, width: 1.3, bottom: 0, top: 2.1, kind: 'door' },
      { wall: 'z', at: -5.8, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'z', at: 2.35, width: 1.6, bottom: 1.25, top: 2.45, kind: 'window' },
      { wall: 'z', at: 4.65, width: 1.6, bottom: 1.25, top: 2.45, kind: 'window' },
      { wall: 'px', at: -2.5, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'px', at: 2.5, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'pz', at: -3.0, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
      { wall: 'pz', at: 3.0, width: 1.6, bottom: 1.0, top: 2.3, kind: 'window' },
    ],
    meeting: { x0: -7.5, x1: -4.0, z0: -6.0, z1: -3.0, door: 'x' },
    fixtures: [
      { model: 'server_rack', x: -3.4, z: -5.4, rotY: 0, rack: true },
      { model: 'server_rack', x: -2.75, z: -5.4, rotY: 0, rack: true },
      { model: 'coffee_machine', x: -6.85, z: -2.1, rotY: PI / 2, zone: 'coffee' },
      { model: 'water_cooler', x: -7.05, z: -1.3, rotY: PI / 2 },
      { model: 'whiteboard', x: 6.3, z: -2.0, rotY: 0, zone: 'whiteboard' },
      { model: 'couch', x: -4.6, z: 4.6, rotY: 0 },
      { rug: 'rug_mustard', x: -4.6, z: 3.8, w: 2.6, d: 1.8 },
      { model: 'plant_tall', x: -6.9, z: 3.9, rotY: 0.3 },
      { model: 'plant_small', x: -2.9, z: 5.3, rotY: 0 },
      { model: 'plant_tall', x: 7.0, z: 0.3, rotY: 1.2 },
      { model: 'plant_small', x: -3.9, z: -2.6, rotY: 0 },
      { island: true, x: 1.0, z: 4.6, len: 2.4 },
      { rug: 'rug_teal', x: 1.0, z: 4.6, w: 3.6, d: 1.9 },
    ],
    zones: {
      door: { x: -6.6, z: 5.0 },
      coffee: { x: -6.0, z: -2.1 },
      whiteboard: { x: 6.3, z: -1.0 },
      oversight: [{ x: -3.1, z: -4.4 }, { x: -2.4, z: -4.4 }],
      meeting: [{ x: -6.3, z: -4.9 }, { x: -5.3, z: -4.9 }, { x: -6.3, z: -4.0 }, { x: -5.3, z: -4.0 }],
      lounge: [{ x: -5.1, z: 4.45 }, { x: -4.1, z: 4.45 }],
      wander: [{ x: 5.0, z: -3.8 }, { x: -1.0, z: 5.2 }, { x: -1.0, z: 3.4 }, { x: 3.0, z: 3.4 }],
    },
    lights: [{ x: -1.2, z: -0.3 }, { x: 2.6, z: -0.3 }, { x: 2.6, z: 2.6 }, { x: -5.8, z: -4.5 }, { x: -4.6, z: 3.8 }, { x: 5.4, z: 4.4 }],
  };
}

function stage2() {
  const W = 21, D = 16;
  return {
    name: 'HQ Building', W, D, wallH: 2.8,
    floor: 'twotone', wall: 'sage',
    desks: [...pod(-3.9, -5.0, 5), ...pod(-0.25, -5.0, 5), ...pod(3.4, -5.0, 5)],
    items: [
      wallSlot('z', 0.9, W, D), wallSlot('z', 3.2, W, D), wallSlot('z', 5.5, W, D), wallSlot('z', 7.8, W, D),
      wallSlot('x', -2.8, W, D), wallSlot('x', -0.5, W, D), wallSlot('x', 1.8, W, D), wallSlot('x', 4.1, W, D),
      { x: 2.6, z: 4.2, rotY: 0 }, { x: 5.0, z: 4.2, rotY: 0 }, { x: 7.4, z: 4.2, rotY: 0 }, { x: 9.7, z: 4.2, rotY: 0 },
      { x: 2.6, z: 6.9, rotY: 0 }, { x: 5.0, z: 6.9, rotY: 0 }, { x: 7.4, z: 6.9, rotY: 0 }, { x: 9.7, z: 6.9, rotY: 0 },
    ],
    openings: [
      { wall: 'x', at: 6.9, width: 1.4, bottom: 0, top: 2.2, kind: 'door' },
      { wall: 'z', at: -8.8, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'z', at: 2.05, width: 2.4, bottom: 1.3, top: 2.6, kind: 'window', wide: true },
      { wall: 'z', at: 6.65, width: 2.4, bottom: 1.3, top: 2.6, kind: 'window', wide: true },
      { wall: 'x', at: -6.0, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'px', at: -4, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'px', at: 3, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'pz', at: -5, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
      { wall: 'pz', at: 4, width: 2.4, bottom: 1.0, top: 2.5, kind: 'window', wide: true },
    ],
    meeting: { x0: -10.5, x1: -6.5, z0: -8.0, z1: -4.2, door: 'x' },
    fixtures: [
      { model: 'server_rack', x: -5.9, z: -7.4, rotY: 0, rack: true },
      { model: 'server_rack', x: -5.25, z: -7.4, rotY: 0, rack: true },
      { model: 'server_rack', x: -4.6, z: -7.4, rotY: 0, rack: true },
      { model: 'server_rack', x: -3.95, z: -7.4, rotY: 0, rack: true },
      { model: 'monitoring_wall', x: -1.5, z: -7.35, rotY: 0, zone: 'monitor' },
      { model: 'coffee_machine', x: -6.2, z: 7.3, rotY: 0, zone: 'coffee' },
      { model: 'water_cooler', x: -4.9, z: 7.4, rotY: 0 },
      { model: 'whiteboard', x: 8.6, z: -3.2, rotY: 0, zone: 'whiteboard' },
      { model: 'couch', x: -8.2, z: 2.9, rotY: PI / 2 },
      { model: 'couch', x: -6.4, z: 5.2, rotY: 0 },
      { rug: 'rug_teal', x: -6.6, z: 3.4, w: 3.4, d: 3.0 },
      { model: 'plant_tall', x: -9.9, z: 5.6, rotY: 0.3 },
      { model: 'plant_tall', x: 9.9, z: -7.4, rotY: 1.0 },
      { model: 'plant_small', x: -8.7, z: 7.3, rotY: 0 },
      { trophyShelf: true, x: -9.95, z: 0.55, rotY: PI / 2 },
      { island: true, x: -0.9, z: 5.2, len: 2.8 },
      { rug: 'rug_mustard', x: -0.9, z: 5.2, w: 4.2, d: 2.2 },
    ],
    zones: {
      door: { x: -9.6, z: 6.9 },
      coffee: { x: -6.2, z: 6.5 },
      whiteboard: { x: 8.6, z: -2.2 },
      oversight: [{ x: -2.3, z: -6.1 }, { x: -1.5, z: -6.1 }, { x: -0.7, z: -6.1 }, { x: -4.9, z: -6.5 }],
      meeting: [{ x: -9.2, z: -6.6 }, { x: -8.0, z: -6.6 }, { x: -9.2, z: -5.6 }, { x: -8.0, z: -5.6 }],
      lounge: [{ x: -7.8, z: 2.4 }, { x: -7.8, z: 3.4 }, { x: -6.9, z: 4.9 }, { x: -5.9, z: 4.9 }],
      wander: [{ x: 8.0, z: -5.5 }, { x: 1.0, z: 2.6 }, { x: -2.0, z: 6.9 }, { x: 6.5, z: 2.0 }],
    },
    lights: [{ x: -2.8, z: -2.2 }, { x: 0.8, z: -2.2 }, { x: 4.5, z: -2.2 }, { x: -7.2, z: 3.6 }, { x: 7.4, z: 5.5 }, { x: -8.4, z: -6.1 }],
  };
}

export const STAGES = [stage0(), stage1(), stage2()];

export function stageLayout(stage) {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, stage | 0))];
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
