import { newId } from './util.js';
import { registerAction } from './registry.js';
import { emitChat } from './chat.js';
import { ITEMS } from '../data/items.js';
import { OFFICE_STAGES, officeShape } from '../data/office.js';
import { B } from './balance.js';
import { adjacencyLinks, itemBonus } from './bonus.js';
import { eraAtLeast } from './eras.js';
import { newRobot } from './state.js';

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

// The tiles an item's front zone covers at a level: the row just past its footprint on the side it faces
// (+y at rot 0, -x at 1, -y at 2, +x at 3), across its width. Empty below the item's frontFrom level.
export function frontCells(itemId, x, y, rot, level = 1) {
  const it = ITEMS[itemId];
  if (!it?.frontFrom || level < it.frontFrom) return [];
  const { w, h } = it.footprint;
  const [rw, rh] = rot % 2 ? [h, w] : [w, h];
  switch (rot) {
    case 1: return Array.from({ length: rh }, (_, i) => [x - 1, y + i]);
    case 2: return Array.from({ length: rw }, (_, i) => [x + i, y - 1]);
    case 3: return Array.from({ length: rh }, (_, i) => [x + rw, y + i]);
    default: return Array.from({ length: rw }, (_, i) => [x + i, y + rh]);
  }
}

const FRONT_REASON = 'Needs clear floor in front';

// The chair tile of a desk set: its second footprint row, so the sitter faces the desk.
export function seatTile(placed) {
  const { w, h } = ITEMS[placed.itemId].footprint;
  const [dx, dy] = rotateLocal(0, h - 1, w, h, placed.rot);
  return [placed.x + dx, placed.y + dy];
}

export const desksOf = (placed) => placed.filter((p) => p.itemId === 'desk');
export const deskCapacity = (state) => desksOf(state.office.placed).length;

// Desk ids someone sits at.
export const occupiedDesks = (state) => new Set(state.staff.map((p) => p.deskId).filter(Boolean));

// Sticky seats: everyone keeps their desk; anyone without one (new, or their desk was sold) takes the
// lowest free desk in placed order.
export function assignSeats(state) {
  const desks = desksOf(state.office.placed);
  const ids = new Set(desks.map((d) => d.id));
  const taken = new Set();
  for (const p of state.staff) {
    if (p.deskId && ids.has(p.deskId) && !taken.has(p.deskId)) taken.add(p.deskId);
    else p.deskId = null;
  }
  for (const p of state.staff) {
    if (p.deskId) continue;
    const free = desks.find((d) => !taken.has(d.id));
    if (!free) break;
    p.deskId = free.id;
    taken.add(free.id);
  }
}

// The tile a person sits on, or null without a desk.
export function seatOf(state, staffId) {
  const p = state.staff.find((x) => x.id === staffId);
  const desk = p?.deskId ? state.office.placed.find((d) => d.id === p.deskId) : null;
  return desk ? seatTile(desk) : null;
}

// A layout is a stage index, or { stage, expansion } for an expanded HQ.
const shapeOf = (layout) => (typeof layout === 'number' ? officeShape(layout) : officeShape(layout.stage, layout.expansion));
export const layoutOf = (state) => ({ stage: state.officeStage, expansion: state.office.expansion ?? 0 });

// Whether every desk's chair has a free tile beside it that can be walked to from the door.
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// A stage's grid with the blocked tiles and every placed item's footprint marked solid (1).
function solidGrid(st, placed) {
  const { w, h } = st.grid;
  const solid = new Uint8Array(w * h);
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) solid[y * w + x] = 1; };
  for (const [x, y] of st.blocked) mark(x, y);
  for (const p of placed) for (const [x, y] of footprintCells(p.itemId, p.x, p.y, p.rot)) mark(x, y);
  return solid;
}

