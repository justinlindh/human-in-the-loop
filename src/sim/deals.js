import { B } from './balance.js';
import { pick, sideRng } from './rng.js';
import { eraOnlyAllowsText } from './eras.js';
import { staffMods } from './staff.js';
import { DEAL_CUSTOMERS } from '../data/deal-customers.js';

// Deal events: what the sales team (or the retail shelf) sold, for ui, art and audio to show. They change
// nothing the game plays on. Each product's sales add up over B.dealGroupWeeks and are reported once at the
// end of the window; a deal is notable at B.dealNotableMrr (boxed: B.dealNotableBoxRevenue) or as a
// product's first. Names come from a stream of their own, so the game's random state never moves.

const tally = (state) => (state.flags.deals ??= { open: {}, firsts: [] });
const windowEnds = (state) => (state.week + 1) % Math.max(1, B.dealGroupWeeks) === 0;

function first(state, productId) {
  const t = tally(state);
  if (t.firsts.includes(productId)) return false;
  t.firsts.push(productId);
  return true;
}

// The salesperson with the largest share of the boost, the same weights that split sales records.
const topSeller = (sellers) => sellers.reduce((best, p) => (!best || staffMods(p).salesBoost > staffMods(best).salesBoost ? p : best), null);

export function addDeal(ctx, product, customers, mrr, sellers) {
  const { state } = ctx;
  if (!(customers > 0) || !sellers.length) return;
  const open = (tally(state).open[product.id] ??= { customers: 0, mrr: 0 });
  open.customers += customers;
  open.mrr += mrr;
  if (!windowEnds(state)) return;
  delete tally(state).open[product.id];
  const names = DEAL_CUSTOMERS.filter((c) => eraOnlyAllowsText(state, c.name));
  const customer = pick(sideRng(state.seed, `deal:${product.id}`, state.week), names).name;
  const isFirst = first(state, product.id);
  ctx.emit({
    type: 'deal', productId: product.id, customer, customers: Math.max(1, Math.round(open.customers)), mrr: Math.round(open.mrr),
    week: state.week, sellerId: topSeller(sellers).id, first: isFirst, notable: isFirst || open.mrr >= B.dealNotableMrr,
  });
}

export function addBoxDeal(ctx, product, units, revenue) {
  const { state } = ctx;
  if (!(units > 0)) return;
  const open = (tally(state).open[product.id] ??= { units: 0, revenue: 0 });
  open.units += units;
  open.revenue += revenue;
  if (!windowEnds(state)) return;
  delete tally(state).open[product.id];
  const isFirst = first(state, product.id);
  ctx.emit({
    type: 'deal', productId: product.id, units: open.units, revenue: Math.round(open.revenue), week: state.week, boxed: true,
    first: isFirst, notable: isFirst || open.revenue >= B.dealNotableBoxRevenue,
  });
}
