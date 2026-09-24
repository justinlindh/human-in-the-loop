import { newId } from './util.js';
import { registerAction } from './registry.js';
import { emitChat } from './chat.js';
import { ITEMS } from '../data/items.js';
import { OFFICE_STAGES } from '../data/office.js';
import { adjacencyLinks } from './bonus.js';

const key = (x, y) => `${x},${y}`;

// A footprint cell (lx, ly) at rot 0 moved to its place for a rotation; rot 1 and 3 swap w and h.
function rotateLocal(lx, ly, w, h, rot) {
  switch (rot) {
    case 1: return [h - 1 - ly, lx];
    case 2: return [w - 1 - lx, h - 1 - ly];
    case 3: return [ly, w - 1 - lx];
    default: return [lx, ly];
  }
}

// Every tile an item covers when its rotated box has its min corner at (x, y).
export function footprintCells(itemId, x, y, rot) {
  const { w, h } = ITEMS[itemId].footprint;
  const cells = [];
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const [dx, dy] = rotateLocal(lx, ly, w, h, rot);
      cells.push([x + dx, y + dy]);
    }
  }
  return cells;
}

// The chair tile of a desk set: its second footprint row, so the sitter faces the desk.
export function seatTile(placed) {
  const { w, h } = ITEMS[placed.itemId].footprint;
  const [dx, dy] = rotateLocal(0, h - 1, w, h, placed.rot);
  return [placed.x + dx, placed.y + dy];
}

export const desksOf = (placed) => placed.filter((p) => p.itemId === 'desk');
export const deskCapacity = (state) => desksOf(state.office.placed).length;

// Staff sit at desks in order: the i-th person on staff takes the i-th desk set.
export function seatOf(state, staffId) {
  const i = state.staff.findIndex((p) => p.id === staffId);
  const desk = desksOf(state.office.placed)[i];
  return desk ? seatTile(desk) : null;
}

// Whether every desk's chair has a free tile beside it that can be walked to from the door.
export function pathsClear(stageIdx, placed) {
  const st = OFFICE_STAGES[stageIdx];
  const { w, h } = st.grid;
  const solid = new Set(st.blocked.map(([x, y]) => key(x, y)));
  for (const p of placed) for (const [x, y] of footprintCells(p.itemId, p.x, p.y, p.rot)) solid.add(key(x, y));
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !solid.has(key(x, y));
  if (!open(st.door.x, st.door.y)) return false;
  const seen = new Set([key(st.door.x, st.door.y)]);
  const queue = [[st.door.x, st.door.y]];
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of STEPS) {
      const k = key(x + dx, y + dy);
      if (!seen.has(k) && open(x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); }
    }
  }
  return desksOf(placed).every((d) => {
    const [sx, sy] = seatTile(d);
    return STEPS.some(([dx, dy]) => seen.has(key(sx + dx, sy + dy)));
  });
}

// Why an item cannot go at (x, y, rot) on a stage given the other placed items, or null. Layout only.
function layoutProblem(stageIdx, others, { itemId, x, y, rot }) {
  const st = OFFICE_STAGES[stageIdx];
  if (![x, y, rot].every(Number.isInteger) || rot < 0 || rot > 3) return 'Out of bounds';
  const cells = footprintCells(itemId, x, y, rot);
  if (cells.some(([cx, cy]) => cx < 0 || cy < 0 || cx >= st.grid.w || cy >= st.grid.h)) return 'Out of bounds';
  const blocked = new Set(st.blocked.map(([bx, by]) => key(bx, by)));
  if (cells.some(([cx, cy]) => blocked.has(key(cx, cy)))) return 'Blocked';
  if (cells.some(([cx, cy]) => cx === st.door.x && cy === st.door.y)) return 'Keep the door clear';
  const taken = new Set();
  for (const p of others) for (const [ox, oy] of footprintCells(p.itemId, p.x, p.y, p.rot)) taken.add(key(ox, oy));
  if (cells.some(([cx, cy]) => taken.has(key(cx, cy)))) return 'Overlaps something';
  if (!pathsClear(stageIdx, [...others, { itemId, x, y, rot }])) return 'Would block the path to a desk';
  return null;
}

// Why a new copy of an item cannot be bought right now, ignoring where it goes, or null.
export function purchaseProblem(state, itemId) {
  const it = ITEMS[itemId];
  if (!it) return 'Unknown item';
  if (state.officeStage < it.minStage) return 'Needs a bigger office';
  if (it.requires === 'award' && state.stats.awards < 1) return 'Needs an award first';
  if (it.kind === 'shop' && state.office.placed.filter((p) => p.itemId === itemId).length >= 2) return 'You already have two';
  if (state.cash < it.costs[0]) return 'Not enough cash';
  return null;
}

// The same check placeItem and moveItem run. Pass id to check a move of an already placed item (moves are free).
export function placementCheck(state, { itemId, x, y, rot = 0, id = null }) {
  const moving = id ? state.office.placed.find((p) => p.id === id) : null;
  if (id && !moving) return { ok: false, reason: 'No such item' };
  const item = moving ? moving.itemId : itemId;
  if (!ITEMS[item]) return { ok: false, reason: 'Unknown item' };
  if (state.officeStage < ITEMS[item].minStage) return { ok: false, reason: 'Needs a bigger office' };
  const others = state.office.placed.filter((p) => p !== moving);
  const problem = layoutProblem(state.officeStage, others, { itemId: item, x, y, rot });
  if (problem) return { ok: false, reason: problem };
  if (!moving) {
    const reason = purchaseProblem(state, item);
    if (reason) return { ok: false, reason };
  }
  return { ok: true, reason: null };
}

