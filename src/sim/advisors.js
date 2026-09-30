import { B } from './balance.js';
import { createRng, pick } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { weeklyRevenue, weeklyCosts, policyCost } from './economy.js';
import { totalMrr } from './products.js';
import { mentorOf, validateAssignment } from './staff.js';
import { POLICIES } from '../data/policies.js';
import { freeBuilders } from './projects.js';
import { isUnlocked } from './unlocks.js';
import { currentEra, eraAtLeast, eraLines } from './eras.js';
import { isPeriod } from '../data/period-content.js';
import { ADVICE_LINES } from '../data/advisors.js';
import { ROLE_JOBS, ROLE_JOBS_FALLBACK } from '../data/roles.js';

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
  const text = pick(createRng(seed >>> 0), isPeriod(state) ? eraLines(state, lines) : lines);
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

// Every observation that applies now, dismissed or not. Each reads a number some panel already shows.
function observe(state) {
  const out = [];
  const noticed = state.advisors?.noticed ?? {};
  const add = (key, advisor, severity, tier, lines, vars, why, target) =>
    out.push({ key, advisor, severity, tier, text: line(state, key, lines, vars), why, target, cooldownWeeks: B.advisor.cooldownWeeks, since: noticed[key] ?? state.week });
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
    `Tech debt: ${Math.round(state.comprehensionDebt)}`, { panel: 'ops' });

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
    const name = currentEra(state).name;
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
    if (state.projects.some((j) => j.kind === 'migration' && j.productId === p.id)) continue;
    const left = p.migrationDueWeek - state.week;
    if (left > A.migrationWarnWeeks) continue;
    const tier = left < 0 ? 2 : 1;
    add(`migration:${p.id}`, 'tech', 2, tier, ADVICE_LINES.migration[tier], { product: p.name },
      left < 0 ? `${p.name}: migration overdue` : `${p.name}: migration due in ${left} weeks`, { panel: 'reports', arg: p.id });
  }

  const juniors = state.staff.filter((p) => p.seniority === 'junior' && p.mood !== 'away' && !mentorOf(state, p));
  if (juniors.length >= A.unmentoredJuniors) add('juniors', 'people', 1, 1, ADVICE_LINES.juniors[1], { count: juniors.length },
    `${juniors.length} juniors without a mentor`, { panel: 'staff' });

  for (const sq of idleSquads(state)) {
    add(`squadIdle:${sq.id}`, 'people', 1, 1, ADVICE_LINES.squadIdle[1], { squad: sq.name },
      `${sq.name}: idle for ${state.week - sq.postedWeek} weeks`, { panel: 'squads', arg: sq.id });
  }

  for (const a of out) a.options = optionsFor(state, a);
  return out;
}

// Squads with members that have sat on an idle posting (not a post-launch bench) for squadIdleWeeks or more.
const idleSquads = (state) => (state.squads ?? []).filter((sq) => sq.memberIds.length && sq.posting.type === 'idle'
  && sq.benchUntil === null && state.week - sq.postedWeek >= B.squadIdleWeeks);

const offered = (p, type) => ['project', 'idle'].includes(type) || (type === 'mentor' ? p.seniority !== 'junior' : (ROLE_JOBS[p.role] ?? ROLE_JOBS_FALLBACK).includes(type));
// Nobody away, burned out or coasting gets suggested for more work.
const UNFIT = new Set(['away', 'burnout', 'coasting']);

// Who to suggest for a job: someone in and up to it, not already doing it, whose picker offers it and who may
// take it. Idle people first, then people off project work, then the least know-how.
function someoneFor(state, job, fits = () => true) {
  const busy = (p) => (p.assignment.type === 'idle' ? 0 : p.assignment.type === 'project' ? 2 : 1);
  return state.staff
    .filter((p) => !UNFIT.has(p.mood) && fits(p) && offered(p, job.type) && !validateAssignment(state, p, job)
      && !(p.assignment.type === job.type && (p.assignment.targetId ?? null) === (job.targetId ?? null)))
    .sort((x, y) => busy(x) - busy(y) || x.knowledge - y.knowledge || (x.id < y.id ? -1 : 1))[0];
}

