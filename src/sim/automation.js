import { B } from './balance.js';
import { sum } from './util.js';
import { registerAction } from './registry.js';
import { outputMult, staffMods } from './staff.js';
import { FUNCTIONS } from './state.js';
import { ROLES } from '../data/roles.js';
import { MODELS } from '../data/models.js';
import { POLICIES } from '../data/policies.js';
import { modifierBonus } from './modifiers.js';
import { itemBonus } from './bonus.js';
import { lockedReason, isUnlocked } from './unlocks.js';
import { eraAtLeast } from './eras.js';

// The highest automation level the era allows for a function: none in Classic, support and
// marketing copy only (capped) in the ChatGBT era, everything from Agents on.
export function automationCap(state, fn) {
  if (eraAtLeast(state, 'agents')) return 1;
  if (eraAtLeast(state, 'chatgbt')) return B.chatgbtAutomationFns.includes(fn) ? B.chatgbtAutomationCap : 0;
  return 0;
}

export function automationExposure(state, person) {
  let max = 0;
  for (const [fn, w] of Object.entries(ROLES[person.role].automatedBy)) max = Math.max(max, w * state.automation[fn].level);
  return max;
}

export function oversightRequired(state) {
  return sum(FUNCTIONS, (fn) => {
    const a = state.automation[fn];
    return a.level * B.oversightHoursPerLevel[fn] * (1 - 0.6 * MODELS[a.model].guardrails);
  });
}

export const overseers = (state) => state.staff.filter((p) => p.mood !== 'away' && p.assignment.type === 'oversight');

export function oversightProvided(state) {
  return sum(overseers(state), (p) => B.oversightHoursPerPerson * outputMult(state, p) * staffMods(p).oversight)
    * Math.max(0, 1 + modifierBonus(state, 'oversight') + itemBonus(state, 'oversight'));
}

registerAction('setAutomation', (ctx, { fn, level, model }) => {
  const { state } = ctx;
  if (!FUNCTIONS.includes(fn)) return { ok: false, reason: 'Unknown function' };
  if (typeof level !== 'number' || !Number.isFinite(level)) return { ok: false, reason: 'Invalid level' };
  const locked = lockedReason(state, 'automation');
  if (locked) return { ok: false, reason: locked };
  const cap = automationCap(state, fn);
  if (cap <= 0 && level > 0) return { ok: false, reason: 'Arrives with the Agents era' };
  const current = state.automation[fn].model;
  const m = model ?? current;
  const ms = state.models[m];
  if (!ms) return { ok: false, reason: 'Model is not available' };
  // Keeping the current model is always allowed, so a retired model can still be dialed down or off.
  if (m !== current && (!ms.available || ms.deprecated)) return { ok: false, reason: 'Model is not available' };
  state.automation[fn] = { level: Math.min(cap, Math.max(0, Math.round(level * 4) / 4)), model: m };
  return { ok: true };
});

registerAction('setPolicy', (ctx, { id, on }) => {
  const { state } = ctx;
  const pol = POLICIES[id];
  if (!pol) return { ok: false, reason: 'Unknown policy' };
  if (on) {
    if (!state.policies[id] && !isUnlocked(state, `policy.${id}`)) return { ok: false, reason: pol.lockText };
    state.policies[id] = true;
    if (pol.excludes) delete state.policies[pol.excludes];
    ctx.emit({ type: 'toast', text: `Policy on: ${pol.name}`, tone: 'info' });
  } else {
    delete state.policies[id];
  }
  return { ok: true };
});
