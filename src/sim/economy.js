import { B } from './balance.js';
import { sum } from './util.js';
import { registerSystem } from './registry.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { MODELS } from '../data/models.js';
import { POLICIES } from '../data/policies.js';
import { OFFICE_STAGES } from '../data/office.js';
import { raiseDecision } from './events.js';

// Dollars per customer per month for a product on this model, including price hikes.
// A product without a model (a Classic approach) costs nothing per customer.
export const modelCostPerCustomer = (state, modelId) => (modelId ? MODELS[modelId].productCost * B.modelCostMult * state.models[modelId].costMult : 0);

// Dollars per week for one automation function at its current level and model.
export function automationWeeklyCost(state, fn) {
  const a = state.automation[fn];
  if (a.level <= 0) return 0;
  const gpuMult = state.flags.gpuShortageWeeks > 0 ? 1.5 : 1;
  return MODELS[a.model].autoCost * B.autoCostMult * state.models[a.model].costMult * a.level * gpuMult;
}

// What a policy costs this week: a flat cost, plus a share of payroll or a cost per head for the upkeep dials.
export function policyCost(state, id) {
  const pol = POLICIES[id];
  if (!pol) return 0;
  return pol.weeklyCost + (pol.costPayrollShare ?? 0) * sum(state.staff, (p) => p.salary) + (pol.costPerHead ?? 0) * state.staff.length;
}

// The stage's rent plus the rent of every HQ expansion step taken.
export function officeRent(state) {
  const st = OFFICE_STAGES[state.officeStage];
  return st.rent + (st.expansions ?? []).slice(0, state.office.expansion ?? 0).reduce((a, e) => a + e.rent, 0);
}

// Weekly spend broken out by line item; the UI can show it as a burn breakdown.
export function weeklyCosts(state) {
  const live = liveProducts(state);
  const gpuMult = state.flags.gpuShortageWeeks > 0 ? 1.5 : 1;
  const autos = Object.values(state.automation).filter((a) => a.level > 0);
  const selfHosted = live.some((p) => p.model && MODELS[p.model].selfHosted) || autos.some((a) => MODELS[a.model].selfHosted);
  return {
    salaries: sum(state.staff, (p) => p.salary),
    rent: officeRent(state) * (state.workPolicy === 'remote' ? B.remoteRentMult : 1),
    models: sum(live, (p) => modelCostPerCustomer(state, p.model) * p.customers * 12 / 52),
    automation: sum(Object.keys(state.automation), (fn) => automationWeeklyCost(state, fn)),
    gpu: selfHosted ? B.gpuWeeklySelfHost : 0,
    policies: sum(Object.keys(state.policies).filter((id) => state.policies[id] && POLICIES[id]), (id) => policyCost(state, id)),
    tooling: state.security.tooling ? B.toolingWeekly : 0,
    overhead: Math.max(0, state.staff.length - B.overheadFreeHeadcount) * B.overheadPerHead,
  };
}

export const weeklyRevenue = (state) => totalMrr(state) * 12 / 52;

export function economySystem(ctx) {
  const { state } = ctx;
  const net = weeklyRevenue(state) - sum(Object.values(weeklyCosts(state)));
  const wasSolvent = state.cash >= 0;
  state.cash += net;
  if (state.flags.gpuShortageWeeks > 0) state.flags.gpuShortageWeeks--;
  if (state.cash >= 0) {
    state.lowCashWeeks = 0;
    return;
  }
  // Only weeks that lose money count toward bankruptcy; a profitable week in the red holds the count.
  if (net <= 0) state.lowCashWeeks++;
  if (wasSolvent) {
    ctx.emit({ type: 'toast', text: `Cash is negative. ${B.runwayLoseWeeks} losing weeks in the red and it is over.`, tone: 'warn' });
    const last = state.flags.bridgeOfferWeek;
    if (last === undefined || state.week - last >= B.bridgeOfferCooldownWeeks) {
      state.flags.bridgeOfferWeek = state.week;
      raiseDecision(ctx, 'bridge_loan', null, { queue: true });
    }
  }
}

registerSystem('economy', economySystem, 80);
