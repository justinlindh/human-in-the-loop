import { emitMomentTalk, momentTalkSystem } from './moment-talk.js';
import { B } from './balance.js';
import { exitMrr } from './endgame.js';
import { chance, pick, weighted } from './rng.js';
import { registerAction, registerSystem, decisionGateOpen } from './registry.js';
import { newId } from './util.js';
import { mentorOf, hireProblem } from './staff.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { agentSpend, rivalMergePrice, moonshotWeekly } from './economy.js';
import { MOONSHOT_NAMES } from '../data/forsale.js';
import { featuredDeal } from './acquire.js';
import { stageTile, grantBlocker, leaveProp, isIn } from './props.js';
import { placeNow, findSpot, layoutOf } from './office.js';
import { ITEMS } from '../data/items.js';
import { automationExposure } from './automation.js';
import { applyEffects, checkCondition, requireReason } from './effects.js';
import { EVENTS } from '../data/events.js';
import { incumbentFor } from '../data/incumbents.js';
import { emitChat } from './chat.js';
import { eraOnlyAllowsText, eraAtLeast, currentEra, eraIndex } from './eras.js';
import { openEventPrompt, promptSlotFree } from './prompts.js';
import { deliversAsMail, mailSlotFree, openEventMail, mailEventNotice } from './mail.js';
import { preinternetChoiceReason, batchText } from './boxed.js';
import { askQueueOn, queueDecision, queuePrompt, queueEventLetter, defaultChoiceOf } from './asks.js';
import { periodAllows, periodText } from '../data/period-content.js';

// What attackers ask for: sized to the company's cash and revenue, between a floor and a cap, and never
// more than a share of the cash in hand, so paying hurts without ending a careful company.
// What a side-room talk ('small') or a main-stage turn ('big') at the AI Summit costs in this era.
export function summitCost(state, size) {
  return Math.round(B.summitCost[size] * B.summitEraMult[Math.max(0, eraIndex(state))]);
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
  return { incumbent: incumbentFor(category, state).name, collapseWeeks, rival: state.rival?.name ?? 'A rival', rivalFounder: state.rival?.founderName ?? 'Their founder', ransom: ransomFor(state),
    alum: state.flags.alumni?.at(-1)?.name.split(' ')[0] ?? 'A former colleague',
    deal: featuredDeal(state)?.name ?? 'A small company',
    incidentWeeks: state.flags.lastIncident?.weeks ?? 0, incidentCost: { ...(state.flags.lastIncident?.cost ?? { cash: 0, brand: 0, customers: 0 }) } };
}

// Resolves the text placeholders for an event against a subject (staff or product id).
export function fillText(state, rng, text, subjectId, vars = null) {
  const person = state.staff.find((p) => p.id === subjectId) ?? state.candidates?.find((c) => c.id === subjectId);
  const product = state.products.find((p) => p.id === subjectId);
  const v = vars ?? decisionVars(state, rng, subjectId);
  return periodText(state, text)
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
    .replaceAll('{batchSmall}', () => batchText(state, subjectId, B.preinternet.batches[0]))
    .replaceAll('{batchLarge}', () => batchText(state, subjectId, B.preinternet.batches[1]))
    .replaceAll('{ransom}', `$${Math.round(v.ransom ?? ransomFor(state)).toLocaleString('en-US')}`);
}

// Why a choice cannot be picked right now (its requirement, or a grant that cannot happen), or null.
export function choiceBlocker(state, c, subjectId) {
  if (c.effects?.preinternet) {
    const reason = preinternetChoiceReason(state, c.effects.preinternet, subjectId);
    if (reason) return reason;
  }
  if (c.effects?.aiInterview === 'hire') {
    const reason = hireProblem(state, subjectId);
    if (reason) return reason;
  }
  if (c.requires && !checkCondition(state, c.requires, subjectId)) return requireReason(state, c.requires);
  return grantBlocker(state, c);
}

