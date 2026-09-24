import { B } from './balance.js';
import { chance } from './rng.js';
import { dateOf } from './util.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { liveProducts } from './projects.js';
import { competition, marketSize } from './products.js';
import { CATEGORIES } from '../data/categories.js';
import { ANGLES } from '../data/angles.js';
import { incumbentFor } from '../data/incumbents.js';
import { eraAtLeast } from './eras.js';

export const cloneChance = (state) => B.cloneChanceBase * (1 + B.cloneChanceYearGrowth * dateOf(state.week).yearIndex);

export function marketSystem(ctx) {
  const { state } = ctx;
  const live = liveProducts(state);
  const p = cloneChance(state);
  for (const [catId, c] of Object.entries(state.market.categories)) {
    let kept = 0;
    for (let i = 0; i < c.clones; i++) if (!chance(ctx.rng, B.cloneDecay)) kept++;
    c.clones = kept;
    if (live.some((pr) => pr.category === catId && pr.score >= 6) && chance(ctx.rng, p)) {
      c.clones++;
      state.flags.lastCloneCategory = catId;
      // One Show HS post every few weeks is funny; one for every clone is spam.
      if (state.week - (state.flags.lastShowHnWeek ?? -99) >= B.showHnEveryWeeks) {
        state.flags.lastShowHnWeek = state.week;
        emitChat(ctx, { channel: 'random', from: '@hackerspewsbot', text: `Show HS: ${CATEGORIES[catId].name} but ${eraAtLeast(state, 'chatgbt') ? 'with AI' : 'faster'}` });
      }
    }
  }
  // Incumbents are slow: holding a great product in their category for a year wears them down.
  for (const [catId, c] of Object.entries(state.market.categories)) {
    if (live.some((pr) => pr.category === catId && pr.score >= B.erosionScore && state.week - pr.launchedWeek >= 52)) c.incumbentStrength *= 1 - B.incumbentErosion;
  }
  for (const pr of live) {
    if (pr.copied || state.week < pr.copyAtWeek || pr.score < 6) continue;
    pr.novelty *= B.copyNoveltyMult;
    state.market.categories[pr.category].incumbentStrength *= B.copyIncumbentMult;
    pr.copied = true;
    ctx.emit({ type: 'toast', text: `${incumbentFor(pr.category).name} announces ${ANGLES[pr.angle].name} features. Sounds familiar.`, tone: 'warn' });
  }
}

registerSystem('market', marketSystem, 60);

// Categories where your best live product holds a bigger share of the market than the incumbent.
export function categoryLeaders(state) {
  const out = [];
  for (const catId of Object.keys(CATEGORIES)) {
    const mine = liveProducts(state).filter((p) => p.category === catId);
    if (!mine.length) continue;
    const best = mine.reduce((a, b) => (b.customers > a.customers ? b : a));
    const c = competition(state, best);
    if (c.total > 0 && best.customers / marketSize(state, catId) > c.incumbent / c.total) out.push(catId);
  }
  return out;
}
