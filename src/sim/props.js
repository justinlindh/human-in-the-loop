import { B } from './balance.js';
import { registerSystem } from './registry.js';
import { ITEMS } from '../data/items.js';
import { purchaseProblem, findSpot, layoutOf, desksOf, seatTile, footprintCells, frontCells } from './office.js';
import { officeShape } from '../data/office.js';

// Staged props: decisions that describe something physical show it in the office while they are open,
// can grant a real item, and can leave a prop behind until something happens.

const key = (x, y) => `${x},${y}`;

// Tiles a floor prop may not use: placed items, pillars, other props, and every item's front zone (the floor
// people stand on to use it), the same zones placement keeps clear.
function takenTiles(state) {
  const shape = officeShape(state.officeStage, state.office.expansion ?? 0);
  const taken = new Set(shape.blocked.map(([x, y]) => key(x, y)));
  for (const p of state.office.placed) {
    for (const [x, y] of footprintCells(p.itemId, p.x, p.y, p.rot)) taken.add(key(x, y));
    for (const [x, y] of frontCells(p.itemId, p.x, p.y, p.rot, p.level)) taken.add(key(x, y));
  }
  for (const p of state.office.props ?? []) taken.add(key(p.x, p.y));
  taken.add(key(shape.door.x, shape.door.y));
  return { shape, taken };
}

// A free tile along the back wall, nearest the middle.
function wallTile(state) {
  const { shape, taken } = takenTiles(state);
  const mid = Math.floor(shape.grid.w / 2);
  const xs = [...Array(shape.grid.w).keys()].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  for (const x of xs) if (!taken.has(key(x, 0))) return { x, y: 0 };
  return { x: mid, y: 0 };
}

// The free floor tile nearest (x, y), searching outward a few rings, or null.
function nearestFree(state, x, y) {
  const { shape, taken } = takenTiles(state);
  for (let r = 0; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= shape.grid.w || ty >= shape.grid.h || taken.has(key(tx, ty))) continue;
        return { x: tx, y: ty };
      }
    }
  }
  return null;
}

// In the office this week: not away (sabbatical, leave) and not remote.
export const isIn = (p) => p.mood !== 'away' && !p.remote;

// Where a staged prop goes for an anchor; null for 'screens', which has no tile.
export function stageTile(state, anchor, subjectId) {
  if (anchor === 'screens') return { x: null, y: null };
  if (anchor === 'subjectDesk') {
    // The subject's desk when they are in; otherwise the desk of someone who is (a founder first), so the
    // prop never waits on an empty chair. staffId says whose desk it is, for the renderer to cast them.
    const desks = desksOf(state.office.placed);
    const deskOf = (p) => (p?.deskId ? desks.find((d) => d.id === p.deskId) : null);
    const subject = state.staff.find((x) => x.id === subjectId);
    const inOffice = state.staff.filter((p) => isIn(p) && deskOf(p));
    const who = subject && isIn(subject) && deskOf(subject) ? subject : inOffice.find((p) => p.founder) ?? inOffice[0] ?? null;
    if (who) { const [x, y] = seatTile(deskOf(who)); return { x, y, staffId: who.id }; }
  }
  if (anchor === 'kitchen') {
    const corner = state.office.placed.find((i) => i.itemId === 'coffee_corner' || i.itemId === 'espresso');
    if (corner) {
      const spot = nearestFree(state, corner.x, corner.y);
      if (spot) return spot;
    }
  }
  if (anchor === 'whiteboard') {
    const board = state.office.placed.find((i) => i.itemId === 'whiteboard' || i.itemId === 'whiteboard_wall');
    if (board) return { x: board.x, y: board.y };
  }
  if (anchor === 'door') {
    const { door } = officeShape(state.officeStage, state.office.expansion ?? 0);
    const spot = nearestFree(state, door.x, Math.max(0, door.y - 1));
    if (spot) return spot;
  }
  return wallTile(state);
}

// What a choice's grant costs: the choice's own cash if it has one, else the item's price.
export const grantPrice = (c) => (c.effects?.cash < 0 ? -c.effects.cash : ITEMS[c.grant.item].costs[0]);

// Why a choice's grant cannot happen right now, or null.
export function grantBlocker(state, c) {
  if (!c.grant) return null;
  const item = c.grant.item;
  const reason = purchaseProblem({ ...state, cash: Infinity }, item);
  if (reason) return reason;
  if (state.cash < grantPrice(c)) return 'Not enough cash';
  return findSpot(layoutOf(state), state.office.placed, item) ? null : 'No room for it';
}

// Leaves a prop where its own anchor resolves when it sets one; otherwise at the decision's stage tile, or on
// the back wall when there is no stage. Keeps at most officePropsMax.
export function leaveProp(state, leaves, stage, subjectId = null) {
  const props = (state.office.props ??= []);
  const own = leaves.anchor ? stageTile(state, leaves.anchor, subjectId) : null;
  const tile = own && own.x !== null ? { x: own.x, y: own.y } : stage && stage.x !== null ? { x: stage.x, y: stage.y } : wallTile(state);
  // Props number themselves apart from the game's shared id counter, so a cosmetic prop never shifts the
  // ids (and so the seeded course) of everything created after it.
  // Props from older saves were numbered off the shared counter, so start above any id still in use.
  const highest = Math.max(0, ...props.map((p) => Number(String(p.id).replace(/\D/g, '')) || 0));
  state.flags.propSeq = Math.max(state.flags.propSeq ?? 0, highest) + 1;
  props.push({ id: `prop${state.flags.propSeq}`, prop: leaves.prop, x: tile.x, y: tile.y, since: state.week, until: leaves.until ?? null });
  if (props.length > B.officePropsMax) props.splice(0, props.length - B.officePropsMax);
}

const done = (state, u) => (!u ? false
  : u.item ? state.office.placed.some((i) => i.itemId === u.item)
    : u.weeks !== undefined ? false
      : u.flag ? !!state.flags[u.flag] : false);

// Drops lingering props whose time is up.
export function propsSystem(ctx) {
  const { state } = ctx;
  const props = state.office.props ?? [];
  state.office.props = props.filter((p) => !done(state, p.until) && !(p.until?.weeks !== undefined && state.week - p.since >= p.until.weeks));
}

registerSystem('props', propsSystem, 16);
