import { sum, clamp } from './util.js';
import { registerSystem } from './registry.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { categoryLeaders } from './market.js';
import { ipoBlocker } from './endgame.js';
import { GOALS } from '../data/goals.js';
import { RESEARCH } from '../data/research.js';

// Lazy helpers for goals' done and progress tests: the expensive ones are only computed when asked.
export function goalHelpers(state) {
  const h = {};
  const lazy = (k, fn) => Object.defineProperty(h, k, { get: () => fn(), enumerable: true });
  lazy('mrr', () => totalMrr(state));
  lazy('customers', () => sum(liveProducts(state), (p) => p.customers));
  lazy('leaders', () => categoryLeaders(state).length);
  lazy('ipoReady', () => !ipoBlocker(state));
  lazy('desks', () => (state.office?.placed ?? []).filter((i) => i.itemId === 'desk').length);
  lazy('treeDone', () => state.research.done.some((id) => RESEARCH[id]?.requires && state.research.done.includes(RESEARCH[id].requires)));
  return h;
}

// Completes every goal whose test now passes, applies its reward, and emits a goal event.
export function checkGoals(ctx) {
  const { state } = ctx;
  if (!state.goals) return;
  const h = goalHelpers(state);
  for (const g of GOALS) {
    const entry = state.goals[g.id] ??= { done: false, week: null };
    if (entry.done || !g.done(state, h)) continue;
    entry.done = true;
    entry.week = state.week;
    state.cash += g.reward.cash;
    state.brand = clamp(state.brand + g.reward.brand, 0, 100);
    ctx.emit({ type: 'goal', goalId: g.id });
  }
}

registerSystem('goals', checkGoals, 87);