// Flood fill from the door over open tiles; then whether every desk's chair has a reached tile beside it.
function seatsReachable(st, solid, desks) {
  const { w, h } = st.grid;
  const { x: dx0, y: dy0 } = st.door;
  if (dx0 < 0 || dy0 < 0 || dx0 >= w || dy0 >= h || solid[dy0 * w + dx0]) return false;
  const seen = new Uint8Array(w * h);
  seen[dy0 * w + dx0] = 1;
  const queue = [dy0 * w + dx0];
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i] % w, y = (queue[i] - x) / w;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (!seen[k] && !solid[k]) { seen[k] = 1; queue.push(k); }
    }
  }
  return desks.every((d) => {
    const [sx, sy] = seatTile(d);
    return STEPS.some(([dx, dy]) => {
      const nx = sx + dx, ny = sy + dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && seen[ny * w + nx] === 1;
    });
  });
}

export function pathsClear(stageIdx, placed) {
  const st = shapeOf(stageIdx);
  return seatsReachable(st, solidGrid(st, placed), desksOf(placed));
}

// A checker for many candidate spots against one layout: the stage and the other items' tiles are
// worked out once. check({ itemId, x, y, rot, level }) says why the item cannot go there, or null.
function layoutChecker(stageIdx, others) {
  const st = shapeOf(stageIdx);
  const { w, h } = st.grid;
  const blocked = new Set(st.blocked.map(([bx, by]) => key(bx, by)));
  const taken = new Set();
  for (const p of others) for (const [ox, oy] of footprintCells(p.itemId, p.x, p.y, p.rot)) taken.add(key(ox, oy));
  const zones = new Set();
  for (const p of others) for (const [fx, fy] of frontCells(p.itemId, p.x, p.y, p.rot, p.level)) zones.add(key(fx, fy));
  const solid = solidGrid(st, others);
  const desks = desksOf(others);
  const inTerrace = (cx, cy) => st.zones.some((z) => z.id === 'terrace' && cx >= z.x0 && cx <= z.x1 && cy >= z.y0 && cy <= z.y1);
  return ({ itemId, x, y, rot, level = 1 }) => {
    if (![x, y, rot].every(Number.isInteger) || rot < 0 || rot > 3) return 'Out of bounds';
    const cells = footprintCells(itemId, x, y, rot);
    if (cells.some(([cx, cy]) => cx < 0 || cy < 0 || cx >= w || cy >= h)) return 'Out of bounds';
    if (cells.some(([cx, cy]) => blocked.has(key(cx, cy)))) return 'Blocked';
    if (cells.some(([cx, cy]) => cx === st.door.x && cy === st.door.y)) return 'Keep the door clear';
    if (!ITEMS[itemId]?.outdoor && cells.some(([cx, cy]) => inTerrace(cx, cy))) return 'Only outdoor items go on the terrace';
    if (cells.some(([cx, cy]) => taken.has(key(cx, cy)))) return 'Overlaps something';
    const front = frontCells(itemId, x, y, rot, level);
    if (front.some(([fx, fy]) => fx < 0 || fy < 0 || fx >= w || fy >= h || blocked.has(key(fx, fy)) || taken.has(key(fx, fy)))) return FRONT_REASON;
    if (cells.some(([cx, cy]) => zones.has(key(cx, cy)))) return FRONT_REASON;
    for (const [cx, cy] of cells) solid[cy * w + cx] = 1;
    const item = { itemId, x, y, rot };
    const clear = seatsReachable(st, solid, itemId === 'desk' ? [...desks, item] : desks);
    for (const [cx, cy] of cells) solid[cy * w + cx] = 0;
    if (!clear) return 'Would block the path to a desk';
    return null;
  };
}

// Why an item cannot go at (x, y, rot) on a stage given the other placed items, or null. Layout only.
function layoutProblem(stageIdx, others, spot) {
  return layoutChecker(stageIdx, others)(spot);
}

