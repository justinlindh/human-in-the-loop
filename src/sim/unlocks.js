import { registerSystem } from './registry.js';
import { eraIndex } from './eras.js';
import { UNLOCKS } from '../data/unlocks.js';
import { POLICIES } from '../data/policies.js';

const BY_KEY = Object.fromEntries(UNLOCKS.map((u) => [u.key, u]));

export const isUnlocked = (state, key) => state.unlocks?.[key] !== undefined;

// The refusal reason for a locked system, or null when it is open.
export function lockedReason(state, key) {
  if (isUnlocked(state, key)) return null;
  if (key.startsWith('policy.')) return POLICIES[key.slice(7)]?.lockText ?? 'Not available yet';
  return BY_KEY[key]?.reason ?? 'Not available yet';
}

// Opens every system whose trigger is now true and emits an unlock event for each.
export function checkUnlocks(ctx) {
  const { state } = ctx;
  const h = { eraIndex: eraIndex(state) };
  const open = (key) => {
    state.unlocks[key] = state.week;
    ctx.emit({ type: 'unlock', key });
  };
  for (const u of UNLOCKS) if (!isUnlocked(state, u.key) && u.when(state, h)) open(u.key);
  for (const p of Object.values(POLICIES)) {
    const key = `policy.${p.id}`;
    if (!isUnlocked(state, key) && p.unlock(state)) open(key);
  }
}

registerSystem('unlocks', checkUnlocks, 86);
