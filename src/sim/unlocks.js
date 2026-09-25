import { registerSystem } from './registry.js';
import { B } from './balance.js';
import { eraIndex } from './eras.js';
import { UNLOCKS } from '../data/unlocks.js';
import { POLICIES } from '../data/policies.js';
import { offerPaths } from './progression.js';

const BY_KEY = Object.fromEntries(UNLOCKS.map((u) => [u.key, u]));

export const isUnlocked = (state, key) => state.unlocks?.[key] !== undefined;

// The refusal reason for a locked system, or null when it is open.
export function lockedReason(state, key) {
  if (isUnlocked(state, key)) return null;
  if (key.startsWith('policy.')) return POLICIES[key.slice(7)]?.lockText ?? 'Not available yet';
  return BY_KEY[key]?.reason ?? 'Not available yet';
}

// Everything that can unlock, in priority order: { key, ready(state, h), era, with }.
// era: arrives with an era and skips the spacing. with: opens silently alongside that key.
const CANDIDATES = [
  ...UNLOCKS.map((u) => ({ key: u.key, ready: u.when, era: !!u.era, with: null })),
  ...Object.values(POLICIES).map((p) => ({ key: `policy.${p.id}`, ready: (s) => p.unlock(s), era: !!p.era, with: p.with ? p.with : null })),
];

// Whether an unlock shows a pausing card, as the UI decides it: a new policy after the first is only a toast,
// unless an era arrives the same week (the era card lists it).
const inPolicies = (k) => k.startsWith('policy.') || k === 'standups';
export function showsCard(ctx, key) {
  const { state } = ctx;
  if (!key.startsWith('policy.') || ctx.events.some((e) => e.type === 'era')) return true;
  const earlier = Object.entries(state.unlocks).some(([k, week]) => inPolicies(k) && k !== key && week < state.week);
  return !earlier;
}

// Opens systems whose triggers are true. Era-bound ones open at once; the rest arrive one at a time,
// at least B.unlockGapWeeks apart, so the opening introduces one new thing at a time.
export function checkUnlocks(ctx) {
  const { state } = ctx;
  const h = { eraIndex: eraIndex(state) };
  const open = (key, quiet = false) => {
    state.unlocks[key] = state.week;
    if (key === 'paths') offerPaths(state);
    for (const c of CANDIDATES) if (c.with === key && !isUnlocked(state, c.key)) open(c.key, true);
    if (!quiet) {
      ctx.emit({ type: 'unlock', key });
      if (showsCard(ctx, key)) ctx.state.flags.lastPauseWeek = ctx.state.week;
    }
  };
  for (const c of CANDIDATES) if (c.era && !isUnlocked(state, c.key) && c.ready(state, h)) open(c.key);
  const last = state.flags.lastUnlockWeek;
  if (last !== undefined && state.week - last < B.unlockGapWeeks) return;
  const next = CANDIDATES.find((c) => !c.era && !c.with && !isUnlocked(state, c.key) && c.ready(state, h));
  if (!next) return;
  state.flags.lastUnlockWeek = state.week;
  open(next.key);
}

registerSystem('unlocks', checkUnlocks, 86);
