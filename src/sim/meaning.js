import { B } from './balance.js';
import { clamp } from './util.js';
import { chance, pick, shuffle } from './rng.js';
import { registerSystem } from './registry.js';
import { staffMods, mentorOf, removeStaff } from './staff.js';
import { automationExposure, oversightRequired, oversightProvided } from './automation.js';
import { liveProducts } from './projects.js';
import { CHATTER } from '../data/chatter.js';
import { emitChat } from './chat.js';
import { modifierBonus } from './modifiers.js';

const SIGHS = ['sigh', '...', 'meh', 'ugh', 'zzz', 'why'];

function chatterKey(state, p) {
  if (automationExposure(state, p) > 0.5) return 'automated';
  if (p.assignment.type === 'mentor') return 'mentor';
  if (p.seniority === 'junior' && mentorOf(state, p)) return 'junior';
  if (p.assignment.type === 'oversight') return 'overseer';
  if (p.mood === 'coasting') return 'coasting';
  if (p.mood === 'burnout') return 'burnout';
  return p.assignment.type === 'idle' ? 'idle' : 'happy';
}

function weeklyMeaning(state, p) {
  const mods = staffMods(p);
  const exposure = automationExposure(state, p);
  const a = p.assignment.type;
  const mentored = p.seniority === 'junior' && !!mentorOf(state, p);
  let drain = exposure * B.meaningDrain[p.seniority] * mods.meaningDrain * (state.policies.pair ? B.pairMeaningDrainMult : 1);
  if ((p.seniority === 'senior' && (a === 'hardProblem' || a === 'mentor')) || mentored) drain *= 0.5;
  let bonus = 0;
  if (a === 'mentor') bonus += B.meaningRecovery.mentor;
  if (a === 'hardProblem') bonus += B.meaningRecovery.hardProblem;
  if (a === 'oversight') bonus += B.meaningRecovery.oversight;
  if (mentored) bonus += B.meaningRecovery.mentee;
  if (a === 'project' && state.projects.some((j) => j.id === p.assignment.targetId && j.kind === 'craft')) bonus += B.meaningRecovery.craft;
  if (state.policies.craft_fridays) bonus += B.meaningRecovery.craftFridays;
  if (liveProducts(state).some((pr) => pr.ownerId === p.id && pr.score >= 6)) bonus += B.meaningRecovery.owner;
  const recovery = (B.meaningBaseRecovery * (1 - exposure) + bonus) * mods.meaningRecovery * Math.max(0, 1 + modifierBonus(state, 'meaningRecovery'));
  return recovery - drain * Math.max(0, 1 + modifierBonus(state, 'meaningDrain'));
}

export function meaningSystem(ctx) {
  const { state } = ctx;
  state.ops.oversightRequired = oversightRequired(state);
  state.ops.oversightProvided = oversightProvided(state);

  // Deltas use this week's staff before anyone moods or leaves.
  const deltas = state.staff.map((p) => (p.mood === 'away' ? B.meaningRecovery.sabbatical : weeklyMeaning(state, p)));
  state.staff.forEach((p, i) => {
    p.meaning = clamp(p.meaning + deltas[i], 0, 100);
    if (p.mood === 'away') return;
    const prev = p.mood;
    p.mood = p.meaning < B.burnoutBelow ? 'burnout' : p.meaning < B.coastingBelow ? 'coasting' : 'ok';
    p.burnoutWeeks = p.mood === 'burnout' ? p.burnoutWeeks + 1 : 0;
    if (p.mood === 'burnout' && prev !== 'burnout') {
      ctx.emit({ type: 'toast', text: `${p.name} is running on empty.`, tone: 'warn' });
    } else if (p.mood === 'coasting' && prev === 'ok') {
      ctx.emit({ type: 'toast', text: `${p.name} seems checked out lately.`, tone: 'warn' });
    }
  });

  const leavers = state.staff.filter((p) => {
    if (p.founder || p.mood === 'away') return false;
    const mult = staffMods(p).resign;
    if (p.mood === 'coasting') {
      // Freshly coasting people rarely quit; the chance ramps up as meaning sinks toward burnout.
      const depth = clamp((B.coastingBelow - p.meaning) / (B.coastingBelow - B.burnoutBelow), 0, 1);
      return chance(ctx.rng, B.resignChance.coasting * depth * mult);
    }
    if (p.mood === 'burnout' && p.burnoutWeeks >= B.burnoutWeeksBeforeResign) return chance(ctx.rng, B.resignChance.burnout * mult);
    return false;
  });
  for (const p of leavers) {
    emitChat(ctx, { person: p, text: pick(ctx.rng, CHATTER.farewell) });
    ctx.emit({ type: 'resign', staffId: p.id, name: p.name });
    ctx.emit({ type: 'toast', text: `${p.name} resigned.`, tone: 'bad' });
    removeStaff(state, p);
    state.stats.resignations++;
  }

  const present = state.staff.filter((p) => p.mood !== 'away');
  for (const p of shuffle(ctx.rng, present).slice(0, 2)) {
    if (chance(ctx.rng, 0.5)) emitChat(ctx, { person: p, text: pick(ctx.rng, CHATTER[chatterKey(state, p)]) });
  }
  const glum = present.filter((p) => p.mood === 'coasting' || p.mood === 'burnout');
  if (glum.length) ctx.emit({ type: 'bubble', staffId: pick(ctx.rng, glum).id, text: pick(ctx.rng, SIGHS), tone: 'bad' });
}

registerSystem('meaning', meaningSystem, 50);