// Two or three things the player could do about a topic, each a real action open to them now, named with
// the menu where it's done. They're offered, never taken. A staff option lands on a control: a person with
// the job to pick for them (`assign`), a button on their screen (`focus`), or the Hire tab (`tab`).
function optionsFor(state, a) {
  const o = [];
  const opt = (text, panel, arg, more) => o.push({ text, target: { panel, ...(arg === undefined ? {} : { arg }), ...more } });
  const hire = (text) => opt(text, 'staff', undefined, { tab: 'hire' });
  const assign = (text, p, job, note) => opt(text, 'staff', p.id, { assign: { type: job.type, targetId: job.targetId ?? null }, ...(note ? { note } : {}) });
  // "Put <someone> on <job>", or the hire tab when nobody in can take it.
  const putOn = (label, type, orHire, fits) => {
    const p = someoneFor(state, { type, targetId: null }, fits);
    if (p) assign(`Put ${first(p)} on ${label}`, p, { type });
    else if (orHire) hire(orHire);
  };
  const policyOpen = (id) => isUnlocked(state, `policy.${id}`) && !state.policies[id];
  const products = live(state);
  const building = (kind, productId) => state.projects.some((j) => j.kind === kind && (productId === undefined || j.productId === productId));
  const [topic, id] = a.key.split(':');
  const person = (pid) => state.staff.find((p) => p.id === pid);
  const unmentored = state.staff.filter((p) => p.seniority === 'junior' && p.mood !== 'away' && !mentorOf(state, p));
  switch (topic) {
    case 'runway': {
      putOn('sales', 'sales');
      if (isUnlocked(state, 'marketing') && products.length) opt('Run a campaign for your best seller', 'marketing');
      const paid = Object.keys(state.policies).find((pid) => state.policies[pid] && POLICIES[pid] && policyCost(state, pid) > 0);
      if (paid) opt(`Switch off ${POLICIES[paid].name}; it costs money every week`, 'policies', paid);
      else if (products.length >= 2) {
        const weakest = products.reduce((x, p) => (p.customers < x.customers ? p : x));
        opt(`Retire ${weakest.name}, your smallest product`, 'reports', weakest.id);
      }
      break;
    }
    case 'burnout': {
      const p = state.staff.find((x) => x.mood === 'burnout');
      if (p) opt(`Send ${first(p)} on time off`, 'staff', p.id, { focus: 'timeOff' });
      if (state.policies.crunch) opt('Switch off Crunch Mode', 'policies', 'crunch');
      else if (policyOpen('no_crunch')) opt('Switch on No Crunch', 'policies', 'no_crunch');
      if (p && p.assignment.type !== 'idle') assign(`Give ${first(p)} lighter work`, p, { type: 'idle' }, 'Idle for a while: no project, no pressure.');
      break;
    }
    case 'squadIdle': {
      const sq = (state.squads ?? []).find((x) => x.id === id);
      const waiting = state.projects.find((j) => !state.staff.some((p) => p.assignment.type === 'project' && p.assignment.targetId === j.id));
      if (sq && waiting) opt(`Post ${sq.name} to ${waiting.name}`, 'squads', sq.id);
      else if (freeBuilders(state)) opt('Start a new product', 'build');
      if (sq) opt(`Post ${sq.name} to maintenance`, 'squads', sq.id);
      break;
    }
    case 'debt': {
      // The same rule startProject uses: any engineer, designer or founder who isn't away can take it on.
      if (!building('refactor')) {
        if (freeBuilders(state)) opt('Start The Big Refactor', 'build');
        else hire('Hire an engineer who can take on The Big Refactor');
      }
      if (policyOpen('comprehension_reviews')) opt('Switch on Code Comprehension Reviews', 'policies', 'comprehension_reviews');
      const idle = idleSquads(state)[0];
      if (idle) opt(`Post ${idle.name} to maintenance`, 'squads', idle.id);
      else putOn('maintenance', 'maintenance', 'Hire an engineer for maintenance', (p) => p.role === 'engineer');
      break;
    }
    case 'busFactor': {
      const p = person(id);
      const mentee = unmentored.find((j) => p && !UNFIT.has(p.mood) && !validateAssignment(state, p, { type: 'mentor', targetId: j.id }));
      if (mentee) assign(`Have ${first(p)} mentor ${first(mentee)}`, p, { type: 'mentor', targetId: mentee.id });
      if (!state.policies.daily_standups && !state.policies.async_standups && isUnlocked(state, 'policy.daily_standups')) opt('Switch on standups, so knowledge gets shared', 'policies', 'daily_standups');
      // Working the same job as the one who knows it: another pair of hands on their project or their beat.
      const work = p && ['project', 'maintenance', 'security'].includes(p.assignment.type) ? p.assignment : null;
      const helper = work && someoneFor(state, work, (x) => x.id !== p.id && holdsKnowledge(x));
      if (helper) {
        const what = work.type === 'project' ? state.projects.find((j) => j.id === work.targetId)?.name ?? 'their project' : work.type;
        assign(`Put ${first(helper)} on ${what} with ${first(p)}`, helper, work,
          `${first(p)} knows how most of it works. Working the same job is how ${first(helper)} learns it too.`);
      }
      hire('Hire another engineer');
      break;
    }
    case 'juniors': {
      const junior = unmentored[0];
      const senior = someoneFor(state, { type: 'mentor', targetId: junior.id }, (p) => p.seniority === 'senior');
      if (senior) assign(`Have ${first(senior)} mentor ${first(junior)}`, senior, { type: 'mentor', targetId: junior.id });
      if (policyOpen('apprenticeship')) opt('Switch on the Apprenticeship Program', 'policies', 'apprenticeship');
      opt(`Send ${first(junior)} to training`, 'staff', junior.id, { focus: 'training' });
      break;
    }
    case 'migration': {
      const pr = products.find((p) => p.id === id);
      if (pr && !building('migration', pr.id)) opt(`Start the ${pr.name} migration`, 'build', pr.id);
      putOn('maintenance', 'maintenance', 'Hire an engineer for maintenance', (p) => p.role === 'engineer');
      break;
    }
    case 'oneProduct': {
      opt('Start a new product', 'build');
      const second = [...products].sort((x, y) => y.mrr - x.mrr)[1];
      if (second && isUnlocked(state, 'marketing')) opt(`Run a campaign for ${second.name}`, 'marketing', second.id);
      break;
    }
    case 'unusedPolicy':
      opt(`Try ${POLICIES[id].name} for a quarter`, 'policies', id);
      opt('See what it costs first', 'policies', id);
      break;
    case 'era':
      if (id === 'chatgbt') {
        if (isUnlocked(state, 'models')) opt('Choose what your next product runs on', 'models');
        if (isUnlocked(state, 'automation')) opt('See which routine work a model could take on', 'automation');
      } else if (eraAtLeast(state, 'agents')) {
        putOn('oversight of the agents', 'oversight', 'Hire someone to watch the agents');
        if (isUnlocked(state, 'automation')) opt('Hand some routine work to agents', 'automation');
      } else {
        opt(id === 'web2' ? 'Plan for old-browser testing before you ship' : 'Check the cash you can keep through the bust', 'reports');
      }
      opt('Start something built for the new era', 'build');
      break;
    default:
      opt('Start a new project', 'build');
      hire('Look at who you could hire');
  }
  if (o.length < 2) opt("Look at who's working on what", 'staff');
  return o.slice(0, 3);
}

