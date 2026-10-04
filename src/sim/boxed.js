import { B } from './balance.js';
import { itemBonus } from './bonus.js';
import { registerAction } from './registry.js';
import { raiseDecision, fireEvent } from './events.js';
import { PREINTERNET_EVENTS, PREINTERNET_CHAT } from '../data/preinternet.js';
import { emitChat } from './chat.js';
import { bumpDebt } from './debt.js';
import { chapterStart } from './util.js';
import { addBoxDeal } from './deals.js';

// Physical installations are never subscription customers. Inventory survives every era transition.
export const newInventory = () => ({
  stock: 0, stockCost: 0, installed: 0, deliveries: [], unitsOrdered: 0, unitsSold: 0, returns: 0,
  returnUnits: 0, salesHistory: [], grossSales: 0, retailerFees: 0, refunds: 0, manufacturingCost: 0,
  patchCost: 0, patches: 0, patchedVersion: 1, weeklyNet: 0, salesWeek: null,
  delivered: 0, buybackCost: 0, withdrawn: 0, buybackWeek: null, returnsSettled: false, master: null,
});

export const installedCustomers = (p) => p.customers + (p.boxed?.installed ?? 0);
export const boxRevenue = (state) => state.products.reduce((n, p) => n + (p.boxed && !p.killed
  && (p.boxed.salesWeek === state.week || p.boxed.salesWeek === state.week - 1) ? p.boxed.weeklyNet : 0), 0);
const liveBox = (p) => !!p?.boxed && !p.killed;

// Value realized net sales over a trailing year, without treating installations as subscribers.
export const boxAnnualSales = (state) => state.products.filter(liveBox).reduce((total, p) => total
  + (p.boxed.salesHistory ?? []).filter((sale) => sale.week >= state.week - B.preinternet.valuationWeeks && sale.week <= state.week)
    .reduce((n, sale) => n + sale.net, 0), 0);

export function batchQuote(state, p, requested) {
  const reason = !liveBox(p) ? 'No live boxed product' : !B.preinternet.batches.includes(requested) ? 'Choose a listed batch size'
    : null;
  if (reason) return { reason, units: 0, cost: 0 };
  const units = Math.floor(requested * (state.flags.preinternet?.cdCredit ? 1 + B.preinternet.cdCapacity : 1));
  const cost = Math.round(units * B.preinternet.unitCost * (1 - itemBonus(state, 'batchRelief')));
  return { units, cost, reason: p.boxed.deliveries.length ? 'A batch is already on its way' : state.cash < cost ? 'Not enough cash' : null };
}

export function patchQuote(state, p) {
  const cost = Math.min(B.preinternet.patchCap, (p?.boxed?.installed ?? 0) * B.preinternet.patchPerCustomer);
  const reason = !liveBox(p) ? 'No live boxed product' : !p.boxed.installed ? 'No installed customers'
    : p.health >= p.baseHealth && Math.max(1, p.boxed.patchedVersion ?? 1) >= p.version ? 'Installed copies are already patched'
      : state.cash < cost ? 'Not enough cash' : null;
  return { cost, reason };
}

registerAction('orderBatch', (ctx, { productId, units }) => {
  const { state } = ctx, p = state.products.find((x) => x.id === productId);
  const quote = batchQuote(state, p, units);
  if (quote.reason) return { ok: false, reason: quote.reason };
  state.cash -= quote.cost;
  p.boxed.deliveries.push({ units: quote.units, cost: quote.cost, dueWeek: state.week + B.preinternet.leadWeeks });
  p.boxed.unitsOrdered += quote.units;
  p.boxed.manufacturingCost += quote.cost;
  if (state.flags.preinternet?.cdCredit) state.flags.preinternet.cdCredit = false;
  ctx.emit({ type: 'toast', tone: 'info', text: `${p.name}: ${quote.units} copies ordered. Delivery in ${B.preinternet.leadWeeks} playable weeks.` });
  return { ok: true };
});

registerAction('mailPatch', (ctx, { productId }) => {
  const { state } = ctx, p = state.products.find((x) => x.id === productId);
  const quote = patchQuote(state, p);
  if (quote.reason) return { ok: false, reason: quote.reason };
  state.cash -= quote.cost;
  p.boxed.patchCost += quote.cost; p.boxed.patches++; p.boxed.patchedVersion = p.version;
  p.health = p.baseHealth;
  emitChat(ctx, { channel: 'wins', from: '@office', text: PREINTERNET_CHAT.text });
  ctx.emit({ type: 'toast', tone: 'good', text: `${p.name}: patches mailed to ${p.boxed.installed} installations for $${quote.cost}. Product health restored.` });
  return { ok: true };
});

