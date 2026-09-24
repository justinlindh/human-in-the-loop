import { ITEMS } from '../data/items.js';
import { RESEARCH } from '../data/research.js';
import { footprintCells, seatTile, desksOf } from './office.js';

const ITEM_CAP = 0.5;
const SECOND_COPY = 0.5;
const ADJACENCY_KEYS = new Set(Object.values(ITEMS).filter((it) => it.adjacency).map((it) => it.adjacency.key));

const near = (cells, [x, y], radius) => cells.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= radius);

// Adjacency for a key: desk bonuses (each occupied desk gets every nearby item's value) averaged over staff,
// plus item-to-item bonuses (each item gets value per neighbour of the named kind).
function adjacencyBonus(state, key) {
  const placed = state.office.placed;
  const sources = placed.filter((p) => ITEMS[p.itemId]?.adjacency?.key === key);
  if (!sources.length) return 0;
  let total = 0;
  const seats = desksOf(placed).slice(0, state.staff.length).map(seatTile);
  let perDesk = 0;
  for (const src of sources) {
    const adj = ITEMS[src.itemId].adjacency;
    const cells = footprintCells(src.itemId, src.x, src.y, src.rot);
    if (adj.to) {
      for (const other of placed) {
        if (other !== src && other.itemId === adj.to && near(cells, [other.x, other.y], adj.radius)) total += adj.value;
      }
    } else {
      for (const seat of seats) if (near(cells, seat, adj.radius)) perDesk += adj.value;
    }
  }
  if (state.staff.length) total += perDesk / state.staff.length;
  return total;
}

// Placed items' effects for a key at their current levels, plus adjacency. The best copy of an item
// counts in full and a second copy at half. No stack of items moves a single effect by more than half.
export function itemBonus(state, key) {
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