// What the advisors would say now, most urgent first. A pure read: it changes nothing, draws nothing from
// the game's random stream, and leaves out topics the player dismissed at their current tier or worse.
export function advice(state) {
  const dismissed = state.advisors?.dismissed ?? {};
  const list = observe(state).filter((a) => !(dismissed[a.key] >= a.tier));
  if (!list.length) {
    const advisor = ['cfo', 'people', 'tech'][state.week % 3];
    return [{ key: 'fine', advisor, severity: 1, tier: 1, text: line(state, 'fine', ADVICE_LINES.fine[advisor], {}),
      why: 'Nothing needs a look', target: null, cooldownWeeks: B.advisor.cooldownWeeks, since: state.advisors?.noticed?.fine ?? state.week,
      options: optionsFor(state, { key: 'fine' }) }];
  }
  return list.sort((a, b) => b.severity - a.severity || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

registerAction('dismissAdvice', (ctx, { key }) => {
  const { state } = ctx;
  // A key that no longer applies (the line changed while the player looked at it) is a quiet no-op.
  const a = observe(state).find((x) => x.key === key);
  if (!a) return { ok: true };
  (state.advisors ??= { dismissed: {}, pushed: {}, lastPushWeek: null, noticed: {} }).dismissed[key] = a.tier;
  return { ok: true };
});

// The rare unprompted line: urgent advice only, at most one every B.advisor.pushGapWeeks, never in a week
// that raises a decision or a staged prompt, and a topic isn't pushed again within its cooldown unless it
// got worse. Also records the week each topic started applying (for `since`), and forgets dismissals, pushes
// and those weeks for topics that no longer apply.
export function advisorsSystem(ctx) {
  const { state } = ctx;
  if (!B.advisorsEnabled) return;
  const adv = (state.advisors ??= { dismissed: {}, pushed: {}, lastPushWeek: null, noticed: {} });
  const now = new Set(observe(state).map((a) => a.key));
  for (const k of Object.keys(adv.dismissed)) if (!now.has(k)) delete adv.dismissed[k];
  for (const k of Object.keys(adv.pushed)) if (!now.has(k)) delete adv.pushed[k];
  // Each key's episode starts the first week it applies ('fine' when nothing else does) and ends when it stops.
  const noticed = (adv.noticed ??= {});
  const current = now.size ? now : new Set(['fine']);
  for (const k of current) noticed[k] ??= state.week;
  for (const k of Object.keys(noticed)) if (!current.has(k)) delete noticed[k];
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
