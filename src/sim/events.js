import { B } from './balance.js';
import { chance, pick, weighted } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { newId } from './util.js';
import { mentorOf } from './staff.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { agentSpend, rivalMergePrice, moonshotWeekly } from './economy.js';
import { MOONSHOT_NAMES } from '../data/forsale.js';
import { featuredDeal } from './acquire.js';
import { automationExposure } from './automation.js';
import { applyEffects, checkCondition, requireReason } from './effects.js';
import { EVENTS } from '../data/events.js';
import { incumbentFor } from '../data/incumbents.js';
import { emitChat } from './chat.js';
import { eraOnlyAllowsText, eraAtLeast, currentEra, eraIndex } from './eras.js';

// What attackers ask for: sized to the company's cash and revenue, between a floor and a cap, and never
// more than a share of the cash in hand, so paying hurts without ending a careful company.
// What a side-room talk ('small') or a main-stage turn ('big') at the AI Summit costs in this era.
export function summitCost(state, size) {
  return Math.round(B.summitCost[size] * B.summitEraMult[eraIndex(state)]);
}

const money = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `$${Math.round(n / 1000)}k`);

export function ransomFor(state) {
  const ask = B.ransomCashShare * Math.max(0, state.cash) + B.ransomMrrMonths * totalMrr(state);
  const affordable = Math.max(B.ransomFloor, B.ransomMaxCashShare * Math.max(0, state.cash));
  return Math.round(Math.min(B.ransomCap, affordable, Math.max(B.ransomFloor, ask)) / 1000) * 1000;
}

// Placeholder values chosen once per event, so every string in a decision names the same incumbent.
export function decisionVars(state, rng, subjectId) {
  const product = state.products.find((p) => p.id === subjectId);
  const top = liveProducts(state).reduce((a, b) => (!a || b.mrr > a.mrr ? b : a), null);
  const category = product?.category ?? top?.category ?? pick(rng, state.market.unlockedCategories);
  const collapseWeeks = Math.max(0, B.outageCollapseWeeks - (state.outage?.weeks ?? 0));
  return { incumbent: incumbentFor(category).name, collapseWeeks, rival: state.rival?.name ?? 'A rival', rivalFounder: state.rival?.founderName ?? 'Their founder', ransom: ransomFor(state),
    alum: state.flags.alumni?.at(-1)?.name.split(' ')[0] ?? 'A former colleague',
    deal: featuredDeal(state)?.name ?? 'A small company' };
}

// Resolves the text placeholders for an event against a subject (staff or product id).
export function fillText(state, rng, text, subjectId, vars = null) {
  const person = state.staff.find((p) => p.id === subjectId);
  const product = state.products.find((p) => p.id === subjectId);
  const v = vars ?? decisionVars(state, rng, subjectId);
  return text
    .replaceAll('{name}', person?.name ?? 'Someone')
    .replaceAll('{product}', product?.name ?? liveProducts(state).at(-1)?.name ?? 'production')
    .replaceAll('{company}', state.companyName)
    .replaceAll('{incumbent}', v.incumbent)
    .replaceAll('{collapseWeeks}', String(v.collapseWeeks ?? B.outageCollapseWeeks))
    .replaceAll('{rivalFounder}', v.rivalFounder ?? 'Their founder')
    .replaceAll('{rival}', v.rival ?? 'A rival')
    .replaceAll('{alum}', v.alum ?? 'A former colleague')
    .replaceAll('{deal}', v.deal ?? 'A small company')
    .replaceAll('{auditCost}', money(agentSpend(state, B.agentAuditWeeks)))
    .replaceAll('{agentBill}', money(agentSpend(state, B.agentInvoiceWeeks)))
    .replaceAll('{mergePrice}', money(rivalMergePrice(state)))
    .replaceAll('{moonshot}', state.flags.moonshot?.name ?? MOONSHOT_NAMES[state.seed % MOONSHOT_NAMES.length])
    .replaceAll('{moonshotWeekly}', money(state.flags.moonshot?.weekly ?? moonshotWeekly(state)))
    .replaceAll('{lastBetCost}', money(Math.max(0, state.cash) * B.lastBetCashShare))
    .replaceAll('{foundationCost}', money(Math.max(0, state.cash) * B.foundationCashShare))
    .replaceAll('{summitSmall}', `$${Math.round(summitCost(state, 'small') / 1000)}k`)
    .replaceAll('{summitBig}', `$${Math.round(summitCost(state, 'big') / 1000)}k`)
    .replaceAll('{ransom}', `$${Math.round(v.ransom ?? ransomFor(state)).toLocaleString('en-US')}`);
}