// Why a new copy of an item cannot be bought right now, ignoring where it goes, or null.
export function purchaseProblem(state, itemId) {
  const it = ITEMS[itemId];
  if (!it) return 'Unknown item';
  if (state.officeStage < it.minStage) return 'Needs a bigger office';
  if (it.onlyEras && !it.onlyEras.includes(state.era.id)) return it.onlyEras.length === 1 ? 'Available in the dot-com chapter' : 'Available before Classic';
  if (it.era && !eraAtLeast(state, it.era)) return 'Arrives with the Agents era';
  if (it.requires === 'award' && state.stats.awards < 1) return 'Needs an award first';
  if (it.requires === 'ops' && state.unlocks.ops === undefined) return 'Needs Ops and Security';
  if (it.unique && state.office.placed.some((p) => p.itemId === itemId)) return 'You already have one';
  if (it.kind === 'shop' && state.office.placed.filter((p) => p.itemId === itemId).length >= 2) return 'You already have two';
  if (it.id === 'desk' && state.officeStage >= 1 && desksOf(state.office.placed).length >= deskCap(state)) return 'Desk limit reached';
  if (state.cash < it.costs[0]) return 'Not enough cash';
  return null;
}

// Most desks the Office Floor and the HQ hold: a base cap, plus a few per HQ expansion step. Moving up a
// stage never brings more desks than the new stage allows.
export const deskCap = (state) => B.hqDeskCap + B.expansionDeskStep * (state.office.expansion ?? 0);

// The next HQ expansion step ({ step, name, upgradeCost, rent, gate, ... }), or null before the HQ or after the last step.
export function nextExpansion(state) {
  if (state.officeStage !== OFFICE_STAGES.length - 1) return null;
  return OFFICE_STAGES[state.officeStage].expansions?.[state.office.expansion ?? 0] ?? null;
}

// The same check placeItem and moveItem run. Pass id to check a move of an already placed item (moves are free).
export function placementCheck(state, { itemId, x, y, rot = 0, id = null }) {
  const moving = id ? state.office.placed.find((p) => p.id === id) : null;
  if (id && !moving) return { ok: false, reason: 'No such item' };
  const item = moving ? moving.itemId : itemId;
  if (!ITEMS[item]) return { ok: false, reason: 'Unknown item' };
  if (state.officeStage < ITEMS[item].minStage) return { ok: false, reason: 'Needs a bigger office' };
  const others = state.office.placed.filter((p) => p !== moving);
  const problem = layoutProblem(layoutOf(state), others, { itemId: item, x, y, rot, level: moving?.level ?? 1 });
  if (problem) return { ok: false, reason: problem };
  if (!moving) {
    const reason = purchaseProblem(state, item);
    if (reason) return { ok: false, reason };
  }
  return { ok: true, reason: null };
}

// The first free spot for an item, scanning rows from the back corner, or null.
// The first spot that fits; with level, one that also keeps that level's front zone clear.
export function findSpot(stageIdx, placed, itemId, rots = [0, 1, 2, 3], level = 1, check = layoutChecker(stageIdx, placed)) {
  const { w, h } = shapeOf(stageIdx).grid;
  for (const rot of rots) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!check({ itemId, x, y, rot, level })) return { x, y, rot };
      }
    }
  }
  return null;
}

// Desk slots in islands: bands four tiles tall (chair, desk, desk, chair, so each pair faces across the
// island), ISLAND_W desks wide, with a one-tile aisle between islands and between bands. The back-wall
// row stays free for walking and wall items. Slots fill column by column, top then bottom.
const ISLAND_W = 3;

export function islandSlots(stageIdx) {
  const { w, h } = shapeOf(stageIdx).grid;
  const slots = [];
  for (let y0 = 1; y0 + 3 < h - 1; y0 += 5) {
    for (let x0 = 1; x0 < w - 1; x0 += ISLAND_W + 1) {
      for (let x = x0; x < Math.min(x0 + ISLAND_W, w - 1); x++) {
        slots.push({ x, y: y0, rot: 2 }, { x, y: y0 + 2, rot: 0 });
      }
    }
  }
  return slots;
}