// The last week something paused the game: a decision, a launch or an unlock card. Decisions keep
// B.decisionGapWeeks away from it, so two pausing moments never land back to back.
export function lastPauseWeek(state) {
  const a = state.flags.lastDecisionWeek;
  const b = state.flags.lastPauseWeek;
  return a === undefined ? b : b === undefined ? a : Math.max(a, b);
}

// Emergencies always interrupt; everything else respects the gap between decisions.
const IMMEDIATE_KINDS = new Set(['incident', 'cyber']);

// Opens a decision popup for a choice event. If one is already pending it returns false, or with
// { queue: true } schedules this one to be raised as soon as the popup is clear. { asked: true } is a
// card the player opened, which skips the gap after the last decision; `vars` replaces the card's usual vars.
// quiet: this raise plays out with no card under quietEvents, as an event marked quiet does.
export function raiseDecision(ctx, eventId, subjectId = null, { queue = false, asked = false, fromQueue = false, vars: own = null, quiet = false } = {}) {
  const { state } = ctx;
  const ev = EVENTS[eventId];
  if (!ev || !ev.choices) return false;
  if (!periodAllows(state, 'events', eventId)) return false;
  if (ev.eras && !ev.eras.includes(currentEra(state).id)) return false;
  if (!decisionGateOpen(state, eventId)) return false;
  // A decision with `fits` is dropped, not queued, once it no longer applies (a queued card can come due late).
  if (ev.fits && !ev.fits(state, subjectId)) return false;
  // Under quietEvents a small event plays out with no card and no ask: its default choice, said in Yak.
  if (B.pacing.quietEvents && (ev.quiet || quiet) && !asked) return resolveQuietly(ctx, ev, subjectId, own);
  // With the ask queue on, a card the game raises waits there; one the player asked for opens at once.
  if (askQueueOn() && !fromQueue && !asked) {
    queueDecision(ctx, eventId, subjectId, own);
    return true;
  }
  if (state.pendingDecision) {
    if (queue) state.scheduled.push({ id: newId(state, 'sch'), week: state.week, kind: 'event', payload: { eventId, subjectId } });
    return false;
  }
  // Decisions that are not emergencies wait for a breather after the last one.
  const spaced = !IMMEDIATE_KINDS.has(ev.kind) && !asked;
  const last = lastPauseWeek(state);
  if (spaced && last !== undefined && state.week - last < B.decisionGapWeeks) {
    if (queue) state.scheduled.push({ id: newId(state, 'sch'), week: last + B.decisionGapWeeks, kind: 'event', payload: { eventId, subjectId } });
    return false;
  }
  // A desk-staged decision about someone who is out waits for them, a week at a time, for up to
  // B.deskStageWaitWeeks; after that it goes ahead on a present person's desk, so nothing stalls behind it.
  const subject = state.staff.find((p) => p.id === subjectId);
  const waitKey = `${eventId}:${subjectId}`;
  if (ev.stage?.anchor === 'subjectDesk' && subject && !isIn(subject)) {
    // A roll that will not be retried (queue is false) never gets another look at this waitKey, so
    // recording a start week for it here would leave a marker nothing ever clears.
    if (!queue) {
      if (state.flags.deskWait) delete state.flags.deskWait[waitKey];
      return false;
    }
    const waits = (state.flags.deskWait ??= {});
    waits[waitKey] ??= state.week;
    if (state.week - waits[waitKey] < B.deskStageWaitWeeks) {
      state.scheduled.push({ id: newId(state, 'sch'), week: state.week + 1, kind: 'event', payload: { eventId, subjectId } });
      return false;
    }
  }
  if (state.flags.deskWait) delete state.flags.deskWait[waitKey];
  if (spaced) state.flags.lastDecisionWeek = state.week;
  if (ev.marks) state.flags[ev.marks] = state.week;
  const vars = own ?? decisionVars(state, ctx.rng, subjectId);
  // A postmortem carries the incident it is about, taken from the queue of those waiting.
  const waiting = state.flags.postmortemQueue ?? [];
  const at = waiting.findIndex((x) => x.eventId === eventId);
  if (at >= 0) {
    const inc = waiting.splice(at, 1)[0];
    Object.assign(vars, { incidentWeeks: inc.weeks, incidentCost: { ...inc.cost }, incidentResponders: [...inc.responderIds],
      incidentHelped: [...inc.helped], incidentHurt: [...inc.hurt] });
  }
  const fill = (t) => fillText(state, ctx.rng, t, subjectId, vars);
  state.pendingDecision = {
    eventId, subjectId, vars,
    title: fill(ev.title),
    text: fill(ev.text),
    choices: ev.choices.map((c) => {
      const why = choiceBlocker(state, c, subjectId);
      return { label: fill(c.label), hint: fill(c.hint), available: !why, reason: why };
    }),
    stage: ev.stage ? { ...ev.stage, ...stageTile(state, ev.stage.anchor, subjectId) } : null,
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
  const people = (canLeave ? present.filter((p) => !p.founder) : present)
    .filter((p) => ev.stage?.anchor !== 'subjectDesk' || !p.remote);
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
    case 'veteranStaff': return people.filter((p) => state.week - (p.hiredWeek ?? 0) >= B.nods.staplerTenureWeeks);
    case 'randomProduct': return liveProducts(state);
    case 'compatibleProduct': return liveProducts(state).filter((p) => p.legacyCompatible);
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
    offerReady: state.week >= B.retireFromWeek && mrr >= exitMrr(state, B.acquisitionOfferMrr) * offerMult && state.brand >= B.acquisitionOfferBrand * offerMult,
  };
}

