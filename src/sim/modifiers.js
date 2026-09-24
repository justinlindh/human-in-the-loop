import { sum } from './util.js';

// Sum of active decision modifiers for a key, as a fraction (0.2 means +20%).
export function modifierBonus(state, key) {
  return sum(state.modifiers.filter((m) => m.key === key && m.untilWeek > state.week), (m) => m.value);
}
