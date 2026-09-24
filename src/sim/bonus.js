import { ITEMS } from '../data/items.js';
import { RESEARCH } from '../data/research.js';
import { footprintCells, seatTile, desksOf, occupiedDesks } from './office.js';

const ITEM_CAP = 0.5;
const SECOND_COPY = 0.5;
const ADJACENCY_KEYS = new Set(Object.values(ITEMS).filter((it) => it.adjacency).map((it) => it.adjacency.key));

const near = (cells, [x, y], radius) => cells.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= radius);

// Every adjacency bonus in a layout: { sourceId, targetId, target: 'desk'|'item', key, value, paid }.
// A desk link pays only when the desk's id is in `occupied` (a Set of desk ids someone sits at). Distance is
// Chebyshev, from any tile of the source to the desk's seat tile, or to any tile of the other item.
export function adjacencyLinks(placed, occupied) {
  const links = [];
  const desks = desksOf(placed);
  for (const src of placed) {
    const adj = ITEMS[src.itemId]?.adjacency;
    if (!adj) continue;
    const cells = footprintCells(src.itemId, src.x, src.y, src.rot);
    if (adj.to) {
      for (const other of placed) {
        if (other === src || other.itemId !== adj.to) continue;
        const otherCells = footprintCells(other.itemId, other.x, other.y, other.rot);
        if (otherCells.some((c) => near(cells, c, adj.radius))) {
          links.push({ sourceId: src.id, targetId: other.id, target: 'item', key: adj.key, value: adj.value, paid: true });
        }
      }
    } else {
      for (const d of desks) {
        if (near(cells, seatTile(d), adj.radius)) {
          links.push({ sourceId: src.id, targetId: d.id, target: 'desk', key: adj.key, value: adj.value, paid: occupied.has(d.id) });
        }
      }
    }
  }
  return links;
}

// Adjacency for a key: paid desk links averaged over staff, plus item-to-item links.
function adjacencyBonus(state, key) {
  let desk = 0;
  let item = 0;
  for (const l of adjacencyLinks(state.office.placed, occupiedDesks(state))) {
    if (l.key !== key || !l.paid) continue;
    if (l.target === 'desk') desk += l.value;
    else item += l.value;
  }
  return item + (state.staff.length ? desk / state.staff.length : 0);
}

// itemBonus depends only on the layout, item levels, who sits where, and headcount; results are reused
// until any of those change.
const bonusCache = new WeakMap();
function layoutSignature(state) {
  let sig = `${state.staff.length}|`;
  for (const it of state.office.placed) sig += `${it.id}:${it.level}:${it.x}:${it.y}:${it.rot};`;
  for (const p of state.staff) sig += `${p.deskId ?? '-'},`;
  return sig;
}

// Placed items' effects for a key at their current levels, plus adjacency. The best copy of an item
// counts in full and a second copy at half. No stack of items moves a single effect by more than half.
export function itemBonus(state, key) {
  const sig = layoutSignature(state);
  let entry = bonusCache.get(state);
  if (!entry || entry.sig !== sig) { entry = { sig, values: new Map() }; bonusCache.set(state, entry); }
  if (!entry.values.has(key)) entry.values.set(key, computeItemBonus(state, key));
  return entry.values.get(key);
}

function computeItemBonus(state, key) {
  const byItem = {};
  for (const it of state.office.placed) (byItem[it.itemId] ??= []).push(it.level);
  let total = 0;
  for (const [itemId, levels] of Object.entries(byItem)) {
    levels.sort((a, b) => b - a).slice(0, 2).forEach((level, i) => {
      total += (ITEMS[itemId]?.effects[level - 1]?.[key] ?? 0) * (i === 0 ? 1 : SECOND_COPY);
    });
  }
  if (ADJACENCY_KEYS.has(key)) total += adjacencyBonus(state, key);
  return Math.max(-ITEM_CAP, Math.min(ITEM_CAP, total));
}

// Sum of finished research effects for a key.
export function researchBonus(state, key) {
  let total = 0;
  for (const id of state.research.done) total += RESEARCH[id]?.effect[key] ?? 0;
  return total;
}

// Items plus research, for keys both can touch.
export const perk = (state, key) => itemBonus(state, key) + researchBonus(state, key);