// Every player-facing string an event can show, for the era text check.
const eventText = (state, ev) => [ev.title, ev.text, ev.chat ?? '', ...(ev.choices ?? []).flatMap((c) => [c.label, c.hint, c.outcome ?? ''])]
  .map((text) => periodText(state, text)).join(' ');

// An event fits the era if it names the era explicitly, or names none and its text fits.
export const eventFitsEra = (state, ev) => periodAllows(state, 'events', ev.id)
  && (ev.eras ? ev.eras.includes(currentEra(state).id) : eraOnlyAllowsText(state, eventText(state, ev)));

export function eligibleEvents(state) {
  const h = helpers(state);
  // A new company gets a quiet start: no decisions until its first launch or a few weeks in.
  const grace = (state.stats.launches === 0 && state.week < B.eventGraceWeeks)
    || (lastPauseWeek(state) !== undefined && state.week - lastPauseWeek(state) < B.decisionGapWeeks);
  return Object.values(EVENTS).filter((ev) => ev.random && !(grace && ev.choices)
    && (state.flags[`cd_${ev.id}`] ?? -1) <= state.week
    && eventFitsEra(state, ev)
    && (!ev.funding || ev.funding === (state.founding?.funding ?? 'bootstrapped'))
    && ev.when(state, h)
    && (ev.subject === null || resolveSubjects(state, ev).length > 0)
    && !(ev.scripted && B.pacing.askRates));
}

// Under askRates a scripted event comes the week it is ready, rather than from the cut random roll.
function scriptedEvents(ctx) {
  const { state } = ctx;
  const h = helpers(state);
  for (const ev of Object.values(EVENTS)) {
    if (!ev.scripted || (state.flags[`cd_${ev.id}`] ?? -1) > state.week || !eventFitsEra(state, ev) || !ev.when(state, h)) continue;
    const subjects = resolveSubjects(state, ev);
    if (ev.subject !== null && !subjects.length) continue;
    if (fireEvent(ctx, ev, subjects.length ? pick(ctx.rng, subjects).id : null)) return true;
  }
  return false;
}

