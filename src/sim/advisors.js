import { B } from './balance.js';
import { createRng, pick } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { weeklyRevenue, weeklyCosts } from './economy.js';
import { totalMrr } from './products.js';
import { mentorOf } from './staff.js';
import { POLICIES } from '../data/policies.js';
import { ERAS } from '../data/eras.js';
import { ADVICE_LINES } from '../data/advisors.js';

// Policies an advisor mentions once they've sat unlocked and unused for a while; after a window it lets them go.
const WORTH_A_LOOK = ['sabbatical', 'apprenticeship', 'craft_fridays', 'blameless', 'no_crunch'];
const first = (p) => p.name.split(' ')[0];
const holdsKnowledge = (p) => p.role === 'engineer' || p.role === 'security' || p.founder;
const live = (state) => state.products.filter((p) => !p.killed);

// Wording comes from a stream of its own, seeded by the game, the week and the topic, so reading advice
// never moves the game's random stream and the same week always reads the same.
function line(state, key, lines, vars) {
  let seed = (state.seed >>> 0) + Math.imul(state.week, 2654435761);
  for (const c of key) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const text = pick(createRng(seed >>> 0), lines);
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

// Every observation that applies now, dismissed or not. Each reads a number some panel already shows.
function observe(state) {
  const out = [];
  const add = (key, advisor, severity, tier, lines, vars, why, target) =>
    out.push({ key, advisor, severity, tier, text: line(state, key, lines, vars), why, target, cooldownWeeks: B.advisor.cooldownWeeks });
  const A = B.advisor;

  const net = weeklyRevenue(state) - Object.values(weeklyCosts(state)).reduce((a, v) => a + v, 0);
  if (state.cash < 0) add('runway', 'cfo', 3, 3, ADVICE_LINES.runway.red, {}, 'Cash: in the red', { panel: 'reports' });
  else if (net < 0) {
    const weeks = Math.floor(state.cash / -net);
    const tier = A.runwayWeeks.filter((w) => weeks < w).length;
    if (tier) add('runway', 'cfo', tier === 1 ? 2 : 3, tier, ADVICE_LINES.runway[tier], { weeks }, `Runway: ${weeks} weeks at this burn`, { panel: 'reports' });
  }

  const burnt = state.staff.filter((p) => p.mood === 'burnout');
  if (burnt.length) {
    const tier = burnt.length >= 2 && burnt.length >= state.staff.length * A.burnoutShareUrgent ? 3 : burnt.length >= 2 ? 2 : 1;
    add('burnout', 'people', tier, tier, ADVICE_LINES.burnout[tier], { name: first(burnt[0]), count: burnt.length },
      `${burnt.length} of ${state.staff.length} people burnt out`, { panel: 'staff' });
  }

  const debtTier = A.debt.filter((d) => state.comprehensionDebt >= d).length;
  if (debtTier) add('debt', 'tech', Math.min(2, debtTier), debtTier, ADVICE_LINES.debt[debtTier], {},
    `Comprehension debt: ${Math.round(state.comprehensionDebt)}`, { panel: 'ops' });

  const holders = state.staff.filter((p) => holdsKnowledge(p) && p.mood !== 'away' && p.knowledge > 0);
  if (holders.length >= A.busFactorMinHolders) {
    const total = holders.reduce((a, p) => a + p.knowledge, 0);
    const top = holders.reduce((a, p) => (p.knowledge > a.knowledge ? p : a));
    const share = top.knowledge / total;
    const tier = A.busFactorShare.filter((x) => share >= x).length;
    if (tier) add(`busFactor:${top.id}`, 'tech', tier, tier, ADVICE_LINES.busFactor[tier], { name: first(top) },
      `${first(top)} holds ${Math.round(share * 100)}% of what the team knows`, { panel: 'staff', arg: top.id });
  }

  const unused = WORTH_A_LOOK.map((id) => ({ id, since: state.unlocks?.[`policy.${id}`] }))
    .filter(({ id, since }) => since !== undefined && !state.policies[id] && !(POLICIES[id]?.excludes && state.policies[POLICIES[id].excludes])
      && state.week - since >= A.unusedPolicyWeeks && state.week - since < A.unusedPolicyWeeks + A.unusedPolicyWindowWeeks)
    .sort((a, b) => a.since - b.since)[0];
  if (unused) {
    const months = Math.floor((state.week - unused.since) / (52 / 12));
    add(`unusedPolicy:${unused.id}`, 'people', 1, 1, ADVICE_LINES.unusedPolicy[1], { policy: POLICIES[unused.id].name, months },
      `${POLICIES[unused.id].name}: unlocked, never switched on`, { panel: 'policies', arg: unused.id });
  }

  const era = state.era;
  if (era && era.id !== 'classic' && state.week - (era.since ?? 0) < A.eraWeeks) {
    const name = ERAS.find((e) => e.id === era.id)?.name ?? era.id;
    add(`era:${era.id}`, 'tech', 1, 1, ADVICE_LINES.era[era.id] ?? ADVICE_LINES.era.any, { era: name }, `A new era: ${name}`, null);
  }

  const products = live(state), mrr = totalMrr(state);
  if (products.length >= 2 && mrr > 0) {
    const top = products.reduce((a, p) => (p.mrr > a.mrr ? p : a));
    const pct = Math.round((100 * top.mrr) / mrr);
    if (pct >= A.oneProductPct) add('oneProduct', 'cfo', 1, 1, ADVICE_LINES.oneProduct[1], { product: top.name, pct },
      `${top.name}: ${pct}% of revenue`, { panel: 'reports' });
  }

  for (const p of products) {
    if (p.migrationDueWeek === null || p.migrationDueWeek === undefined) continue;
    const left = p.migrationDueWeek - state.week;
    if (left > A.migrationWarnWeeks) continue;
    const tier = left < 0 ? 2 : 1;
    add(`migration:${p.id}`, 'tech', 2, tier, ADVICE_LINES.migration[tier], { product: p.name },
      left < 0 ? `${p.name}: migration overdue` : `${p.name}: migration due in ${left} weeks`, { panel: 'reports', arg: p.id });
  }

  const juniors = state.staff.filter((p) => p.seniority === 'junior' && p.mood !== 'away' && !mentorOf(state, p));
  if (juniors.length >= A.unmentoredJuniors) add('juniors', 'people', 1, 1, ADVICE_LINES.juniors[1], { count: juniors.length },
    `${juniors.length} juniors without a mentor`, { panel: 'staff' });

  return out;
}

// What the advisors would say now, most urgent first. A pure read: it changes nothing, draws nothing from
// the game's random stream, and leaves out topics the player dismissed at their current tier or worse.
export function advice(state) {
  const dismissed = state.advisors?.dismissed ?? {};
  const list = observe(state).filter((a) => !(dismissed[a.key] >= a.tier));
  if (!list.length) {
    const advisor = ['cfo', 'people', 'tech'][state.week % 3];
    return [{ key: 'fine', advisor, severity: 1, tier: 1, text: line(state, 'fine', ADVICE_LINES.fine[advisor], {}),
      why: 'Nothing needs a look', target: null, cooldownWeeks: B.advisor.cooldownWeeks }];
  }
  return list.sort((a, b) => b.severity - a.severity || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

registerAction('dismissAdvice', (ctx, { key }) => {
  const { state } = ctx;
  const a = observe(state).find((x) => x.key === key);
  if (!a) return { ok: false, reason: 'No such advice' };
  (state.advisors ??= { dismissed: {}, pushed: {}, lastPushWeek: null }).dismissed[key] = a.tier;
  return { ok: true };
});

// The rare unprompted line: urgent advice only, at most one every B.advisor.pushGapWeeks, never in a week
// that raises a decision or a staged prompt, and a topic isn't pushed again within its cooldown unless it
// got worse. Also forgets dismissals and pushes for topics that no longer apply.
export function advisorsSystem(ctx) {
  const { state } = ctx;
  if (!B.advisorsEnabled) return;
  const adv = (state.advisors ??= { dismissed: {}, pushed: {}, lastPushWeek: null });
  const now = new Set(observe(state).map((a) => a.key));
  for (const k of Object.keys(adv.dismissed)) if (!now.has(k)) delete adv.dismissed[k];
  for (const k of Object.keys(adv.pushed)) if (!now.has(k)) delete adv.pushed[k];
  if (ctx.events.some((e) => e.type === 'decision' || e.type === 'chatPrompt')) return;
  if (adv.lastPushWeek !== null && state.week - adv.lastPushWeek < B.advisor.pushGapWeeks) return;
  const due = advice(state).find((a) => a.severity === 3
    && (!adv.pushed[a.key] || a.tier > adv.pushed[a.key].tier || state.week - adv.pushed[a.key].week >= a.cooldownWeeks));
  if (!due) return;
  adv.pushed[due.key] = { week: state.week, tier: due.tier };
  adv.lastPushWeek = state.week;
  const { key, advisor, severity, tier, text, why, target } = due;
  ctx.emit({ type: 'advice', key, advisor, severity, tier, text, why, target });
}
registerSystem('advisors', advisorsSystem, 96);