// Where an item should go: desks take the next free island slot; other items go where they are near
// the most occupied desks (the adjacency rule), else the first free spot along the back wall.
// Returns { x, y, rot } or null when nothing fits. Layout only: cash is not checked.
export function suggestPlacement(state, itemId) {
  if (!ITEMS[itemId]) return null;
  const stage = layoutOf(state);
  const placed = state.office.placed;
  const check = layoutChecker(stage, placed);
  if (itemId === 'desk') {
    const slot = islandSlots(stage).find((sl) => !check({ itemId, ...sl }));
    return slot ?? findSpot(stage, placed, itemId, [0, 2, 1, 3], 1, check);
  }
  const adj = ITEMS[itemId].adjacency;
  if (adj && !adj.to) {
    const { w, h } = ITEMS[itemId].footprint;
    const reach = adj.radius + Math.max(w, h);
    const occupied = occupiedDesks(state);
    const seats = desksOf(placed).filter((d) => occupied.has(d.id)).map(seatTile);
    const tried = new Set();
    let best = null;
    for (const [sx, sy] of seats) {
      for (let y = sy - reach; y <= sy + reach; y++) {
        for (let x = sx - reach; x <= sx + reach; x++) {
          for (const rot of [0, 1]) {
            const k = `${x},${y},${rot}`;
            if (tried.has(k)) continue;
            tried.add(k);
            const cells = footprintCells(itemId, x, y, rot);
            const v = seats.filter(([ax, ay]) => cells.some(([cx, cy]) => Math.max(Math.abs(cx - ax), Math.abs(cy - ay)) <= adj.radius)).length;
            if (v && (!best || v > best.v) && !check({ itemId, x, y, rot })) best = { x, y, rot, v };
          }
        }
      }
    }
    if (best) return { x: best.x, y: best.y, rot: best.rot };
  }
  return findSpot(stage, placed, itemId, undefined, 1, check);
}

// Packs existing furniture into a stage: desks first (into islands), then bigger items. Returns what did not fit.
export function autoArrange(stageIdx, placed) {
  const area = (p) => ITEMS[p.itemId].footprint.w * ITEMS[p.itemId].footprint.h;
  const order = [...placed].sort((a, b) => (b.itemId === 'desk') - (a.itemId === 'desk') || area(b) - area(a));
  const out = [];
  const left = [];
  const islands = islandSlots(stageIdx);
  for (const p of order) {
    const check = layoutChecker(stageIdx, out);
    const slot = p.itemId === 'desk' ? islands.find((sl) => !check({ itemId: 'desk', ...sl })) : null;
    // Each item goes where its current level fits, so a front zone it has grown into stays clear.
    const spot = slot ?? findSpot(stageIdx, out, p.itemId, p.itemId === 'desk' ? [0, 2, 1, 3] : [0, 1, 2, 3], p.level ?? 1, check);
    if (spot) out.push({ ...p, ...spot });
    else left.push(p);
  }
  // Keep the original order so desk seating does not reshuffle people.
  const byId = new Map(out.map((p) => [p.id, p]));
  return { placed: placed.filter((p) => byId.has(p.id)).map((p) => byId.get(p.id)), left };
}

const EFFECT_LABEL = {
  meaningRecovery: 'meaning recovery', novelty: 'freshness', staminaRecovery: 'stamina recovery',
  knowledgeGain: 'learning speed', uptimeFloor: 'uptime floor', staminaDrain: 'stamina drain', output: 'output',
  burnoutResign: 'burnout resignations', oversight: 'oversight', maintenanceNeed: 'maintenance load', brandDecay: 'brand decay',
};

