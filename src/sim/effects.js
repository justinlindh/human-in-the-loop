import { B } from './balance.js';
import { chance, pick } from './rng.js';
import { clamp, newId, dateOf } from './util.js';
import { sunsetProduct } from './products.js';
import { findStaff, tryAssign, removeStaff, makeCandidate, staffMods, endMentorshipsOf } from './staff.js';
import { liveProducts, findProduct } from './projects.js';
import { priceHike } from './vendors.js';
import { endGame } from './endgame.js';
import { FUNCTIONS } from './state.js';
import { comboFit } from '../data/combos.js';
import { TRENDS } from '../data/trends.js';
import { MODELS } from '../data/models.js';
import { incumbentFor } from '../data/incumbents.js';
import { EVENTS } from '../data/events.js';
import { MODIFIER_KEYS } from '../data/modifiers.js';
import { raiseDecision } from './events.js';
import { clearOutage } from './incidents.js';
import { buyItemBlocker, upgradeItemBlocker, ownedCopy, buyItemNow, upgradeItemNow } from './progression.js';

export { modifierBonus } from './modifiers.js';

const newestLive = (state) => liveProducts(state).at(-1) ?? null;

export function freeMentor(state, junior) {
  const pool = state.staff.filter((p) => p.id !== junior.id && p.mood !== 'away' && p.seniority !== 'junior'
    && p.assignment.type !== 'mentor' && p.assignment.type !== 'sabbatical');
  if (!pool.length) return null;
  return pool.reduce((a, b) => {
    const score = (p) => (p.seniority === 'senior' ? 10 : 0) + staffMods(p).mentorBonus;
    return score(b) > score(a) ? b : a;
  });
}

// Named conditions used by `cond` effects and by a choice's `requires`.
export function checkCondition(state, id, subjectId) {
  const product = findProduct(state, subjectId);
  const person = findStaff(state, subjectId);
  switch (id) {
    case 'subjectCompliant': {
      const pool = product ? [product] : liveProducts(state);
      return pool.some((p) => MODELS[p.model].complianceOk);
    }
    case 'trustedVendor': return ['claudius', 'chatgbt'].includes(state.flags.lastIncidentModel);
    case 'blameless': return !!state.policies.blameless;
    case 'ik40': return state.institutionalKnowledge >= 40;
    case 'bestScore7': return liveProducts(state).some((p) => p.score >= 7);
    case 'sabbaticalPolicy': return !!state.policies.sabbatical;
    case 'stage1': return state.officeStage >= 1;
    case 'affordConsultants': return state.cash >= B.consultantCost;
    case 'noCraftRunning': return !state.projects.some((j) => j.kind === 'craft');
    case 'canBuyEspresso': return !buyItemBlocker(state, 'espresso');
    case 'canUpgradeEspresso': return !upgradeItemBlocker(state, ownedCopy(state, 'espresso'));
    case 'mentorAvailable': return !!person && person.seniority === 'junior' && !!freeMentor(state, person)
      && !state.staff.some((m) => m.assignment.type === 'mentor' && m.assignment.targetId === person.id);
    default: return false;
  }
}

// The reason shown when a choice's requirement is unmet; item requirements say exactly why.
export function requireReason(state, id) {
  if (id === 'canBuyEspresso') return buyItemBlocker(state, 'espresso') ?? 'Not possible right now';
  if (id === 'canUpgradeEspresso') {
    const r = upgradeItemBlocker(state, ownedCopy(state, 'espresso'));
    return r === 'Already max level' ? 'Already the fanciest one' : r ?? 'Not possible right now';
  }
  return REQUIRE_REASON[id] ?? 'Not possible right now';
}

export const REQUIRE_REASON = {
  sabbaticalPolicy: 'Needs the Sabbatical Program', stage1: 'Needs the Office Floor', mentorAvailable: 'No mentor is free',
  subjectCompliant: 'Needs a compliance-friendly model', trustedVendor: 'Needs a trusted model vendor', blameless: 'Needs Blameless Postmortems',
  ik40: 'Needs more institutional knowledge', bestScore7: 'Needs a product scoring 7+', affordConsultants: 'Not enough cash', noCraftRunning: 'A craft project is already running',
};

function sendAway(state, p, weeks) {
  p.mood = 'away';
  p.assignment = { type: 'sabbatical', targetId: null };
  p.sabbaticalWeeksLeft = weeks;
  endMentorshipsOf(state, p);
}

