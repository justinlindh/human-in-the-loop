import { B } from './balance.js';
import { clamp, sum, dateOf } from './util.js';
import { registerAction, registerSystem } from './registry.js';
import { outputMult, findStaff, defaultAssignment } from './staff.js';
import { trendMods, liveProducts, findProduct } from './projects.js';
import { comboFit } from '../data/combos.js';
import { CATEGORIES } from '../data/categories.js';
import { MODELS } from '../data/models.js';
import { OFFICE_STAGES } from '../data/office.js';
import { modifierBonus } from './modifiers.js';

export function productAppeal(state, product) {
  const cat = CATEGORIES[product.category];
  const model = MODELS[product.model];
  let appeal = Math.max(0, product.score) ** B.appealExp
    * comboFit(product.category, product.angle) * trendMods(state, product.category, product.angle)
    * (1 + state.brand / 100) * (1 + product.novelty / 20) * (0.7 + 0.3 * model.trust) * product.uptime;
  if (cat.compliance && !model.complianceOk) appeal *= B.enterpriseComplianceMult;
  return appeal;
}

// Competitive pressure in a product's category, excluding the product itself.
export function competition(state, product, appeal = productAppeal(state, product)) {
  const { yearIndex } = dateOf(state.week);
  const c = state.market.categories[product.category];
  const incumbent = c.incumbentStrength * (1 + B.incumbentStrengthGrowth * yearIndex);
  const clones = c.clones * B.cloneStrength * (1 + 0.2 * yearIndex);
  const ownOthers = sum(liveProducts(state).filter((p) => p.id !== product.id && p.category === product.category), (p) => productAppeal(state, p));
  return { appeal, incumbent, clones, ownOthers, total: appeal + incumbent + clones + ownOthers };
}

export function categoryShare(state, product) {
  const c = competition(state, product);
  return c.total > 0 ? { mine: c.appeal / c.total, incumbent: c.incumbent / c.total } : { mine: 0, incumbent: 1 };
}

export const totalMrr = (state) => sum(liveProducts(state), (p) => p.mrr);

const onAssignment = (state, type) => state.staff.filter((p) => p.mood !== 'away' && p.assignment.type === type);

export function productsSystem(ctx) {
  const { state } = ctx;
  const live = liveProducts(state);

  const customers = sum(live, (p) => p.customers);
  const supportNeed = customers * B.supportHoursPerCustomer;
  const supportHave = sum(onAssignment(state, 'support'), (p) => B.supportHoursPerPerson * outputMult(state, p))
    + state.automation.support.level * B.autoSupportHours;
  state.ops.supportShortfall = supportNeed > 0 ? clamp(1 - supportHave / supportNeed, 0, 1) : 0;

  const maintNeed = sum(live, (p) => B.maintenancePerProduct + p.customers * B.maintenancePerCustomer);
  const shortfall = maintNeed > 0 ? clamp(1 - state.ops.maintenanceCapacity / maintNeed, 0, 1) : 0;
  state.ops.maintenanceShortfall = shortfall;

  const salesBoost = B.salesCloseBoostPerPerson * Math.min(onAssignment(state, 'sales').length, 5)
    + B.autoSalesBoost * state.automation.sales.level;

  // Targets use this week's appeal for every product before any customers move.
  const targets = live.map((p) => {
    const c = competition(state, p);
    return c.total > 0 ? CATEGORIES[p.category].tam * c.appeal / c.total : 0;
  });

  live.forEach((p, i) => {
    const tam = CATEGORIES[p.category].tam;
    const target = targets[i];
    if (p.customers < target) {
      const rate = (B.acquisitionRate + B.hypeAcquisition * p.hype + salesBoost) * (1 + state.brand / 200)
        * Math.max(0, 1 + modifierBonus(state, 'acquisition'));
      p.customers = Math.min(tam, p.customers + (target - p.customers) * Math.min(1, rate));
    }
    const inOutage = state.outage?.productId === p.id;
    const churn = Math.max(B.minChurn, B.baseChurn - B.churnBrandRelief * state.brand
      + (p.hype / 10 > p.score + B.wrapperGap ? B.wrapperChurn : 0)
      + state.ops.supportShortfall * B.supportShortfallChurn
      + (inOutage ? B.outageChurn : 0)) * Math.max(0, 1 + modifierBonus(state, 'churn'));
    p.customers = Math.max(0, Math.floor(p.customers * (1 - churn)));

    if (shortfall > 0) p.health -= B.healthDecay * shortfall;
    else p.health = Math.min(p.baseHealth, p.health + B.healthRecovery);
    if (p.migrationDueWeek !== null && state.week > p.migrationDueWeek) p.health -= B.missedMigrationHealth;
    p.health = clamp(p.health, 0, 100);
    p.uptime = inOutage ? 0 : B.uptimeFloor + (1 - B.uptimeFloor) * p.health / 100;

    p.novelty = Math.max(0, p.novelty - B.noveltyDecay);
    p.mrr = p.customers * CATEGORIES[p.category].price;
  });
  state.stats.peakMrr = Math.max(state.stats.peakMrr, totalMrr(state));
}

