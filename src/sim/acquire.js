import { B } from './balance.js';
import { registerAction, registerSystem } from './registry.js';
import { int, pick, range, shuffle } from './rng.js';
import { newId, dateOf, clamp } from './util.js';
import { eraAtLeast } from './eras.js';
import { totalMrr } from './products.js';
import { generateStaff } from './staff.js';
import { assignSeats, deskCapacity } from './office.js';
import { emitChat } from './chat.js';
import { CATEGORIES } from '../data/categories.js';
import { ANGLES } from '../data/angles.js';
import { FOR_SALE, ACQUIRED_LINES } from '../data/forsale.js';

// Sizes a deal to the buyer: a small company's ARR is a slice of the buyer's, and the price a multiple of it.
function listing(state, rng, base) {
  const ownArr = Math.max(B.forSaleMinArr, totalMrr(state) * 12);
  const arr = Math.round((ownArr * range(rng, B.forSaleArrShare[0], B.forSaleArrShare[1])) / 1000) * 1000;
  const mult = range(rng, B.forSalePriceMult[0], B.forSalePriceMult[1]) * (eraAtLeast(state, 'consolidation') ? B.forSaleConsolidationDiscount : 1);
  return {
    id: newId(state, 'fs'), name: base.name, categoryId: pick(rng, state.market.unlockedCategories),
    arr, price: Math.round((arr * mult) / 10000) * 10000, staff: int(rng, 1, 3), expiresWeek: state.week + B.forSaleWeeks,
  };
}

// Once a year from the Agents era (twice from Consolidation) a few small companies come up for sale.
export function forSaleSystem(ctx) {
  const { state, rng } = ctx;
  const list = (state.market.forSale ??= []);
  state.market.forSale = list.filter((c) => c.expiresWeek > state.week);
  if (!eraAtLeast(state, 'agents')) return;
  const { week } = dateOf(state.week);
  const due = week === B.forSaleWeek || (eraAtLeast(state, 'consolidation') && week === B.forSaleWeek + 26);
  if (!due) return;
  const taken = new Set([...state.market.forSale.map((c) => c.name), ...state.products.map((p) => p.name)]);
  const picks = shuffle(rng, FOR_SALE.filter((c) => !taken.has(c.name))).slice(0, B.forSalePerRound);
  for (const base of picks) state.market.forSale.push(listing(state, rng, base));
  if (picks.length) {
    emitChat(ctx, { channel: 'random', from: '@dealbot', text: `${picks.length} small companies are quietly for sale this quarter: ${picks.map((c) => c.name).join(', ')}. Offers close in ${B.forSaleWeeks} weeks.` });
  }
}

registerSystem('for-sale', forSaleSystem, 62);

registerAction('acquire', (ctx, { targetId }) => {
  const { state, rng } = ctx;
  const t = (state.market.forSale ?? []).find((c) => c.id === targetId && c.expiresWeek > state.week);
  if (!t) return { ok: false, reason: 'No such company' };
  if (state.cash < t.price) return { ok: false, reason: 'Not enough cash' };
  // Everyone always has a desk, so a deal needs a free desk for each incoming person.
  if (deskCapacity(state) - state.staff.length < t.staff) return { ok: false, reason: 'No desks for their team' };
  state.cash -= t.price;
  state.market.forSale = state.market.forSale.filter((c) => c.id !== t.id);
  const cat = CATEGORIES[t.categoryId];
  const mrr = t.arr / 12;
  const customers = Math.max(1, Math.round(mrr / cat.price));
  const angles = Object.values(ANGLES).filter((a) => !a.ai || eraAtLeast(state, a.era));
  const angle = pick(rng, angles.filter((a) => !a.ai)).id;
  const product = {
    id: newId(state, 'p'), name: t.name, category: t.categoryId, angle, model: null, modelVersion: 0, version: 1, size: 'medium',
    stats: { features: 120, polish: 100, reliability: 110, novelty: 40 }, score: Math.round(range(rng, B.acquiredScore[0], B.acquiredScore[1]) * 10) / 10,
    reviews: [], customers, mrr, hype: 10, novelty: 4, health: 85, baseHealth: 85, uptime: 1, launchedWeek: state.week,
    copyAtWeek: state.week + B.copyDelayWeeks[1], copied: false, wrapperHit: false, ownerId: null, migrationDueWeek: null, killed: false,
  };
  state.products.push(product);
  const roles = ['engineer', 'engineer', 'designer', 'support', 'sales', 'marketer'];
  const joined = [];
  for (let i = 0; i < t.staff; i++) {
    const p = generateStaff(state, { role: pick(rng, roles), seniority: pick(rng, ['mid', 'mid', 'senior']) });
    p.hiredWeek = state.week;
    state.staff.push(p);
    joined.push(p);
    ctx.emit({ type: 'hire', staffId: p.id });
  }
  assignSeats(state);
  state.stats.hires += joined.length;
  const who = `${joined.length} ${joined.length === 1 ? 'person joins' : 'people join'}.`;
  ctx.emit({ type: 'toast', tone: 'good', text: `${state.companyName} acquired ${t.name} for $${t.price.toLocaleString('en-US')}. ${who}` });
  emitChat(ctx, { channel: 'wins', from: '@dealbot', text: pick(rng, ACQUIRED_LINES).replaceAll('{target}', t.name).replaceAll('{product}', t.name) });
  if (joined[0]) emitChat(ctx, { person: joined[0], text: `Hi all! ${t.name} here. We come in peace and with our own mugs.` });
  state.brand = clamp(state.brand + B.acquiredBrand, 0, 100);
  return { ok: true };
});