// Emergencies always interrupt; everything else respects the gap between decisions.
const IMMEDIATE_KINDS = new Set(['incident', 'cyber']);

// Opens a decision popup for a choice event. If one is already pending it returns false, or with
// { queue: true } schedules this one to be raised as soon as the popup is clear.
export function raiseDecision(ctx, eventId, subjectId = null, { queue = false } = {}) {
  const { state } = ctx;
  const ev = EVENTS[eventId];
  if (!ev || !ev.choices) return false;
  if (state.pendingDecision) {
    if (queue) state.scheduled.push({ id: newId(state, 'sch'), week: state.week, kind: 'event', payload: { eventId, subjectId } });
    return false;
  }
  // Decisions that are not emergencies wait for a breather after the last one.
  const spaced = !IMMEDIATE_KINDS.has(ev.kind);
  const last = state.flags.lastDecisionWeek;
  if (spaced && last !== undefined && state.week - last < B.decisionGapWeeks) {
    if (queue) state.scheduled.push({ id: newId(state, 'sch'), week: last + B.decisionGapWeeks, kind: 'event', payload: { eventId, subjectId } });
    return false;
  }
  if (spaced) state.flags.lastDecisionWeek = state.week;
  if (ev.marks) state.flags[ev.marks] = state.week;
  const vars = decisionVars(state, ctx.rng, subjectId);
  const fill = (t) => fillText(state, ctx.rng, t, subjectId, vars);
  state.pendingDecision = {
    eventId, subjectId, vars,
    title: fill(ev.title),
    text: fill(ev.text),
    choices: ev.choices.map((c) => {
      const available = !c.requires || checkCondition(state, c.requires, subjectId);
      return { label: fill(c.label), hint: fill(c.hint), available, reason: available ? null : requireReason(state, c.requires) };
    }),
  };
  ctx.emit({ type: 'decision' });
  return true;
}

const hasResign = (fx) => !!fx && (fx.resign || hasResign(fx.cond?.then) || hasResign(fx.cond?.else)
  || hasResign(fx.gamble?.effects) || hasResign(fx.gamble?.else) || (fx.later ?? []).some((l) => hasResign(l.effects)));

// Candidate subjects for an event. Events that can make someone leave never pick a founder.
export function resolveSubjects(state, ev) {
  const present = state.staff.filter((p) => p.mood !== 'away');
  const canLeave = (ev.choices ?? [{ effects: ev.auto }]).some((c) => hasResign(c.effects));
  const people = canLeave ? present.filter((p) => !p.founder) : present;
  switch (ev.subject) {
    case null: case undefined: return [];
    case 'randomStaff': return people;
    case 'seniorStaff': return people.filter((p) => p.seniority === 'senior');
    case 'juniorStaff': return people.filter((p) => p.seniority === 'junior');
    case 'unmentoredJunior': return people.filter((p) => p.seniority === 'junior' && !mentorOf(state, p));
    case 'burnoutStaff': return people.filter((p) => p.mood === 'burnout');
    case 'coastingStaff': return people.filter((p) => p.mood === 'coasting');
    case 'workingStaff': return people.filter((p) => !p.founder && p.assignment.type !== 'idle');
    case 'automatedSenior': return people.filter((p) => p.seniority === 'senior' && automationExposure(state, p) >= 0.5);
    case 'mentorStaff': return people.filter((p) => p.assignment.type === 'mentor');
    case 'founder': return people.filter((p) => p.founder);
    case 'randomProduct': return liveProducts(state);
    default: return [];
  }
}

