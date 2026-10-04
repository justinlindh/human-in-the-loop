import { B } from './balance.js';
import { pick, sideRng } from './rng.js';
import { eraOnlyAllowsText } from './eras.js';
import { staffMods } from './staff.js';
import { DEAL_CUSTOMERS } from '../data/deal-customers.js';

// Deal events: what the sales team (or the retail shelf) sold, for ui, art and audio to show. They change
// nothing the game plays on. Each product's sales add up over B.dealGroupWeeks and are reported once at the
// end of the window. A week whose reported sales top B.dealBeatPace times the company's own average over the
// last B.dealBeatWeeks weeks (silent weeks count as zero), and reach B.dealBeatFloor, makes all of them
// notable: the weekly beat. Sales-team MRR and box revenue keep separate paces. A product's first deal is
// always notable; the rest belong in a quiet line. Names come from a stream of their own, so the game's
// random state never moves.

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

const pending = (ctx) => (ctx.deals ??= []);

export function addDeal(ctx, product, customers, mrr, sellers) {
  const { state } = ctx;
  if (!(customers > 0) || !sellers.length) return;
  const open = (tally(state).open[product.id] ??= { customers: 0, mrr: 0 });
  open.customers += customers;
  open.mrr += mrr;
  if (!windowEnds(state)) return;
  delete tally(state).open[product.id];
  const names = DEAL_CUSTOMERS.filter((c) => eraOnlyAllowsText(state, c.name));
  pending(ctx).push({
    type: 'deal', productId: product.id, customer: pick(sideRng(state.seed, `deal:${product.id}`, state.week), names).name,
    customers: Math.max(1, Math.round(open.customers)), mrr: Math.round(open.mrr), week: state.week,
    sellerId: topSeller(sellers).id, first: first(state, product.id),
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
  pending(ctx).push({
    type: 'deal', productId: product.id, units: open.units, revenue: Math.round(open.revenue), week: state.week, boxed: true,
    first: first(state, product.id),
  });
}

// Emits the week's deals with the week's totals: weekMrr over sales-team deals, weekRevenue over boxed ones.
export function flushDeals(ctx) {
  const deals = ctx.deals ?? [];
  ctx.deals = [];
  const weekMrr = deals.reduce((n, d) => n + (d.mrr ?? 0), 0);
  const weekRevenue = deals.reduce((n, d) => n + (d.revenue ?? 0), 0);
  const t = tally(ctx.state);
  const beatMrr = beats(t.paceMrr ??= [], weekMrr);
  const beatBox = beats(t.paceBox ??= [], weekRevenue);
  for (const d of deals) {
    ctx.emit(d.boxed
      ? { ...d, weekRevenue, notable: d.first || beatBox }
      : { ...d, weekMrr, notable: d.first || beatMrr });
  }
}

// Whether this week's total beats the trailing average, then adds the week to it.
function beats(pace, total) {
  const avg = pace.length ? pace.reduce((n, x) => n + x, 0) / pace.length : 0;
  pace.push(total);
  if (pace.length > B.dealBeatWeeks) pace.splice(0, pace.length - B.dealBeatWeeks);
  return total >= B.dealBeatFloor && total >= B.dealBeatPace * avg;
}
