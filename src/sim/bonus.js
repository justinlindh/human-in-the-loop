import { ITEMS } from '../data/items.js';
import { RESEARCH } from '../data/research.js';

// Sum of owned office items' effects for a key at their current levels.
export function itemBonus(state, key) {
  let total = 0;
  for (const it of state.items) total += ITEMS[it.itemId]?.effects[it.level - 1]?.[key] ?? 0;
  return total;
}

// Sum of finished research effects for a key.
export function researchBonus(state, key) {
  let total = 0;
  for (const id of state.research.done) total += RESEARCH[id]?.effect[key] ?? 0;
  return total;
}

// Items plus research, for keys both can touch.
export const perk = (state, key) => itemBonus(state, key) + researchBonus(state, key);