// The first free spot for an item, scanning rows from the back corner, or null.
export function findSpot(stageIdx, placed, itemId, rots = [0, 1, 2, 3]) {
  const { w, h } = OFFICE_STAGES[stageIdx].grid;
  for (const rot of rots) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!layoutProblem(stageIdx, placed, { itemId, x, y, rot })) return { x, y, rot };
      }
    }
  }
  return null;
}

// Packs existing furniture into a stage: desks first, then bigger items. Returns what did not fit.
export function autoArrange(stageIdx, placed) {
  const area = (p) => ITEMS[p.itemId].footprint.w * ITEMS[p.itemId].footprint.h;
  const order = [...placed].sort((a, b) => (b.itemId === 'desk') - (a.itemId === 'desk') || area(b) - area(a));
  const out = [];
  const left = [];
  for (const p of order) {
    const spot = findSpot(stageIdx, out, p.itemId, p.itemId === 'desk' ? [0, 2, 1, 3] : [0, 1, 2, 3]);
    if (spot) out.push({ ...p, ...spot });
    else left.push(p);
  }
  // Keep the original order so desk seating does not reshuffle people.
  const byId = new Map(out.map((p) => [p.id, p]));
  return { placed: placed.filter((p) => byId.has(p.id)).map((p) => byId.get(p.id)), left };
}

// What placing (or moving, with id) an item at (x, y, rot) would change in adjacency: every link that
// involves the item, measured exactly as itemBonus measures it. paid false means the desk is empty for now.
export function adjacencyPreview(state, { itemId, x, y, rot = 0, id = null }) {
  const moving = id ? state.office.placed.find((p) => p.id === id) : null;
  const item = moving ? moving.itemId : itemId;
  if (!ITEMS[item]) return [];
  const candidate = { id: moving?.id ?? 'preview', itemId: item, level: moving?.level ?? 1, x, y, rot };
  const layout = [...state.office.placed.filter((p) => p !== moving), candidate];
  return adjacencyLinks(layout, state.staff.length).filter((l) => l.sourceId === candidate.id || l.targetId === candidate.id);
}

export const spentOn = (p) => ITEMS[p.itemId].costs.slice(0, p.level).reduce((a, b) => a + b, 0);

// Buys and places an item; the caller has already checked it.
export function placeNow(ctx, itemId, spot) {
  const { state } = ctx;
  const it = ITEMS[itemId];
  state.cash -= it.costs[0];
  const id = newId(state, 'f');
  state.office.placed.push({ id, itemId, level: 1, x: spot.x, y: spot.y, rot: spot.rot });
  state.flags.lastItemWeek = state.week;
  state.flags.lastItemId = itemId;
  if (it.kind === 'shop') {
    ctx.emit({ type: 'toast', text: `New in the office: ${it.name}.`, tone: 'good' });
    emitChat(ctx, { channel: 'random', from: '@officebot', text: `The new ${it.name} has arrived. Please be nice to it.` });
  }
  return id;
}

registerAction('placeItem', (ctx, { itemId, x, y, rot = 0 }) => {
  const check = placementCheck(ctx.state, { itemId, x, y, rot });
  if (!check.ok) return check;
  return { ok: true, id: placeNow(ctx, itemId, { x, y, rot }) };
});

registerAction('moveItem', (ctx, { id, x, y, rot = 0 }) => {
  if (!id) return { ok: false, reason: 'No such item' };
  const check = placementCheck(ctx.state, { id, x, y, rot });
  if (!check.ok) return check;
  Object.assign(ctx.state.office.placed.find((p) => p.id === id), { x, y, rot });
  return { ok: true };
});

// Why a placed item cannot be upgraded right now, or null.
export function upgradeProblem(state, placed) {
  if (!placed) return 'No such item';
  const it = ITEMS[placed.itemId];
  if (it.kind !== 'shop') return 'Nothing to upgrade';
  if (placed.level >= it.costs.length) return 'Already max level';
  if (state.cash < it.costs[placed.level]) return 'Not enough cash';
  return null;
}

export function upgradeNow(ctx, placed) {
  const it = ITEMS[placed.itemId];
  ctx.state.cash -= it.costs[placed.level];
  placed.level++;
  ctx.emit({ type: 'toast', text: `${it.name} upgraded to level ${placed.level}.`, tone: 'good' });
}

registerAction('upgradeItem', (ctx, { id }) => {
  const placed = ctx.state.office.placed.find((p) => p.id === id);
  const reason = upgradeProblem(ctx.state, placed);
  if (reason) return { ok: false, reason };
  upgradeNow(ctx, placed);
  return { ok: true };
});

registerAction('sellItem', (ctx, { id }) => {
  const { state } = ctx;
  const placed = state.office.placed.find((p) => p.id === id);
  if (!placed) return { ok: false, reason: 'No such item' };
  if (placed.itemId === 'desk' && deskCapacity(state) <= state.staff.length) return { ok: false, reason: 'Someone sits there' };
  const it = ITEMS[placed.itemId];
  const refund = spentOn(placed) / 2;
  state.cash += refund;
  state.office.placed = state.office.placed.filter((p) => p !== placed);
  ctx.emit({ type: 'toast', text: `Sold the ${it.name} for $${refund.toLocaleString('en-US')}.`, tone: 'info' });
  return { ok: true };
});
