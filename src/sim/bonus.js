import { ITEMS } from '../data/items.js';
import { RESEARCH } from '../data/research.js';

// Sum of owned office items' effects for a key at their current levels. The best copy of an item
// counts in full and a second copy at half.
export function itemBonus(state, key) {
  const byItem = {};
  for (const it of state.items) (byItem[it.itemId] ??= []).push(it.level);
  let total = 0;
  for (const [itemId, levels] of Object.entries(byItem)) {
    levels.sort((a, b) => b - a).slice(0, 2).forEach((level, i) => {
      total += (ITEMS[itemId]?.effects[level - 1]?.[key] ?? 0) * (i === 0 ? 1 : SECOND_COPY);
    });
  }
  // No stack of items moves a single effect by more than half.
  return Math.max(-ITEM_CAP, Math.min(ITEM_CAP, total));
}

const ITEM_CAP = 0.5;

const SECOND_COPY = 0.5;

// Sum of finished research effects for a key.
export function researchBonus(state, key) {
  let total = 0;
  for (const id of state.research.done) total += RESEARCH[id]?.effect[key] ?? 0;
  return total;
}

// Items plus research, for keys both can touch.
export const perk = (state, key) => itemBonus(state, key) + researchBonus(state, key);
