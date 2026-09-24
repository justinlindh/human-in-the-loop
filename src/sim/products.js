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
import { perk } from './bonus.js';
import { staffMods } from './staff.js';
import { currentEra, eraAtLeast } from './eras.js';
import { autoArrange, spentOn } from './office.js';

// Addressable customers in a category right now: the AI market grows toward full size over the early years.
export function marketSize(state, category) {
  const adoption = Math.min(1, B.adoptionStart + B.adoptionPerYear * state.week / 52);
  return CATEGORIES[category].tam * B.marketScale * adoption;
}

export function productAppeal(state, product) {
  const cat = CATEGORIES[product.category];
  const model = product.model ? MODELS[product.model] : null;
  const trust = model ? model.trust : B.noModelTrust;
  let appeal = Math.max(0, product.score) ** B.appealExp
    * comboFit(product.category, product.angle) * trendMods(state, product.category, product.angle)
    * (1 + state.brand / 100) * (1 + product.novelty * B.noveltyAppealPer) * (0.7 + 0.3 * trust) * product.uptime
    * B.appealScale * (B.sizeAppeal[product.size] ?? 1);
  if (cat.compliance && model && !model.complianceOk) appeal *= B.enterpriseComplianceMult;
  // In the Plateau everyone has the same AI, so polish and a trusted brand are what set a product apart.
  if (eraAtLeast(state, 'plateau')) {
    const total = product.stats.features + product.stats.polish + product.stats.reliability + product.stats.novelty;
    appeal *= 1 + B.plateauPolishAppeal * (total > 0 ? product.stats.polish / total : 0) + B.plateauBrandAppeal * state.brand / 100;
  }
  return appeal;
}