// What placing (or moving, with id) an item at (x, y, rot) would do, measured exactly as itemBonus pays:
// links: every adjacency link involving the item ({ sourceId, targetId, target, key, value, paid, text });
// effects: [{ key, delta, text }], the change in itemBonus per key after averaging and the 50% cap;
// text: those texts joined, ready to show. A moved item keeps its place in desk order.
export function adjacencyPreview(state, { itemId, x, y, rot = 0, id = null }) {
  const moving = id ? state.office.placed.find((p) => p.id === id) : null;
  const item = moving ? moving.itemId : itemId;
  if (!ITEMS[item]) return { links: [], effects: [], text: '' };
  const candidate = { id: moving?.id ?? 'preview', itemId: item, level: moving?.level ?? 1, x, y, rot };
  const layout = moving ? state.office.placed.map((p) => (p === moving ? candidate : p)) : [...state.office.placed, candidate];
  // A new desk is taken at once if someone is waiting for a seat.
  const occupied = occupiedDesks(state);
  if (!moving && item === 'desk' && state.staff.some((p) => !p.deskId)) occupied.add(candidate.id);
  const involves = (id) => (l) => l.sourceId === id || l.targetId === id;
  const links = adjacencyLinks(layout, occupied).filter(involves(candidate.id));
  // A move can also lose links the item has now.
  const lost = moving ? adjacencyLinks(state.office.placed, occupiedDesks(state)).filter(involves(moving.id)) : [];
  for (const l of links) {
    const each = `+${Math.round(l.value * 1000) / 10}% ${EFFECT_LABEL[l.key] ?? l.key}`;
    l.text = l.target === 'item' ? `${each} per neighbour` : l.paid ? `${each} at this desk, averaged over the team` : `${each} once someone sits at this desk`;
  }
  const waiting = !moving && item === 'desk' ? state.staff.find((p) => !p.deskId) : null;
  const staff = waiting ? state.staff.map((p) => (p === waiting ? { ...p, deskId: candidate.id } : p)) : state.staff;
  const after = { ...state, staff, office: { ...state.office, placed: layout } };
  const keys = new Set([...links.map((l) => l.key), ...lost.map((l) => l.key), ...Object.keys(ITEMS[item].effects[candidate.level - 1] ?? {})]);
  const effects = [];
  for (const key of keys) {
    const delta = itemBonus(after, key) - itemBonus(state, key);
    const paid = links.filter((l) => l.key === key && l.target === 'desk' && l.paid).length;
    const empty = links.filter((l) => l.key === key && l.target === 'desk' && !l.paid).length;
    const racks = links.filter((l) => l.key === key && l.target === 'item').length;
    if (Math.abs(delta) < 1e-9 && !empty) continue;
    const pct = Math.round(delta * 1000) / 10;
    const bits = [];
    if (paid) bits.push(`${paid} ${paid === 1 ? 'desk' : 'desks'} nearby`);
    if (empty) bits.push(`${empty} empty ${empty === 1 ? 'desk' : 'desks'}`);
    if (racks) bits.push(`${racks} neighbouring ${racks === 1 ? 'link' : 'links'}`);
    const label = EFFECT_LABEL[key] ?? key;
    const text = `${pct >= 0 ? '+' : ''}${pct}% ${label}${paid ? ' for the team' : ''}${bits.length ? ` (${bits.join(', ')})` : ''}`;
    effects.push({ key, delta, text });
  }
  return { links, effects, text: effects.map((e) => e.text).join('; ') };
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
  if (itemId === 'desk') assignSeats(state);
  if (itemId === 'office_robot') state.robot ??= newRobot();
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
  if (it.levelStage && state.officeStage < it.levelStage[placed.level]) return 'Needs a bigger office';
  if (state.cash < it.costs[placed.level]) return 'Not enough cash';
  // An upgrade that brings a front zone needs that floor clear, like placing it would.
  if (frontCells(placed.itemId, placed.x, placed.y, placed.rot, placed.level + 1).length && !frontCells(placed.itemId, placed.x, placed.y, placed.rot, placed.level).length) {
    const others = state.office.placed.filter((p) => p !== placed);
    if (layoutProblem(layoutOf(state), others, { ...placed, level: placed.level + 1 }) === FRONT_REASON) return FRONT_REASON;
  }
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
  if (placed.itemId === 'desk') assignSeats(state);
  if (placed.itemId === 'office_robot') state.robot = null;
  ctx.emit({ type: 'toast', text: `Sold the ${it.name} for $${refund.toLocaleString('en-US')}.`, tone: 'info' });
  return { ok: true };
});