export function fireEvent(ctx, ev, subjectId) {
  const { state } = ctx;
  // A low-stakes event (yak) arrives as a Yak reply prompt instead of a popup while prompts are on, or waits
  // for another week when a prompt is already open. It keeps the popup's place in the decision cadence, so
  // how often every other event comes up is unchanged.
  // With the inbox on, letter-like events arrive as mail instead: a choice event waits for a free mail slot
  // the way a Yak one waits for a prompt slot; a notice keeps its effects and arrives instead of its toast.
  // With the ask queue on, both wait in the queue instead, with no slot or week gap of their own.
  if (deliversAsMail(ev) && ev.choices) {
    if (askQueueOn()) {
      state.flags[`cd_${ev.id}`] = state.week + ev.cooldownWeeks;
      queueEventLetter(ctx, ev, subjectId);
      return true;
    }
    if (!mailSlotFree(state)) return false;
    state.flags[`cd_${ev.id}`] = state.week + ev.cooldownWeeks;
    state.flags.lastDecisionWeek = state.week;
    openEventMail(ctx, ev, subjectId);
    return true;
  }
  if (ev.yak && ev.choices && B.chatPromptsEnabled) {
    if (askQueueOn()) {
      state.flags[`cd_${ev.id}`] = state.week + ev.cooldownWeeks;
      queuePrompt(ctx, ev, subjectId);
      return true;
    }
    if (!promptSlotFree(state)) return false;
    state.flags[`cd_${ev.id}`] = state.week + ev.cooldownWeeks;
    state.flags.lastDecisionWeek = state.week;
    openEventPrompt(ctx, ev, subjectId);
    return true;
  }
  state.flags[`cd_${ev.id}`] = state.week + ev.cooldownWeeks;
  if (ev.chat) emitChat(ctx, { channel: 'random', from: '@officebot', text: fillText(state, ctx.rng, ev.chat, subjectId) });
  if (ev.choices) return raiseDecision(ctx, ev.id, subjectId);
  const vars = decisionVars(state, ctx.rng, subjectId);
  const title = fillText(state, ctx.rng, ev.title, subjectId, vars);
  const text = fillText(state, ctx.rng, ev.text, subjectId, vars);
  if (deliversAsMail(ev)) mailEventNotice(ctx, ev, title, text, subjectId);
  else ctx.emit({ type: 'toast', text: `${title}: ${text}`, tone: 'info' });
  applyEffects(ctx, ev.auto, subjectId, ev.id, vars);
  return true;
}

// Whether a launch or an unlock card (not a decision) is what keeps decisions waiting this week.
function launchPause(state) {
  const p = state.flags.lastPauseWeek;
  const d = state.flags.lastDecisionWeek;
  const recent = (w) => w !== undefined && state.week - w < B.decisionGapWeeks;
  return recent(p) && !recent(d);
}

export const eventChance = () => (B.pacing.askRates ? B.askRates.randomEventChance : B.randomEventChance);

export function eventsSystem(ctx) {
  const { state } = ctx;
  if (state.pendingDecision) return;
  if (B.pacing.askRates && !launchPause(state) && scriptedEvents(ctx)) return;
  const rolled = chance(ctx.rng, eventChance());
  const held = state.flags.heldRolls ?? 0;
  // A roll that lands while a launch or unlock is keeping decisions waiting is held (up to heldRollsMax) and
  // spent once the gap clears, so the spacing never lowers how often events come up.
  if (launchPause(state)) {
    if (rolled) state.flags.heldRolls = Math.min(B.heldRollsMax, held + 1);
    return;
  }
  if (!rolled) {
    if (!held) return;
    state.flags.heldRolls = held - 1;
  }
  const pool = eligibleEvents(state);
  if (!pool.length) return;
  const ev = weighted(ctx.rng, pool, (e) => e.weight);
  const subjects = resolveSubjects(state, ev);
  fireEvent(ctx, ev, subjects.length ? pick(ctx.rng, subjects).id : null);
}

registerSystem('events', eventsSystem, 70);

