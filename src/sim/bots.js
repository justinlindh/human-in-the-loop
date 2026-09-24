// Strategy bots for the balance harness. Each bot is (state) -> action[] and is called once a week
// before tick, after any pending decision has been resolved with the bot's own chooser.
import { B } from './balance.js';
import { dateOf, sum } from './util.js';
import { createGame } from './state.js';
import { tick } from './tick.js';
import { dispatch as rawDispatch } from './actions.js';
import { FUNCTIONS } from './state.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { weeklyCosts, weeklyRevenue } from './economy.js';
import { oversightRequired } from './automation.js';
import { trendMods } from './projects.js';
import { capacity } from './staff.js';
import { deskCapacity, suggestPlacement } from './office.js';
import { scoreRun } from './endgame.js';
import { comboFit } from '../data/combos.js';
import { CATEGORIES } from '../data/categories.js';
import { MODELS } from '../data/models.js';
import { OFFICE_STAGES } from '../data/office.js';
import { POLICIES } from '../data/policies.js';
import { EVENTS } from '../data/events.js';
import { ROLES } from '../data/roles.js';

// Where the events of the bots' own dispatches go while botTurn or botDecide runs (null: dropped).
let sink = null;
const dispatch = (s, action) => {
  const res = rawDispatch(s, action);
  if (sink && res.events.length) sink(res.events, action);
  return res;
};

