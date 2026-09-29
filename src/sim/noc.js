import { B } from './balance.js';
import { createRng, chance } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { itemBonus } from './bonus.js';
import { eraAtLeast } from './eras.js';
import { raiseDecision } from './events.js';

const MODES = new Set(['humans', 'agents']);

// The humans on the glass: everyone on the security assignment who is here.
export const nocCrew = (state) => state.staff.filter((p) => p.assignment.type === 'security' && p.mood !== 'away');

export const nocItem = (state) => state.office.placed.find((p) => p.itemId === 'noc') ?? null;

// How much the NOC adds to the chance of catching an incident early. Humans need a crew on the security assignment;
// agents need nobody and watch harder.
export function nocCatch(state) {
  const bonus = itemBonus(state, 'nocCatch');
  if (!bonus) return 0;
  if (state.ops.noc === 'agents') return bonus * B.nocAgentCatch;
  const crew = nocCrew(state).length;
  return bonus * Math.min(1, crew / B.nocCrew);
}

// A NOC roll, from its own stream (seed, week, incident count), so a company without a NOC plays exactly as it
// would with none. Chance 0 draws nothing.
export function nocRoll(state, salt, p) {
  if (!(p > 0)) return false;
  const seed = (Math.imul(state.seed >>> 0, 2246822519) + Math.imul(state.week, 3266489917) + Math.imul(state.stats.incidents, 668265263) + salt) >>> 0;
  return chance(createRng(seed), p);
}

// Whether the NOC's agents read this incident's alert as routine.
export const nocMisread = (state) => state.ops.noc === 'agents' && !!nocItem(state) && nocRoll(state, 7, B.nocMisreadChance);

// The Agents-era bet, raised once a NOC at level 2 or more is placed and the mode is still open.
export function nocSystem(ctx) {
  const { state } = ctx;
  if (state.ops.noc || state.flags.nocBetAsked || state.pendingDecision || !eraAtLeast(state, 'agents')) return;
  if ((nocItem(state)?.level ?? 0) < 2) return;
  if (raiseDecision(ctx, 'noc_bet', null)) state.flags.nocBetAsked = true;
}

registerSystem('noc', nocSystem, 66);

registerAction('setNocMode', (ctx, { mode }) => {
  const { state } = ctx;
  if (!MODES.has(mode)) return { ok: false, reason: 'Unknown mode' };
  if (!nocItem(state)) return { ok: false, reason: 'No NOC' };
  if (!state.ops.noc) return { ok: false, reason: 'Not yet' };
  if (state.ops.noc === mode) return { ok: false, reason: 'Already set' };
  if (state.week - (state.ops.nocSince ?? -Infinity) < B.nocSwitchWeeks) return { ok: false, reason: 'Too soon' };
  state.ops.noc = mode;
  state.ops.nocSince = state.week;
  ctx.emit({ type: 'toast', tone: 'info', text: mode === 'agents' ? 'The agents have the NOC now. They promise to wake someone if it matters.' : 'Humans are back on the glass. Someone buys a bigger coffee pot.' });
  return { ok: true };
});
