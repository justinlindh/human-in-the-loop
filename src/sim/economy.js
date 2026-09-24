import { B } from './balance.js';
import { sum } from './util.js';
import { registerSystem } from './registry.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { MODELS } from '../data/models.js';
import { POLICIES } from '../data/policies.js';
import { OFFICE_STAGES } from '../data/office.js';

// Weekly spend broken out by line item; the UI can show it as a burn breakdown.
export function weeklyCosts(state) {
  const live = liveProducts(state);
  const gpuMult = state.flags.gpuShortageWeeks > 0 ? 1.5 : 1;
  const autos = Object.values(state.automation).filter((a) => a.level > 0);
  const selfHosted = live.some((p) => MODELS[p.model].selfHosted) || autos.some((a) => MODELS[a.model].selfHosted);
  return {
    salaries: sum(state.staff, (p) => p.salary),
    rent: OFFICE_STAGES[state.officeStage].rent,
    models: sum(live, (p) => MODELS[p.model].productCost * state.models[p.model].costMult * p.customers * 12 / 52),
    automation: sum(autos, (a) => MODELS[a.model].autoCost * state.models[a.model].costMult * a.level) * gpuMult,
    gpu: selfHosted ? B.gpuWeeklySelfHost : 0,
    policies: sum(Object.keys(state.policies).filter((id) => state.policies[id] && POLICIES[id]), (id) => POLICIES[id].weeklyCost),
    tooling: state.security.tooling ? B.toolingWeekly : 0,
  };
}

export const weeklyRevenue = (state) => totalMrr(state) * 12 / 52;

export function economySystem(ctx) {
  const { state } = ctx;
  const costs = sum(Object.values(weeklyCosts(state)));
  state.cash += weeklyRevenue(state) - costs;
  if (state.flags.gpuShortageWeeks > 0) state.flags.gpuShortageWeeks--;
  if (state.cash < 0) {
    if (state.lowCashWeeks === 0) {
      ctx.emit({ type: 'toast', text: `Cash is negative. ${B.runwayLoseWeeks} weeks in the red and it is over.`, tone: 'warn' });
    }
    state.lowCashWeeks++;
  } else {
    state.lowCashWeeks = 0;
  }
}

registerSystem('economy', economySystem, 80);
