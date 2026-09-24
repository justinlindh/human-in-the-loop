import { B } from './balance.js';
import { chance, int, pick, range, shuffle } from './rng.js';
import { clamp, newId } from './util.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { raiseDecision } from './events.js';
import { liveProducts } from './projects.js';
import { eraAtLeast } from './eras.js';
import { FIRST_NAMES, LAST_NAMES } from '../data/names.js';
import { RIVAL_NAMES, PET_NAMES, CALL_SCRIPTS } from '../data/ladder.js';

const present = (state) => state.staff.filter((p) => p.mood !== 'away');
const hasPlants = (state) => state.office.placed.some((p) => p.itemId === 'plant' || p.itemId === 'plant_wall');

// How much of a week's mentoring and learning survives working from home.
export function remoteLearning(state, person) {
  return person?.remote ? B.remoteLearningMult : 1;
}

// Who works from home: everyone but the stayer during the lockdown, then per the work policy. Patterns are
// sticky: each person keeps their in or out pattern for a couple of months before it is rolled again.
// Under remote-first a core stays in the office: the founders and the seniors.
function setRemote(ctx) {
  const { state } = ctx;
  const lock = state.lockdown && state.week < state.lockdown.until;
  const until = (state.flags.remoteUntil ??= {});
  for (const p of state.staff) {
    if (p.mood === 'away') { p.remote = false; continue; }
    if (lock) { p.remote = p.id !== state.lockdown.stayerId; continue; }
    const core = p.founder || p.seniority === 'senior';
    const share = state.workPolicy === 'hybrid' ? B.hybridRemoteShare : state.workPolicy === 'remote' && !core ? B.remoteFirstShare : 0;
    if (!share) { p.remote = false; delete until[p.id]; continue; }
    if ((until[p.id] ?? -1) > state.week) continue;
    p.remote = chance(ctx.rng, share);
    until[p.id] = state.week + int(ctx.rng, ...B.remotePatternWeeks);
  }
  for (const id of Object.keys(until)) if (!state.staff.some((p) => p.id === id)) delete until[id];
}

// The share of the team working from home this week.
export const remoteShare = (state) => (state.staff.length ? state.staff.filter((p) => p.remote).length / state.staff.length : 0);

function lockdownStep(ctx) {
  const { state } = ctx;
  if (!state.lockdown && state.flags.lockdownWeek === undefined && state.week >= B.lockdownWeek && state.staff.length) {
    const stayer = pick(ctx.rng, state.staff);
    state.lockdown = { since: state.week, until: state.week + B.lockdownWeeks, stayerId: stayer.id };
    state.flags.lockdownWeek = state.week;
    raiseDecision(ctx, 'lockdown_start', stayer.id, { queue: true });
    emitChat(ctx, { from: '@officebot', text: hasPlants(state) ? 'The office is closed until further notice. Please take your plants home.' : 'The office is closed until further notice. Please take your chair home. Only your chair.' });
    return;
  }
  if (state.lockdown && state.week >= state.lockdown.until && state.flags.workPolicyAsked === undefined) {
    state.flags.workPolicyAsked = state.week;
    raiseDecision(ctx, 'work_policy', null, { queue: true });
    emitChat(ctx, { from: '@officebot', text: hasPlants(state) ? 'The office is open again. The plants did not make it. We are not talking about it.' : 'The office is open again. It smells like a closed office. Windows are open. Please be patient.' });
  }
}

function rivalStep(ctx) {
  const { state } = ctx;
  const live = liveProducts(state);
  if (!state.rival && state.stats.launches >= 2 && state.week >= B.rivalFromWeek && live.length) {
    const category = pick(ctx.rng, live).category;
    state.rival = {
      name: pick(ctx.rng, RIVAL_NAMES), founderName: `${pick(ctx.rng, FIRST_NAMES)} ${pick(ctx.rng, LAST_NAMES)}`,
      logoColor: pick(ctx.rng, ['#e5484d', '#9b6bff', '#34c38f', '#4f8cff', '#ffb020']), categoryId: category,
      strength: B.rivalStartStrength, status: 'rising',
    };
    raiseDecision(ctx, 'rival_appears', null, { queue: true });
    emitChat(ctx, { channel: 'random', from: '@newsbot', text: `Just launched: ${state.rival.name}, "like the thing you already use, but ours".` });
    return;
  }
  const r = state.rival;
  if (!r || (r.status !== 'rising' && r.status !== 'stalled')) return;
  if (r.status === 'rising') {
    r.strength = clamp(r.strength + range(ctx.rng, 0, B.rivalGrowth * 2), 0, 100);
    if (r.strength >= 100 || chance(ctx.rng, B.rivalStallChance)) r.status = 'stalled';
  }
  // The rival's story resolves once the industry starts consolidating.
  if (eraAtLeast(state, 'consolidation') && state.flags.rivalFateWeek === undefined && state.week >= state.era.since + B.rivalFateAfterWeeks) {
    state.flags.rivalFateWeek = state.week;
    const roll = int(ctx.rng, 0, 2);
    if (roll === 0) {
      r.status = 'acquired';
      emitChat(ctx, { channel: 'random', from: '@newsbot', text: `${r.name} has been acquired. ${r.founderName} posted a thread about "the journey".` });
    } else if (roll === 1) {
      r.status = 'dead';
      emitChat(ctx, { channel: 'random', from: '@newsbot', text: `${r.name} is shutting down. Their last blog post is titled "What we learned". It is very long.` });
    } else {
      raiseDecision(ctx, 'rival_merge', null, { queue: true });
    }
  }
}