// Throws with the path of the first non-finite number found in state.
export function assertFinite(value, path = 'state') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}: ${value}`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertFinite(v, `${path}.${k}`);
  }
}

const burn = (s) => Math.max(1, sum(Object.values(weeklyCosts(s))) - weeklyRevenue(s));
const costs = (s) => sum(Object.values(weeklyCosts(s)));
const net = (s) => weeklyRevenue(s) - costs(s);
// A hire is affordable if the company stays cash-positive with the new salary, or has a long runway.
const canAffordHire = (s, salary = 2000) => net(s) - salary > 0 ? s.cash > 12 * (costs(s) + salary) : s.cash > 40 * (costs(s) + salary - weeklyRevenue(s));
const weeksOfBurn = (s) => s.cash / burn(s);
const present = (s) => s.staff.filter((p) => p.mood !== 'away');
const builders = (s) => present(s).filter((p) => p.role === 'engineer' || p.role === 'designer' || p.founder);

function bestCombo(s) {
  let best = null;
  for (const c of s.market.unlockedCategories) {
    const cat = CATEGORIES[c];
    const inCat = liveProducts(s).filter((p) => p.category === c).length;
    for (const a of s.market.unlockedAngles) {
      const v = comboFit(c, a) * trendMods(s, c, a) * Math.log10(cat.tam * cat.price) / (1 + inCat);
      if (!best || v > best.v) best = { c, a, v };
    }
  }
  return best;
}

const bestModel = (s, prefer) => prefer.find((m) => s.models[m].available && !s.models[m].deprecated) ?? 'chatgbt';
const cheapestModel = (s) => Object.keys(s.models).filter((m) => s.models[m].available && !s.models[m].deprecated)
  .sort((a, b) => MODELS[a].autoCost * s.models[a].costMult - MODELS[b].autoCost * s.models[b].costMult)[0];

function startNew(s, size, model, name) {
  const combo = bestCombo(s);
  return { type: 'startProject', kind: 'new', name, category: combo.c, angle: combo.a, model, size };
}

function assignAll(s, people, projectId) {
  return people.filter((p) => !(p.assignment.type === 'project' && p.assignment.targetId === projectId))
    .map((p) => ({ type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: projectId } }));
}

// Runs actions immediately so later decisions in the same week see their effects.
function act(s, actions) {
  const results = [];
  for (const a of actions) results.push(dispatch(s, a));
  return results;
}

const fixedName = (s) => `Product ${s.stats.launches + s.projects.length + 1}`;

function pickDecision(s, scorer) {
  const d = s.pendingDecision;
  const ev = EVENTS[d.eventId];
  let best = null;
  d.choices.forEach((c, i) => {
    if (c.available === false) return;
    const v = scorer(s, d, ev.choices[i].effects, i);
    if (!best || v > best.v) best = { i, v };
  });
  return best?.i ?? 0;
}

// Rough value of an effects object for a careful player.
function sensibleValue(s, fx, depth = 0) {
  if (!fx || depth > 3) return 0;
  let v = 0;
  v += (fx.cash ?? 0) / Math.max(20000, s.cash * 0.15);
  // A careful player never spends money they do not have.
  if (fx.cash < 0 && s.cash + fx.cash < 0) v -= 20;
  v += (fx.brand ?? 0) * 0.8 + (fx.teamMeaning ?? 0) * 0.6 + (fx.meaning ?? 0) * 0.15 + (fx.ik ?? 0) * 0.3;
  v -= (fx.debt ?? 0) * 0.3;
  v += (fx.customersPct ?? 0) * 0.3 + (fx.hype ?? 0) * 0.05;
  if (fx.resign) v -= 6;
  if (fx.assign?.type === 'mentor') v += 3;
  if (fx.assign?.type === 'hardProblem') v += s.staff.length >= 6 ? 3 : -3;
  if (fx.setAutomation || fx.automationBump > 0) v -= 3;
  if (fx.automationBump < 0) v += 1;
  if (fx.salaryPct) v -= fx.salaryPct * 0.05;
  if (fx.teamSalaryPct) v -= fx.teamSalaryPct * 0.1;
  if (fx.consultants) v += 5;
  if (fx.clearOutage) v += 4;
  if (fx.pivot) v -= 2;
  if (fx.cond) v += 0.5 * (sensibleValue(s, fx.cond.then, depth + 1) + sensibleValue(s, fx.cond.else, depth + 1));
  if (fx.gamble) v += fx.gamble.p * sensibleValue(s, fx.gamble.effects, depth + 1) + (1 - fx.gamble.p) * sensibleValue(s, fx.gamble.else, depth + 1);
  for (const l of fx.later ?? []) v += 0.8 * sensibleValue(s, l.effects, depth + 1);
  for (const m of [fx.modifier].flat().filter(Boolean)) {
    const good = ['output', 'meaningRecovery', 'hype', 'brandPerWeek', 'acquisition', 'xp', 'oversight'].includes(m.key);
    v += (good ? 1 : -1) * Math.abs(m.value) * Math.min(m.weeks, 26) * 0.15;
  }
  if (fx.win === 'acquired') v -= 100;
  return v;
}

function balancedChooser(s, d, fx) {
  if (d.eventId === 'acquisition_offer') {
    const { yearIndex } = dateOf(s.week);
    const hist = s.history;
    const flat = hist.length > 26 && totalMrr(s) <= hist[hist.length - 27].mrr * 1.05;
    return fx.win ? (yearIndex >= 6 || (yearIndex >= 4 && flat) ? 100 : -100) : 0;
  }
  if (d.eventId === 'bridge_loan') return fx.later ? 10 : fx.modifier ? 2 : 0;
  if (d.eventId === 'work_policy') {
    // Juniors learn in the office; a mid-size team splits the difference; a small, tight team saves the rent.
    const want = s.staff.some((p) => p.seniority === 'junior') ? 'office' : s.staff.length >= 6 ? 'hybrid' : 'remote';
    return fx.workPolicy === want ? 10 : 0;
  }
  if (d.eventId === 'outage_unfixable') return fx.consultants ? 10 : fx.clearOutage || fx.later ? 8 : 0;
  return sensibleValue(s, fx);
}

// Cheapest choice: the one that spends the least cash now.
const cheapestChooser = (s, d, fx) => (fx.cash ?? 0) + (fx.consultants ? -B.consultantCost : 0) - (fx.win ? 1e9 : 0) + (fx.workPolicy === 'remote' ? 1 : 0);

const firstChooser = (s, d, fx, i) => -i;

function hireBest(s, filter, rank) {
  const pool = s.candidates.filter(filter).sort(rank);
  return pool.length ? [{ type: 'hire', candidateId: pool[0].id }] : [];
}

const skillSum = (p) => sum(Object.values(p.skills));

function pairMentors(s) {
  const out = [];
  const juniors = present(s).filter((p) => p.seniority === 'junior' && !s.staff.some((m) => m.assignment.type === 'mentor' && m.assignment.targetId === p.id));
  const free = present(s).filter((p) => p.seniority === 'senior' && !p.founder && p.assignment.type !== 'mentor' && p.assignment.type !== 'project');
  for (const j of juniors) {
    const m = free.shift();
    if (m) out.push({ type: 'assign', staffId: m.id, assignment: { type: 'mentor', targetId: j.id } });
  }
  return out;
}

// How many desks a bot is willing to fit on each stage.
const STAGE_DESKS = [6, 14, 30];

// Keeps one free desk ready for the next hire, up to the stage's desk count.
function furnish(s) {
  const want = Math.min(STAGE_DESKS[s.officeStage], s.staff.length + 1);
  for (let n = deskCapacity(s); n < want; n++) {
    const spot = suggestPlacement(s, 'desk');
    if (!spot || !dispatch(s, { type: 'placeItem', itemId: 'desk', ...spot }).ok) break;
  }
}

// A simple layout heuristic: at most one piece of furniture a week, placed by suggestPlacement.
const DECOR = [['plant', 3], ['coffee_corner', 6], ['whiteboard', 6], ['bookshelf', 8]];

function decorate(s) {
  const desks = deskCapacity(s);
  if (desks < 2 || s.cash < 50000 || s.flags.botDecorFull === s.officeStage) return;
  for (const [itemId, per] of DECOR) {
    const have = s.office.placed.filter((p) => p.itemId === itemId).length;
    if (have >= Math.floor(desks / per)) continue;
    const spot = suggestPlacement(s, itemId);
    if (!spot || !dispatch(s, { type: 'placeItem', itemId, x: spot.x, y: spot.y, rot: spot.rot }).ok) s.flags.botDecorFull = s.officeStage;
    return;
  }
}

function upgradeIfRich(s, cushion, careful = false) {
  const next = OFFICE_STAGES[s.officeStage + 1];
  if (!next || s.cash < next.upgradeCost * cushion) return [];
  const rentJump = next.rent - OFFICE_STAGES[s.officeStage].rent;
  if (careful && net(s) - rentJump < 0) return [];
  if (careful && s.staff.length < STAGE_DESKS[s.officeStage]) return [];
  return [{ type: 'upgradeOffice' }];
}

function launchedThisWeek(s) {
  return liveProducts(s).filter((p) => p.launchedWeek === s.week - 1 && p.version === 1);
}

// Plays like the plan's "automate everything" player.
function automateAll(s) {
  const model = cheapestModel(s);
  const live = liveProducts(s).length > 0;
  act(s, FUNCTIONS.filter((fn) => fn === 'engineering' || live)
    .filter((fn) => s.automation[fn].level !== 1 || s.automation[fn].model !== model)
    .map((fn) => ({ type: 'setAutomation', fn, level: 1, model })));
  if (canAffordHire(s, 2600) && s.staff.length < capacity(s)) act(s, hireBest(s, (c) => c.seniority === 'senior' && c.role === 'engineer', (a, b) => skillSum(b) - skillSum(a)));
  if (!s.projects.some((j) => j.kind === 'new')) {
    const res = dispatch(s, startNew(s, 'medium', model, fixedName(s)));
    if (res.ok) act(s, assignAll(s, builders(s), res.projectId));
  }
  const pj = s.projects.find((j) => j.kind === 'new');
  if (pj) act(s, assignAll(s, builders(s).filter((p) => p.assignment.type !== 'project'), pj.id));
  for (const p of launchedThisWeek(s)) act(s, [{ type: 'runCampaign', channel: 'launch', productId: p.id }]);
  for (const p of liveProducts(s)) if (p.migrationDueWeek !== null && !s.projects.some((j) => j.productId === p.id)) act(s, [{ type: 'startProject', kind: 'migration', productId: p.id }]);
  return [];
}

// An impatient humans-only player: overhires, builds big, takes the first choice. Kept for invariant runs.
function recklessHumans(s) {
  act(s, FUNCTIONS.filter((fn) => s.automation[fn].level !== 0).map((fn) => ({ type: 'setAutomation', fn, level: 0 })));
  if (canAffordHire(s) && s.staff.length < capacity(s)) act(s, hireBest(s, () => true, (a, b) => skillSum(b) - skillSum(a)));
  act(s, pairMentors(s));
  // The impatient player crunches whenever something is in flight.
  const crunch = s.projects.length > 0;
  if (!!s.policies.crunch !== crunch) dispatch(s, { type: 'setPolicy', id: 'crunch', on: crunch });
  if (!s.projects.some((j) => j.kind === 'new')) {
    const size = s.officeStage >= 1 ? 'large' : 'medium';
    const res = dispatch(s, startNew(s, size, 'chatgbt', fixedName(s)));
    if (!res.ok) dispatch(s, startNew(s, 'small', 'chatgbt', fixedName(s)));
  }
  const pj = s.projects.find((j) => j.kind === 'new');
  if (pj) act(s, assignAll(s, builders(s).filter((p) => p.assignment.type === 'idle' || p.assignment.type === 'maintenance' && builders(s).filter((q) => q.assignment.type === 'maintenance').length > 1), pj.id));
  for (const p of launchedThisWeek(s)) act(s, [{ type: 'runCampaign', channel: 'content', productId: p.id }]);
  for (const p of liveProducts(s)) if (p.migrationDueWeek !== null && !s.projects.some((j) => j.productId === p.id)) act(s, [{ type: 'startProject', kind: 'migration', productId: p.id }]);
  // Even the reckless wait for a first launch before moving out of the garage.
  if (s.stats.launches > 0) act(s, upgradeIfRich(s, 1.5));
  if (s.outage?.unrecoverable && s.cash > B.consultantCost * 2) act(s, [{ type: 'callConsultants' }]);
  return [];
}

function careTeam(s) {
  for (const p of present(s)) {
    if (p.pathPending) {
      const pick = { engineer: 'architect', designer: 'ux_lead', marketer: 'growth_lead', support: 'support_lead', security: 'red_team_lead', sales: 'enterprise_ae' }[p.role];
      dispatch(s, { type: 'choosePath', staffId: p.id, pathId: pick });
    }
    if ((p.strain ?? 0) >= B.botTimeOffStrain && p.mood !== 'away') dispatch(s, { type: 'timeOff', staffId: p.id });
    else if (p.mood === 'burnout' && s.policies.sabbatical) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'sabbatical', targetId: null } });
    else if (p.mood === 'coasting' && p.seniority === 'senior' && s.staff.length >= 6 && p.assignment.type !== 'project' && p.assignment.type !== 'mentor') {
      dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'hardProblem', targetId: null } });
    } else if (p.assignment.type === 'hardProblem' && p.meaning > 60) {
      // A hard problem is a break for someone coasting; once they have recovered they go back to their job.
      dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: ROLES[p.role].defaultAssignment, targetId: null } });
    }
  }
}

const crewOf = (s, j) => s.staff.filter((p) => p.assignment.type === 'project' && p.assignment.targetId === j.id);
// Engineering automation works on new products, updates, and migrations even with nobody assigned.
const AUTOMATED_KINDS = new Set(['new', 'update', 'migration']);
let humansOnly = false;
const stalled = (s, j) => !crewOf(s, j).length && !(!humansOnly && s.automation.engineering.level > 0 && AUTOMATED_KINDS.has(j.kind));

// Starts updates only when no stalled project is already waiting, and cancels optional projects that have
// sat stalled (nobody on them and no automation) for botCancelUnstaffedWeeks.
function maintainProducts(s) {
  for (const j of [...s.projects]) {
    if (['update', 'craft', 'refactor'].includes(j.kind) && stalled(s, j) && s.week - j.startedWeek >= B.botCancelUnstaffedWeeks) {
      dispatch(s, { type: 'cancelProject', projectId: j.id });
    }
  }
  // An optional project starts only if automation will work on it or someone is free to take it.
  const waiting = () => s.projects.some((j) => stalled(s, j));
  const free = () => builders(s).some((p) => p.assignment.type === 'idle');
  const automated = !humansOnly && s.automation.engineering.level > 0;
  for (const p of liveProducts(s)) {
    const busy = s.projects.some((j) => j.productId === p.id);
    if (p.migrationDueWeek !== null && !busy) dispatch(s, { type: 'startProject', kind: 'migration', productId: p.id });
    else if (p.novelty < 3 && !busy && s.cash > 50000 && !waiting() && (automated || free())) dispatch(s, { type: 'startProject', kind: 'update', productId: p.id });
  }
  if (s.comprehensionDebt > 40 && !s.projects.some((j) => j.kind === 'refactor') && !waiting() && free()) dispatch(s, { type: 'startProject', kind: 'refactor' });
}

// Staffs every project: the first new project gets the most people; maintenance keeps one engineer.
function staffProjects(s) {
  const projects = [...s.projects].sort((a, b) => (a.kind === 'new' ? -1 : 1) - (b.kind === 'new' ? -1 : 1));
  if (!projects.length) return;
  const free = builders(s).filter((p) => ['idle', 'maintenance'].includes(p.assignment.type) || (p.assignment.type === 'project' && !s.projects.some((j) => j.id === p.assignment.targetId)));
  // Keep enough engineers on maintenance that products stay healthy; pull one more off projects when short.
  const maint = builders(s).filter((p) => p.assignment.type === 'maintenance' && p.role === 'engineer');
  if (liveProducts(s).length && s.ops.maintenanceShortfall > 0.15) {
    const pull = builders(s).find((p) => p.role === 'engineer' && p.assignment.type === 'project' && !p.founder);
    if (pull) dispatch(s, { type: 'assign', staffId: pull.id, assignment: { type: 'maintenance', targetId: null } });
  }
  const keep = s.ops.maintenanceShortfall > 0.05 ? maint.length : Math.max(liveProducts(s).length ? 1 : 0, maint.length - 1);
  const spare = free.filter((p) => p.assignment.type !== 'maintenance' || maint.indexOf(p) >= keep);
  let i = 0;
  for (const p of spare) {
    // A project nobody is on comes first; otherwise spread people round the list.
    const j = projects.find((x) => stalled(s, x)) ?? projects[i % projects.length];
    dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: j.id } });
    i++;
  }
  // A migration cannot wait: it borrows someone from whichever project has the biggest crew.
  for (const j of s.projects.filter((x) => x.kind === 'migration')) {
    if (crewOf(s, j).length) continue;
    const donor = s.projects.map((x) => crewOf(s, x)).filter((c) => c.length > 1).sort((a, b) => b.length - a.length)[0];
    const p = donor?.find((x) => !x.founder) ?? donor?.[0];
    if (p) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: j.id } });
  }
}

// Plays like the plan's "balanced" player: moderate automation, mentoring, oversight, and care.
function balanced(s) {
  const rich = s.cash > 300000;
  const model = rich ? bestModel(s, ['claudius', 'chatgbt']) : 'chatgbt';
  const target = { engineering: 0.5, support: 0.5, sales: 0.25, marketing: 0.25, qa: 0.25, ops: 0.25 };
  const hasProduct = liveProducts(s).length > 0;
  const affordAuto = hasProduct && (net(s) > 3000 || s.cash > 250000);
  for (const fn of FUNCTIONS) {
    const level = fn === 'engineering' || affordAuto ? target[fn] : 0;
    if (s.automation[fn].level !== level || s.automation[fn].model !== model) dispatch(s, { type: 'setAutomation', fn, level, model });
  }
  const standup = s.flags.botStandup ?? 'daily_standups';
  if (!s.policies[standup]) dispatch(s, { type: 'setPolicy', id: standup, on: true });
  for (const id of ['pair', 'comprehension_reviews', 'apprenticeship', 'sabbatical']) {
    if (!s.policies[id] && POLICIES[id].unlock(s) && (POLICIES[id].weeklyCost === 0 || weeksOfBurn(s) > 30)) dispatch(s, { type: 'setPolicy', id, on: true });
  }

  const overseersNeeded = Math.ceil(oversightRequired(s) / 20);
  const overseers = present(s).filter((p) => p.assignment.type === 'oversight');
  const spareForOversight = present(s).filter((p) => !p.founder && ['maintenance', 'idle', 'support', 'sales'].includes(p.assignment.type) && p.role !== 'support');
  for (let i = overseers.length; i < overseersNeeded && spareForOversight.length; i++) {
    const p = spareForOversight.shift();
    dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'oversight', targetId: null } });
  }

  if (s.staff.length < capacity(s) && canAffordHire(s)) {
    const seniors = s.staff.filter((p) => p.seniority === 'senior').length;
    const juniors = s.staff.filter((p) => p.seniority === 'junior').length;
    const needSecurity = s.officeStage >= 1 && !s.staff.some((p) => p.role === 'security');
    const needOverseer = overseersNeeded > overseers.length && !spareForOversight.length;
    const filter = needSecurity ? (c) => c.role === 'security'
      : needOverseer ? (c) => c.role === 'engineer' && c.seniority !== 'junior'
        : juniors < seniors ? (c) => c.seniority === 'junior'
          : (c) => c.role === 'engineer' || c.role === 'designer' || (hasProduct && (c.role === 'marketer' || c.role === 'support'));
    act(s, hireBest(s, filter, (a, b) => skillSum(b) - skillSum(a)));
  }
  act(s, pairMentors(s));
  careTeam(s);

  // A bigger team runs more than one new product at a time.
  const parallel = Math.max(1, Math.floor(builders(s).length / B.botBuildersPerProject));
  if (s.projects.filter((j) => j.kind === 'new').length < parallel && s.cash > 15000) {
    const size = s.officeStage >= 1 && s.cash > 200000 ? 'large' : s.cash > 60000 && builders(s).length >= 3 ? 'medium' : 'small';
    dispatch(s, startNew(s, size, model, fixedName(s)));
  }
  maintainProducts(s);
  staffProjects(s);

  for (const p of launchedThisWeek(s)) {
    dispatch(s, { type: 'runCampaign', channel: 'launch', productId: p.id });
    if (s.cash > 20000) dispatch(s, { type: 'runCampaign', channel: 'content', productId: p.id });
  }
  const marketers = present(s).filter((p) => p.role === 'marketer');
  for (const m of marketers) if (m.assignment.type !== 'marketing') dispatch(s, { type: 'assign', staffId: m.id, assignment: { type: 'marketing', targetId: null } });

  if (s.outage?.unrecoverable && s.cash > B.consultantCost * 1.5) dispatch(s, { type: 'callConsultants' });
  // Brand is slow; keep a brand-building campaign going once the company can afford it.
  const newest = liveProducts(s).at(-1);
  if (newest && s.cash > 20000 && !s.campaigns.some((c) => ['community', 'conference', 'enterprise'].includes(c.channel))) {
    const channel = s.officeStage >= 1 && s.cash > 300000 ? 'conference' : 'community';
    dispatch(s, { type: 'runCampaign', channel, productId: newest.id });
  }
  if (s.officeStage >= 1 && !s.security.tooling && net(s) > 2000) dispatch(s, { type: 'setTooling', on: true });
  if (s.security.auditBoost < 2 && s.cash > 500000) dispatch(s, { type: 'buyAudit' });
  act(s, upgradeIfRich(s, 1.5, true));
  dispatch(s, { type: 'ipo' });
  return [];
}

// The balanced player's careful play with every automation dial at 0.
function allHumans(s) {
  humansOnly = true;
  const out = balanced(s);
  humansOnly = false;
  for (const fn of FUNCTIONS) if (s.automation[fn].level !== 0) dispatch(s, { type: 'setAutomation', fn, level: 0 });
  return out;
}

// A careful new player: one early hire, small products on good combos, light automation, sensible choices.
function sensible(s) {
  s.flags.botStandup = 'async_standups';
  if (!s.policies.async_standups) dispatch(s, { type: 'setPolicy', id: 'async_standups', on: true });
  if (s.week <= 2 && s.stats.hires < (s.flags.botEarlyHires ?? 1)) act(s, hireBest(s, (c) => c.role === 'engineer' && c.seniority !== 'senior', (a, b) => skillSum(b) - skillSum(a)));
  if (s.week < 52) {
    if (!s.projects.some((j) => j.kind === 'new') && s.cash > 5000) dispatch(s, startNew(s, 'small', 'chatgbt', fixedName(s)));
    const pj = s.projects.find((j) => j.kind === 'new');
    if (pj) act(s, assignAll(s, builders(s).filter((p) => p.assignment.type !== 'project' && (p.assignment.type !== 'maintenance' || !liveProducts(s).length || builders(s).filter((q) => q.assignment.type === 'maintenance').length > 1)), pj.id));
    for (const p of launchedThisWeek(s)) dispatch(s, { type: 'runCampaign', channel: 'launch', productId: p.id });
    maintainProducts(s);
    staffProjects(s);
    careTeam(s);
    if (s.outage?.unrecoverable && s.cash > B.consultantCost * 1.5) dispatch(s, { type: 'callConsultants' });
    return [];
  }
  return balanced(s);
}

export const BOTS = { automateAll, allHumans, balanced, sensible, recklessHumans };

export const CHOOSERS = { automateAll: cheapestChooser, allHumans: balancedChooser, balanced: balancedChooser, sensible: balancedChooser, recklessHumans: firstChooser };

// Resolves pending decisions the way the named bot would. Returns how many bridge loans it took.
// onEvents(events, action) receives the events of every dispatch.
export function botDecide(name, s, { onEvents = null } = {}) {
  const prev = sink;
  sink = onEvents;
  let bridges = 0;
  try {
    for (let guard = 0; s.pendingDecision && guard < 5; guard++) {
      const pickIdx = pickDecision(s, CHOOSERS[name]);
      if (s.pendingDecision.eventId === 'bridge_loan' && pickIdx === 0) bridges++;
      const res = dispatch(s, { type: 'resolveDecision', choice: pickIdx });
      if (!res.ok) for (let c = 0; c < 4 && s.pendingDecision; c++) dispatch(s, { type: 'resolveDecision', choice: c });
    }
  } finally {
    sink = prev;
  }
  return bridges;
}

// One week of the named bot's play before tick: furnishing, then every action it takes.
// onEvents(events, action) receives the events of every dispatch, including the bot's internal ones.
export function botTurn(name, s, { onEvents = null } = {}) {
  const prev = sink;
  sink = onEvents;
  try {
    furnish(s);
    if (name !== 'recklessHumans') decorate(s);
    for (const a of BOTS[name](s)) dispatch(s, a);
  } finally {
    sink = prev;
  }
}

// Plays one full run headless (by default 20 years). Returns the outcome plus a few numbers for the balance
// table; eras holds { week, cash, staff, mrr } at each era's arrival, stageWeeks the week each office
// stage was reached; exited is true for a retirement (IPO or acquisition).
// onWeek(state, tickEvents) after each tick; onEvents(events, action) for every dispatch; setup(state) once at the start;
// founding: { founders, funding } passed to createGame.
export function runBot(name, seed, maxWeeks = B.runWeeks, { onWeek, onEvents = null, setup, founding = {} } = {}) {
  const s = createGame({ seed, companyName: `Bot ${name}`, ...founding });
  setup?.(s);
  let maxStage = 0;
  let firstLaunch = null;
  let crises = 0;
  let wasUnrecoverable = false;
  const eras = {};
  const stageWeeks = { 0: 0 };
  while (!s.gameOver && s.week < maxWeeks) {
    crises += botDecide(name, s, { onEvents });
    if (s.gameOver) break;
    botTurn(name, s, { onEvents });
    const era = s.era.id;
    const events = tick(s);
    if (s.era.id !== era) eras[s.era.id] = { week: s.week, cash: s.cash, staff: s.staff.length, mrr: totalMrr(s) };
    if (stageWeeks[s.officeStage] === undefined) stageWeeks[s.officeStage] = s.week;
    maxStage = Math.max(maxStage, s.officeStage);
    const unrecoverable = !!s.outage?.unrecoverable;
    if (unrecoverable && !wasUnrecoverable) crises++;
    wasUnrecoverable = unrecoverable;
    if (firstLaunch === null && s.stats.launches > 0) firstLaunch = s.week;
    onWeek?.(s, events);
  }
  return {
    won: !!s.gameOver?.won, exited: s.gameOver?.reason === 'retired', reason: s.gameOver?.reason ?? 'unfinished', weeks: s.week,
    peakMrr: s.stats.peakMrr, score: s.gameOver?.score ?? scoreRun(s).score, maxStage, firstLaunch, state: s,
    resignations: s.stats.resignations, incidents: s.stats.incidents, crises, eras, stageWeeks,
    lostAfterAgents: !s.gameOver?.won && !!s.gameOver && s.week >= s.eraSchedule.agents,
  };
}