// Systems later in the week can send the person a desk prop was staged for home (the remote roll, a
// burnout leave). At the end of the week the prop moves to someone who is still in, so the moment has a cast.
// Open staged prompts get the same check.
export function restageSystem(ctx) {
  const { state } = ctx;
  const restage = (holder, subjectId) => {
    const st = holder?.stage;
    if (!st?.staffId || st.anchor !== 'subjectDesk') return;
    const who = state.staff.find((p) => p.id === st.staffId);
    if (who && isIn(who)) return;
    const { x, y, staffId, ...rest } = st;
    holder.stage = { ...rest, ...stageTile(state, st.anchor, subjectId) };
  };
  restage(state.pendingDecision, state.pendingDecision?.subjectId);
  for (const p of state.chatPrompts ?? []) if (!p.resolved) restage(p, p.subjectId);
}
registerSystem('restage', restageSystem, 99);
registerSystem('moment-talk', momentTalkSystem, 100);

// A quiet event resolves itself: its ask default (or, for `quiet: 'pick'`, a choice of its own), applied as a
// resolved card would apply it, with one Yak line saying what happened.
function resolveQuietly(ctx, ev, subjectId, own = null) {
  const { state } = ctx;
  const open = ev.choices.map((c, i) => i).filter((i) => !choiceBlocker(state, ev.choices[i], subjectId));
  if (!open.length) return false;
  const preferred = ev.quiet === 'pick' ? pick(ctx.rng, open) : defaultChoiceOf(ev);
  const choice = open.includes(preferred) ? preferred : open[0];
  const c = ev.choices[choice];
  if (ev.marks) state.flags[ev.marks] = state.week;
  const vars = own ?? decisionVars(state, ctx.rng, subjectId);
  const fill = (t) => fillText(state, ctx.rng, t, subjectId, vars);
  const stage = ev.stage ? { ...ev.stage, ...stageTile(state, ev.stage.anchor, subjectId) } : null;
  applyEffects(ctx, c.effects, subjectId, ev.id, vars);
  if (c.grant) {
    placeNow(ctx, c.grant.item, findSpot(layoutOf(state), state.office.placed, c.grant.item));
    if (c.effects?.cash < 0) state.cash += ITEMS[c.grant.item].costs[0];
  }
  if (c.leaves) leaveProp(state, c.leaves, stage, subjectId);
  ctx.emit({ type: 'quietEvent', eventId: ev.id, subjectId: subjectId ?? null, choice, stage: stage ? { staffId: null, ...stage } : null });
  emitChat(ctx, { channel: 'general', from: '@officebot', text: `${fill(ev.title)}: "${fill(c.label)}". ${c.outcome ? fill(c.outcome) : ''}`.trim() });
  return true;
}

registerAction('resolveDecision', (ctx, { choice }) => {
  const { state } = ctx;
  const d = state.pendingDecision;
  if (!d) return { ok: false, reason: 'No decision pending' };
  const ev = EVENTS[d.eventId];
  if (!Number.isInteger(choice) || !ev?.choices || choice < 0 || choice >= ev.choices.length) return { ok: false, reason: 'Invalid choice' };
  const c = ev.choices[choice];
  const why = choiceBlocker(state, c, d.subjectId);
  if (why) return { ok: false, reason: why };
  state.pendingDecision = null;
  ctx.emit({ type: 'decisionResolved', eventId: d.eventId, choice, subjectId: d.subjectId ?? null });
  if (c.outcome) ctx.emit({ type: 'toast', text: fillText(state, ctx.rng, c.outcome, d.subjectId, d.vars), tone: 'info' });
  applyEffects(ctx, c.effects, d.subjectId, d.eventId, d.vars);
  // A granted item is paid for by the choice's cash when it has any, so it is placed without charging again.
  if (c.grant) {
    placeNow(ctx, c.grant.item, findSpot(layoutOf(state), state.office.placed, c.grant.item));
    if (c.effects?.cash < 0) state.cash += ITEMS[c.grant.item].costs[0];
  }
  if (c.leaves) leaveProp(state, c.leaves, d.stage, d.subjectId);
  emitMomentTalk(ctx, d, choice);
  return { ok: true };
});