function pivot(ctx) {
  const { state } = ctx;
  const live = liveProducts(state);
  if (live.length < 2) return;
  const weakest = live.reduce((a, b) => (b.score * (b.mrr + 1) < a.score * (a.mrr + 1) ? b : a));
  const cancelled = sunsetProduct(ctx, weakest, { quiet: true });
  const t = TRENDS[state.market.trend];
  let best = null;
  for (const c of state.market.unlockedCategories) {
    for (const a of state.market.unlockedAngles) {
      const f = comboFit(c, a) * (t.angleMods[a] ?? 1) * (t.categoryMods[c] ?? 1);
      if (!best || f > best.f) best = { c, a, f };
    }
  }
  const model = Object.keys(state.models).find((m) => state.models[m].available && !state.models[m].deprecated) ?? weakest.model;
  state.projects.push({
    id: newId(state, 'j'), kind: 'new', name: `${weakest.name} 2`, category: best.c, angle: best.a, model, size: 'medium', researchId: null,
    pointsNeeded: B.sizes.medium.points * (1 + B.pointsGrowthPerYear * dateOf(state.week).yearIndex), progress: 0, stats: { features: 0, polish: 0, reliability: 0, novelty: 0 },
    productId: null, startedWeek: state.week, bankedHype: 0,
  });
  const dropped = cancelled.length ? ` Cancelled: ${cancelled.map((j) => j.name).join(', ')}.` : '';
  ctx.emit({ type: 'toast', text: `${weakest.name} is sunset.${dropped} The new plan: ${weakest.name} 2.`, tone: 'info' });
}