// Competitive pressure in a product's category, excluding the product itself.
export function competition(state, product, appeal = productAppeal(state, product)) {
  const { yearIndex } = dateOf(state.week);
  const c = state.market.categories[product.category];
  // Incumbents and clones bolt AI onto their products as the eras turn, which raises the bar for everyone.
  const era = B.eraCompetition[currentEra(state).id] ?? 1;
  const incumbent = c.incumbentStrength * (1 + B.incumbentStrengthGrowth * yearIndex) * era;
  const clones = c.clones * B.cloneStrength * (1 + 0.2 * yearIndex) * era;
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
  const supportHave = sum(onAssignment(state, 'support'), (p) => B.supportHoursPerPerson * outputMult(state, p) * staffMods(p).supportHours)
    + state.automation.support.level * B.autoSupportHours;
  state.ops.supportShortfall = supportNeed > 0 ? clamp(1 - supportHave / supportNeed, 0, 1) : 0;

  const maintNeed = sum(live, (p) => B.maintenancePerProduct + p.customers * B.maintenancePerCustomer) * Math.max(0, 1 + perk(state, 'maintenanceNeed'));
  const shortfall = maintNeed > 0 ? clamp(1 - state.ops.maintenanceCapacity / maintNeed, 0, 1) : 0;
  state.ops.maintenanceShortfall = shortfall;

  const sellers = onAssignment(state, 'sales');
  const salesBoost = B.salesCloseBoostPerPerson * Math.min(sum(sellers, (p) => staffMods(p).salesBoost), 5)
    + B.autoSalesBoost * state.automation.sales.level;
  const pathAcquisition = Math.max(1, ...sellers.map((p) => staffMods(p).acquisition));
  const pathChurn = Math.min(1, ...onAssignment(state, 'support').map((p) => staffMods(p).churn));
  const uptimeFloor = Math.min(0.9, B.uptimeFloor + perk(state, 'uptimeFloor'));
  const decay = B.healthDecay * Math.max(0, 1 + perk(state, 'healthDecay'));

  // Targets use this week's appeal for every product before any customers move.
  const targets = live.map((p) => {
    const c = competition(state, p);
    return c.total > 0 ? marketSize(state, p.category) * c.appeal / c.total : 0;
  });

  live.forEach((p, i) => {
    const tam = marketSize(state, p.category);
    const target = targets[i];
    if (p.customers < target) {
      const rate = (B.acquisitionRate + B.hypeAcquisition * p.hype + salesBoost) * (1 + state.brand / 200)
        * Math.max(0, 1 + modifierBonus(state, 'acquisition')) * pathAcquisition;
      p.customers = Math.min(tam, p.customers + (target - p.customers) * Math.min(1, rate));
    }
    const inOutage = state.outage?.productId === p.id;
    const churn = Math.max(B.minChurn, B.baseChurn - B.churnBrandRelief * state.brand
      + (p.hype / 10 > p.score + B.wrapperGap ? B.wrapperChurn : 0)
      + state.ops.supportShortfall * B.supportShortfallChurn
      + (1 - Math.min(10, p.novelty) / 10) * B.staleChurn
      + (inOutage ? B.outageChurn : 0)) * Math.max(0, 1 + modifierBonus(state, 'churn')) * pathChurn;
    p.customers = Math.max(0, Math.floor(p.customers * (1 - churn)));

    if (shortfall > 0) p.health -= decay * shortfall;
    else p.health = Math.min(p.baseHealth, p.health + B.healthRecovery);
    if (p.migrationDueWeek !== null && state.week > p.migrationDueWeek) p.health -= B.missedMigrationHealth;
    p.health = clamp(p.health, 0, 100);
    p.uptime = inOutage ? 0 : uptimeFloor + (1 - uptimeFloor) * p.health / 100;

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
export function sunsetProduct(ctx, p, { quiet = false } = {}) {
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
  if (quiet) return cancelled;
  ctx.emit({ type: 'toast', text: `${p.name} has been sunset. A moment of silence in #general.`, tone: 'info' });
  if (cancelled.length) ctx.emit({ type: 'toast', text: `Cancelled work on ${p.name}: ${cancelled.map((j) => j.name).join(', ')}.`, tone: 'info' });
  return cancelled;
}

registerAction('setOwner', (ctx, { productId, staffId }) => {
  const { state } = ctx;
  const p = findProduct(state, productId);
  if (!p || p.killed) return { ok: false, reason: 'No such product' };
  if (staffId !== null && staffId !== undefined && !findStaff(state, staffId)) return { ok: false, reason: 'No such staff member' };
  p.ownerId = staffId ?? null;
  return { ok: true };
});

// Why the company cannot move into a stage yet, or null. Stage gates spread the office across the run.
export function officeGateReason(state, stage) {
  const g = stage.gate ?? {};
  if (g.week && state.week < g.week) return `Available from ${dateOf(g.week).year}`;
  if (g.launches && state.stats.launches < g.launches) return `Needs ${g.launches} launches`;
  if (g.liveProducts && liveProducts(state).length < g.liveProducts) return `Needs ${g.liveProducts} live products`;
  if (g.staff && state.staff.length < g.staff) return `Needs ${g.staff} people`;
  if (g.brand && state.brand < g.brand) return `Needs brand ${g.brand}`;
  return null;
}

registerAction('upgradeOffice', (ctx) => {
  const { state } = ctx;
  const next = OFFICE_STAGES[state.officeStage + 1];
  if (!next) return { ok: false, reason: 'Already at the biggest office' };
  const blocked = officeGateReason(state, next);
  if (blocked) return { ok: false, reason: blocked };
  if (state.cash < next.upgradeCost) return { ok: false, reason: 'Not enough cash' };
  state.cash -= next.upgradeCost;
  state.officeStage++;
  // The movers put everything somewhere sensible; anything that does not fit is refunded in full.
  const { placed, left } = autoArrange(state.officeStage, state.office.placed);
  for (const p of left) state.cash += spentOn(p);
  state.office = { stage: state.officeStage, placed };
  ctx.emit({ type: 'officeUpgrade', stage: state.officeStage });
  ctx.emit({ type: 'toast', text: `Welcome to the ${next.name}! The movers put everything somewhere. Rearrange as you like.`, tone: 'good' });
  return { ok: true };
});