export function helpers(state) {
  const live = liveProducts(state);
  const used = new Set([...live.map((p) => p.model).filter(Boolean), ...Object.values(state.automation).filter((a) => a.level > 0).map((a) => a.model)]);
  const mrr = totalMrr(state);
  const offerMult = eraAtLeast(state, 'consolidation') ? B.consolidationOfferMult : 1;
  return {
    B, mrr, live, bestScore: Math.max(0, ...live.map((p) => p.score)), usesModel: (id) => used.has(id),
    offerReady: state.week >= B.retireFromWeek && mrr >= B.acquisitionOfferMrr * offerMult && state.brand >= B.acquisitionOfferBrand * offerMult,
  };
}

// Every player-facing string an event can show, for the era text check.
const eventText = (ev) => JSON.stringify([ev.title, ev.text, ev.chat ?? '', (ev.choices ?? []).map((c) => [c.label, c.hint, c.outcome ?? ''])]);

// An event fits the era if it names the era explicitly, or names none and its text fits.
export const eventFitsEra = (state, ev) => (ev.eras ? ev.eras.includes(currentEra(state).id) : eraOnlyAllowsText(state, eventText(ev)));

export function eligibleEvents(state) {
  const h = helpers(state);
  // A new company gets a quiet start: no decisions until its first launch or a few weeks in.
  const grace = (state.stats.launches === 0 && state.week < B.eventGraceWeeks)
    || (state.flags.lastDecisionWeek !== undefined && state.week - state.flags.lastDecisionWeek < B.decisionGapWeeks);
  return Object.values(EVENTS).filter((ev) => ev.random && !(grace && ev.choices)
    && (state.flags[`cd_${ev.id}`] ?? -1) <= state.week
    && eventFitsEra(state, ev)
    && (!ev.funding || ev.funding === (state.founding?.funding ?? 'bootstrapped'))
    && ev.when(state, h)
    && (ev.subject === null || resolveSubjects(state, ev).length > 0));
}

export function fireEvent(ctx, ev, subjectId) {
  const { state } = ctx;
  state.flags[`cd_${ev.id}`] = state.week + ev.cooldownWeeks;
  if (ev.chat) emitChat(ctx, { channel: 'random', from: '@officebot', text: fillText(state, ctx.rng, ev.chat, subjectId) });
  if (ev.choices) return raiseDecision(ctx, ev.id, subjectId);
  const vars = decisionVars(state, ctx.rng, subjectId);
  ctx.emit({ type: 'toast', text: `${fillText(state, ctx.rng, ev.title, subjectId, vars)}: ${fillText(state, ctx.rng, ev.text, subjectId, vars)}`, tone: 'info' });
  applyEffects(ctx, ev.auto, subjectId, ev.id, vars);
  return true;
}

export function eventsSystem(ctx) {
  const { state } = ctx;
  if (state.pendingDecision || !chance(ctx.rng, B.randomEventChance)) return;
  const pool = eligibleEvents(state);
  if (!pool.length) return;
  const ev = weighted(ctx.rng, pool, (e) => e.weight);
  const subjects = resolveSubjects(state, ev);
  fireEvent(ctx, ev, subjects.length ? pick(ctx.rng, subjects).id : null);
}

registerSystem('events', eventsSystem, 70);

registerAction('resolveDecision', (ctx, { choice }) => {
  const { state } = ctx;
  const d = state.pendingDecision;
  if (!d) return { ok: false, reason: 'No decision pending' };
  const ev = EVENTS[d.eventId];
  if (!Number.isInteger(choice) || !ev?.choices || choice < 0 || choice >= ev.choices.length) return { ok: false, reason: 'Invalid choice' };
  const c = ev.choices[choice];
  if (c.requires && !checkCondition(state, c.requires, d.subjectId)) return { ok: false, reason: requireReason(state, c.requires) };
  state.pendingDecision = null;
  if (c.outcome) ctx.emit({ type: 'toast', text: fillText(state, ctx.rng, c.outcome, d.subjectId, d.vars), tone: 'info' });
  applyEffects(ctx, c.effects, d.subjectId, d.eventId, d.vars);
  return { ok: true };
});
