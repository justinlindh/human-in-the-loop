import { B } from './balance.js';
import { registerSystem } from './registry.js';
import { newId } from './util.js';
import { ITEMS } from '../data/items.js';
import { purchaseProblem, findSpot, layoutOf, desksOf, seatTile, footprintCells } from './office.js';
import { officeShape } from '../data/office.js';

// Staged props: decisions that describe something physical show it in the office while they are open,
// can grant a real item, and can leave a prop behind until something happens.

const key = (x, y) => `${x},${y}`;

// Tiles that hold something already: placed items, pillars, and props.
function takenTiles(state) {
  const shape = officeShape(state.officeStage, state.office.expansion ?? 0);
  const taken = new Set(shape.blocked.map(([x, y]) => key(x, y)));
  for (const p of state.office.placed) for (const [x, y] of footprintCells(p.itemId, p.x, p.y, p.rot)) taken.add(key(x, y));
  for (const p of state.office.props ?? []) taken.add(key(p.x, p.y));
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

// Where a staged prop goes for an anchor; null for 'screens', which has no tile.
export function stageTile(state, anchor, subjectId) {
  if (anchor === 'screens') return { x: null, y: null };
  if (anchor === 'subjectDesk') {
    const p = state.staff.find((x) => x.id === subjectId);
    const desk = p?.deskId ? desksOf(state.office.placed).find((d) => d.id === p.deskId) : null;
    if (desk) { const [x, y] = seatTile(desk); return { x, y }; }
  }
  if (anchor === 'kitchen') {
    const corner = state.office.placed.find((i) => i.itemId === 'coffee_corner' || i.itemId === 'espresso');
    if (corner) return { x: corner.x, y: corner.y };
  }
  if (anchor === 'door') {
    const { door } = officeShape(state.officeStage, state.office.expansion ?? 0);
    return { x: door.x, y: Math.max(0, door.y - 1) };
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

// Leaves a prop at the decision's stage tile (or a wall tile), keeping at most officePropsMax.
export function leaveProp(state, leaves, stage) {
  const props = (state.office.props ??= []);
  const tile = stage && stage.x !== null ? { x: stage.x, y: stage.y } : wallTile(state);
  props.push({ id: newId(state, 'prop'), prop: leaves.prop, x: tile.x, y: tile.y, since: state.week, until: leaves.until ?? null });
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