// Demand comes from the ordinary product appeal, market share and acquisition calculation.
export function sellBoxes(ctx, p, demand) {
  const { state } = ctx, inv = p.boxed;
  const deliveryWeek = state.week + 1;
  const due = inv.deliveries.filter((d) => d.dueWeek <= deliveryWeek);
  for (const batch of due) { inv.stock += batch.units; inv.stockCost += batch.cost; inv.delivered += batch.units; }
  inv.deliveries = inv.deliveries.filter((d) => d.dueWeek > deliveryWeek);
  if (due.length && inv.buybackWeek === null) {
    inv.buybackWeek = deliveryWeek + B.preinternet.buybackDelayWeeks;
  }
  if (inv.buybackWeek !== null && deliveryWeek >= inv.buybackWeek && !inv.returnsSettled) {
    fireEvent(ctx, PREINTERNET_EVENTS.find((e) => e.id === 'pre_retail_returns'), p.id);
  }
  const sold = Math.min(inv.stock, Math.max(0, Math.floor(demand)));
  inv.stockCost *= inv.stock > 0 ? (inv.stock - sold) / inv.stock : 0;
  inv.stock -= sold; inv.unitsSold += sold;
  // Whole eligible units avoid rounding drift when retailers sell only a few copies at a time.
  inv.returnUnits ??= Math.round((inv.returnRemainder ?? 0) * B.preinternet.returnEvery);
  delete inv.returnRemainder;
  const returnDue = inv.returnUnits + (p.score < B.preinternet.returnScore ? sold : 0);
  const returned = Math.min(sold, Math.floor(returnDue / B.preinternet.returnEvery));
  inv.returnUnits = returnDue - returned * B.preinternet.returnEvery;
  inv.returns += returned; inv.installed += sold - returned;
  const gross = sold * B.preinternet.price, fees = gross * B.preinternet.retailerShare;
  const refund = returned * B.preinternet.price * (1 - B.preinternet.retailerShare);
  inv.grossSales += gross; inv.retailerFees += fees; inv.refunds += refund;
  inv.weeklyNet = gross - fees - refund; inv.salesWeek = state.week;
  addBoxDeal(ctx, p, sold, inv.weeklyNet);
  inv.salesHistory = (inv.salesHistory ?? []).filter((sale) => sale.week > state.week - B.preinternet.valuationWeeks);
  const sale = inv.salesHistory.at(-1);
  if (sale?.week === state.week) sale.net += inv.weeklyNet;
  else inv.salesHistory.push({ week: state.week, net: inv.weeklyNet });
  p.customers = 0; p.mrr = 0;
}

export function preinternetChoiceReason(state, choice, productId) {
  const p = state.products.find((x) => x.id === productId);
  if (choice === 'verify' && liveBox(p) && !p.boxed.master && state.cash < B.preinternet.verifyCost) return 'Not enough cash';
  if (choice === 'cd' && !state.flags.preinternet?.cdChoice && state.cash < B.preinternet.cdCost) return 'Not enough cash';
  return null;
}

export function preinternetEffect(ctx, choice, productId) {
  const { state } = ctx, p = state.products.find((x) => x.id === productId);
  if (preinternetChoiceReason(state, choice, productId)) return;
  if ((choice === 'verify' || choice === 'rush') && liveBox(p) && !p.boxed.master) {
    p.boxed.master = choice;
    if (choice === 'verify') {
      state.cash -= B.preinternet.verifyCost;
      p.stats.reliability += B.preinternet.verifyReliability;
      p.baseHealth = Math.min(100, p.baseHealth + B.preinternet.verifyReliability);
      p.health = Math.min(p.baseHealth, p.health + B.preinternet.verifyReliability);
    } else { state.cash += B.preinternet.rushCash; bumpDebt(state, B.preinternet.rushDebt); }
  } else if (choice === 'returns' && liveBox(p) && !p.boxed.returnsSettled) {
    const inv = p.boxed, cost = Math.min(B.preinternet.buybackCap, inv.stockCost * B.preinternet.buybackShare);
    state.cash -= cost; inv.buybackCost += cost; inv.withdrawn += inv.stock;
    inv.stock = inv.stockCost = 0; inv.returnsSettled = true;
  } else if ((choice === 'cd' || choice === 'disks') && state.era.id === 'preinternet'
    && state.week - chapterStart(state, 'preinternet') >= B.preinternet.cdWeek) {
    const f = state.flags.preinternet ??= {};
    if (f.cdChoice) return;
    f.cdChoice = choice;
    if (choice === 'cd') { state.cash -= B.preinternet.cdCost; f.cdCredit = true; }
  }
}

export function preinternetStep(ctx) {
  const { state } = ctx;
  if (state.era.id !== 'preinternet') return;
  const f = state.flags.preinternet ??= {};
  if (!f.cdOffered && state.week - chapterStart(state, 'preinternet') >= B.preinternet.cdWeek) {
    f.cdOffered = true; raiseDecision(ctx, 'pre_cd_rom', null, { queue: true });
  }
}
