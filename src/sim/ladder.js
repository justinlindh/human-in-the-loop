import { B } from './balance.js';
import { chance, int, pick, range } from './rng.js';
import { clamp, newId } from './util.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { raiseDecision } from './events.js';
import { liveProducts } from './projects.js';
import { eraAtLeast } from './eras.js';
import { FIRST_NAMES, LAST_NAMES } from '../data/names.js';
import { RIVAL_NAMES, PET_NAMES } from '../data/ladder.js';

const present = (state) => state.staff.filter((p) => p.mood !== 'away');

// How much of a week's mentoring and learning survives working from home.
export function remoteLearning(state, person) {
  return person?.remote ? B.remoteLearningMult : 1;
}

// Who works from home this week: everyone but the stayer during the lockdown, then per the work policy.
function setRemote(ctx) {
  const { state } = ctx;
  const lock = state.lockdown && state.week < state.lockdown.until;
  for (const p of state.staff) {
    if (p.mood === 'away') { p.remote = false; continue; }
    if (lock) p.remote = p.id !== state.lockdown.stayerId;
    else if (state.workPolicy === 'hybrid') p.remote = chance(ctx.rng, B.hybridRemoteShare);
    else if (state.workPolicy === 'remote') p.remote = chance(ctx.rng, B.remoteFirstShare);
    else p.remote = false;
  }
}

function lockdownStep(ctx) {
  const { state } = ctx;
  if (!state.lockdown && state.flags.lockdownWeek === undefined && state.week >= B.lockdownWeek && state.staff.length) {
    const stayer = pick(ctx.rng, state.staff);
    state.lockdown = { since: state.week, until: state.week + B.lockdownWeeks, stayerId: stayer.id };
    state.flags.lockdownWeek = state.week;
    raiseDecision(ctx, 'lockdown_start', stayer.id, { queue: true });
    emitChat(ctx, { from: '@officebot', text: 'The office is closed until further notice. Please take your plants home.' });
    return;
  }
  if (state.lockdown && state.week >= state.lockdown.until && state.flags.workPolicyAsked === undefined) {
    state.flags.workPolicyAsked = state.week;
    raiseDecision(ctx, 'work_policy', null, { queue: true });
    emitChat(ctx, { from: '@officebot', text: 'The office is open again. The plants did not make it. We are not talking about it.' });
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
    emitChat(ctx, { channel: 'random', from: '@hackernewsbot', text: `Show HN: ${state.rival.name}, like the thing you already use, but ours` });
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

export function ladderSystem(ctx) {
  const { state } = ctx;
  lockdownStep(ctx);
  setRemote(ctx);
  rivalStep(ctx);
  petsStep(state);
  if (present(state).length && state.lockdown && state.week === state.lockdown.since + 1 && state.lockdown.stayerId) {
    const stayer = state.staff.find((p) => p.id === state.lockdown.stayerId);
    if (stayer) ctx.emit({ type: 'say', id: newId(state, 'v'), week: state.week, staffId: stayer.id, text: 'Somebody has to water the plants.', toId: null, replyTo: null });
  }
}

registerSystem('ladder', ladderSystem, 11);