// Applies an effects object from event data. subjectId may name a staff member or a product.
export function applyEffects(ctx, fx, subjectId = null, source = null, vars = null) {
  const { state } = ctx;
  if (!fx) return;
  const person = findStaff(state, subjectId);
  const subjectProduct = findProduct(state, subjectId);
  const product = subjectProduct && !subjectProduct.killed ? subjectProduct : newestLive(state);

  if (fx.cash) state.cash += fx.cash;
  if (fx.brand) state.brand = clamp(state.brand + fx.brand, 0, 100);
  if (fx.debt) state.comprehensionDebt = clamp(state.comprehensionDebt + fx.debt, 0, 100);
  if (fx.ik) state.institutionalKnowledge = clamp(state.institutionalKnowledge + fx.ik, 0, 100);
  if (fx.hype && product) product.hype = clamp(product.hype + fx.hype, 0, 100);
  if (fx.customersPct && product) {
    product.customers = Math.max(0, Math.floor(product.customers * (1 + fx.customersPct / 100)));
  }
  if (fx.health && product) product.health = clamp(product.health + fx.health, 0, 100);
  if (fx.teamMeaning) for (const p of state.staff) p.meaning = clamp(p.meaning + fx.teamMeaning, 0, 100);
  if (fx.teamSalaryPct) for (const p of state.staff) p.salary = Math.round((p.salary * (1 + fx.teamSalaryPct / 100)) / 10) * 10;
  if (person) {
    if (fx.meaning) person.meaning = clamp(person.meaning + fx.meaning, 0, 100);
    if (fx.knowledge) person.knowledge = clamp(person.knowledge + fx.knowledge, 0, 100);
    if (fx.salaryPct) person.salary = Math.round((person.salary * (1 + fx.salaryPct / 100)) / 10) * 10;
    if (fx.awayWeeks && person.mood !== 'away') sendAway(state, person, fx.awayWeeks);
    if (fx.assign) {
      if (fx.assign.type === 'mentor') {
        const m = person.seniority === 'junior' ? freeMentor(state, person) : null;
        if (m) m.assignment = { type: 'mentor', targetId: person.id };
      } else {
        tryAssign(state, person, { type: fx.assign.type, targetId: null });
      }
    }
  }
  if (fx.candidates) {
    const seniority = fx.candidates === 'seniorBatch' ? 'senior' : 'junior';
    for (let i = 0; i < 3; i++) state.candidates.push(makeCandidate(state, pick(ctx.rng, ['engineer', 'engineer', 'designer', 'support', 'security', 'marketer']), seniority));
    state.candidates = state.candidates.slice(-8);
  }
  if (fx.flag) state.flags[fx.flag.name] = fx.flag.value;
  if (fx.gpuShortageWeeks) state.flags.gpuShortageWeeks = fx.gpuShortageWeeks;
  if (fx.clones) {
    const cat = product?.category ?? pick(ctx.rng, state.market.unlockedCategories);
    state.market.categories[cat].clones += fx.clones;
  }
  if (fx.priceHike) {
    const used = [...new Set(liveProducts(state).map((p) => p.model))];
    priceHike(ctx, used.length ? pick(ctx.rng, used) : null);
  }
  if (fx.vendorOutage) {
    const used = [...new Set(liveProducts(state).map((p) => p.model))];
    if (used.length) {
      const m = pick(ctx.rng, used);
      for (const p of liveProducts(state)) if (p.model === m) p.health = clamp(p.health - fx.vendorOutage, 0, 100);
      ctx.emit({ type: 'toast', text: `${MODELS[m].name} is having a bad day. So are its customers.`, tone: 'warn' });
    }
  }
  if (fx.migrateOff) {
    const target = ['chatgbt', 'claudius', 'gemenai'].find((m) => state.models[m].available && !state.models[m].deprecated) ?? 'chatgbt';
    for (const p of liveProducts(state)) {
      if (p.model !== fx.migrateOff) continue;
      p.migrationDueWeek = p.migrationDueWeek ?? state.week + B.migrationDeadlineWeeks;
      state.flags[`migrateTo_${p.id}`] = target;
    }
    for (const fn of FUNCTIONS) if (state.automation[fn].model === fx.migrateOff) state.automation[fn].model = target;
  }
  if (fx.modelBoost) {
    const m = state.models[fx.modelBoost.model];
    if (m) m.capability = Math.min(100, m.capability + fx.modelBoost.capability);
  }
  if (fx.setAutomation) for (const [fn, level] of Object.entries(fx.setAutomation)) state.automation[fn].level = level;
  if (fx.automationBump) {
    for (const fn of FUNCTIONS) state.automation[fn].level = clamp(state.automation[fn].level + fx.automationBump, 0, 1);
  }
  if (fx.startCraft && !state.projects.some((j) => j.kind === 'craft')) {
    const id = newId(state, 'j');
    state.projects.push({
      id, kind: 'craft', name: 'Craft project', category: null, angle: null, model: null, size: 'small', researchId: null,
      pointsNeeded: B.craftPoints, progress: 0, stats: { features: 0, polish: 0, reliability: 0, novelty: 0 },
      productId: null, startedWeek: state.week, bankedHype: 0,
    });
  }
  if (fx.pivot) pivot(ctx);
  if (fx.buyItem && !buyItemBlocker(state, fx.buyItem)) buyItemNow(ctx, fx.buyItem);
  if (fx.upgradeItem) {
    const owned = ownedCopy(state, fx.upgradeItem);
    if (!upgradeItemBlocker(state, owned)) upgradeItemNow(ctx, owned);
  }
  if (fx.consultants && state.outage) {
    state.cash -= B.consultantCost;
    clearOutage(ctx, ' thanks to very expensive consultants');
  }
  if (fx.clearOutage && state.outage && (!subjectProduct || state.outage.productId === subjectProduct.id)) clearOutage(ctx, ' thanks to the contractor');
  for (const m of [fx.modifier].flat().filter((x) => x && MODIFIER_KEYS[x.key])) {
    state.modifiers.push({ id: newId(state, 'mod'), key: m.key, value: m.value, label: m.label, untilWeek: state.week + m.weeks, source });
  }
  for (const l of fx.later ?? []) {
    state.scheduled.push({ id: newId(state, 'sch'), week: state.week + l.inWeeks, kind: 'effects', payload: { effects: l.effects, subjectId, source } });
  }
  if (fx.followUp) {
    state.scheduled.push({ id: newId(state, 'sch'), week: state.week + fx.followUp.inWeeks, kind: 'event', payload: { eventId: fx.followUp.eventId, subjectId } });
  }
  if (fx.cond) applyEffects(ctx, checkCondition(state, fx.cond.test, subjectId) ? fx.cond.then : fx.cond.else, subjectId, source, vars);
  if (fx.gamble) applyEffects(ctx, chance(ctx.rng, fx.gamble.p) ? fx.gamble.effects : fx.gamble.else, subjectId, source, vars);
  if (fx.resign && person && !person.founder) {
    removeStaff(state, person);
    state.stats.resignations++;
    ctx.emit({ type: 'resign', staffId: person.id, name: person.name });
  }
  if (fx.win === 'acquired') {
    const top = liveProducts(state).reduce((a, b) => (!a || b.mrr > a.mrr ? b : a), null);
    state.flags.acquirer = vars?.incumbent ?? incumbentFor(top?.category ?? 'crm').name;
    endGame(ctx, { won: true, reason: 'acquired' });
  }
}

// Weekly: applies due scheduled consequences, raises due follow-up events, and drops expired modifiers.
export function processScheduled(ctx) {
  const { state } = ctx;
  const due = state.scheduled.filter((x) => x.week <= state.week);
  for (const x of due) {
    if (x.kind === 'effects') {
      state.scheduled = state.scheduled.filter((y) => y !== x);
      applyEffects(ctx, x.payload.effects, x.payload.subjectId, x.payload.source);
    } else if (x.kind === 'event' && !state.pendingDecision && EVENTS[x.payload.eventId]) {
      state.scheduled = state.scheduled.filter((y) => y !== x);
      raiseDecision(ctx, x.payload.eventId, x.payload.subjectId, { queue: true });
    }
  }
  const expired = state.modifiers.filter((m) => m.untilWeek <= state.week);
  if (expired.length) {
    state.modifiers = state.modifiers.filter((m) => m.untilWeek > state.week);
    for (const label of new Set(expired.map((m) => m.label))) ctx.emit({ type: 'toast', text: `${label} has ended.`, tone: 'info' });
  }
}