// The rival's pressure on its category, in the same units as incumbent strength.
export const rivalPressure = (state, categoryId) => {
  const r = state.rival;
  return r && r.categoryId === categoryId && (r.status === 'rising' || r.status === 'stalled') ? r.strength * B.rivalStrengthScale : 0;
};

function petsStep(state) {
  // A pet stays only while its owner does; the office cat stays regardless (it chose the office, not the owner).
  for (const pet of state.pets) {
    if (pet.ownerId && !state.staff.some((p) => p.id === pet.ownerId)) pet.ownerId = null;
  }
  state.pets = state.pets.filter((pet) => pet.ownerId || pet.species === 'cat');
}

// Meaning recovery from pets that are in the office this week.
export function petComfort(state) {
  const here = state.pets.filter((pet) => !pet.ownerId || state.staff.some((p) => p.id === pet.ownerId && p.mood !== 'away' && !p.remote));
  return Math.min(B.petMaxCount, here.length) * B.petMeaningRecovery;
}

// Adds a pet for an owner (from a decision). Returns the pet.
export function adoptPet(state, species, ownerId, rng) {
  const pet = { id: newId(state, 'pet'), species, name: pick(rng, PET_NAMES[species]), ownerId, arrivedWeek: state.week };
  state.pets.push(pet);
  return pet;
}

// Call weeks: every lockdown week, and some weeks under hybrid or remote-first. People on the call get
// staff.call = { muted, frozen, badCamera }; everyone else has call null. Sometimes the call has a moment.
function callStep(ctx) {
  const { state, rng } = ctx;
  const lock = state.lockdown && state.week < state.lockdown.until;
  const callWeek = lock || ((state.workPolicy === 'hybrid' || state.workPolicy === 'remote') && chance(rng, B.callWeekChance));
  const onCall = callWeek ? state.staff.filter((p) => p.mood !== 'away' && (lock || p.remote)) : [];
  for (const p of state.staff) {
    p.call = onCall.includes(p)
      ? { muted: chance(rng, B.callMutedChance), frozen: chance(rng, B.callFrozenChance), badCamera: chance(rng, B.callBadCameraChance) }
      : null;
  }
  // No call moment in the lockdown's last week: people are already packing up for the office.
  const lastWeek = lock && state.week >= state.lockdown.until - 1;
  if (onCall.length < 2 || lastWeek || !chance(rng, B.callMomentChance)) return;
  const [a, b] = shuffle(rng, onCall);
  const names = { a: a.name.split(' ')[0], b: b.name.split(' ')[0] };
  let prev = null;
  for (const [role, variants] of pick(rng, CALL_SCRIPTS)) {
    const who = role === 'a' ? a : b;
    const text = pick(rng, variants).replace(/\{(a|b)\}/g, (_, k) => names[k]);
    const e = { type: 'say', id: newId(state, 'v'), week: state.week, staffId: who.id, text, toId: (who === a ? b : a).id, replyTo: prev?.id ?? null };
    ctx.emit(e);
    prev = e;
  }
}

export function ladderSystem(ctx) {
  const { state } = ctx;
  lockdownStep(ctx);
  setRemote(ctx);
  callStep(ctx);
  rivalStep(ctx);
  petsStep(state);
  if (present(state).length && state.lockdown && state.week === state.lockdown.since + 1 && state.lockdown.stayerId) {
    const stayer = state.staff.find((p) => p.id === state.lockdown.stayerId);
    if (stayer) ctx.emit({ type: 'say', id: newId(state, 'v'), week: state.week, staffId: stayer.id, text: hasPlants(state) ? 'Somebody has to water the plants.' : 'Somebody has to keep the lights on. Literally, the switch is sticky.', toId: null, replyTo: null });
  }
}

registerSystem('ladder', ladderSystem, 11);