registerSystem('products', productsSystem, 40);

registerAction('killProduct', (ctx, { productId }) => {
  const p = findProduct(ctx.state, productId);
  if (!p || p.killed) return { ok: false, reason: 'No such product' };
  sunsetProduct(ctx, p);
  return { ok: true };
});

// Sunsets a live product: zeroes it, hurts its builders, and cancels its update and migration work.
export function sunsetProduct(ctx, p) {
  const { state } = ctx;
  Object.assign(p, { killed: true, customers: 0, mrr: 0 });
  for (const s of state.staff) {
    const builder = (s.role === 'engineer' || s.role === 'designer') && s.hiredWeek <= p.launchedWeek;
    if (builder || s.id === p.ownerId) s.meaning = Math.max(0, s.meaning - 10);
  }
  if (state.outage?.productId === p.id) state.outage = null;
  p.ownerId = null;
  const cancelled = state.projects.filter((j) => j.productId === p.id);
  if (cancelled.length) {
    const ids = new Set(cancelled.map((j) => j.id));
    for (const s of state.staff) if (s.assignment.type === 'project' && ids.has(s.assignment.targetId)) s.assignment = defaultAssignment(s);
    state.projects = state.projects.filter((j) => !ids.has(j.id));
  }
  ctx.emit({ type: 'toast', text: `${p.name} has been sunset. A moment of silence in #general.`, tone: 'info' });
  if (cancelled.length) ctx.emit({ type: 'toast', text: `Cancelled work on ${p.name}: ${cancelled.map((j) => j.name).join(', ')}.`, tone: 'info' });
}

registerAction('setOwner', (ctx, { productId, staffId }) => {
  const { state } = ctx;
  const p = findProduct(state, productId);
  if (!p || p.killed) return { ok: false, reason: 'No such product' };
  if (staffId !== null && staffId !== undefined && !findStaff(state, staffId)) return { ok: false, reason: 'No such staff member' };
  p.ownerId = staffId ?? null;
  return { ok: true };
});

registerAction('upgradeOffice', (ctx) => {
  const { state } = ctx;
  const next = OFFICE_STAGES[state.officeStage + 1];
  if (!next) return { ok: false, reason: 'Already at the biggest office' };
  if (state.cash < next.upgradeCost) return { ok: false, reason: 'Not enough cash' };
  state.cash -= next.upgradeCost;
  state.officeStage++;
  ctx.emit({ type: 'officeUpgrade', stage: state.officeStage });
  ctx.emit({ type: 'toast', text: `Welcome to the ${next.name}! Room for ${next.capacity} people.`, tone: 'good' });
  return { ok: true };
});
