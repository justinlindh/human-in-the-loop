import { B } from './balance.js';
import { clamp } from './util.js';
import { registerAction, registerSystem } from './registry.js';
import { modifierBonus } from './modifiers.js';
import { endMentorshipsOf } from './staff.js';

// Weekly strain: exhaustion from real load. It builds when people are tired, understaffed, crunching,
// on call during an outage, or covering for a burnt-out colleague, and fades slowly with rest.
export function strainDelta(state, p, burntOut) {
  if (p.mood === 'away') return -B.strainRecoverAway;
  const a = p.assignment.type;
  const working = a !== 'idle' && a !== 'sabbatical';
  if (!working) return -B.strainRecoverRest;
  let gain = 0;
  if (p.stamina < B.strainTiredBelow) gain += B.strainFromTired * (B.strainTiredBelow - p.stamina) / B.strainTiredBelow;
  if (a === 'support') gain += B.strainUnderstaffed * state.ops.supportShortfall;
  if (p.role === 'engineer' && (a === 'maintenance' || a === 'project')) gain += B.strainUnderstaffed * state.ops.maintenanceShortfall;
  gain += Math.max(0, modifierBonus(state, 'output')) * B.strainPerCrunch;
  if (state.outage && (p.role === 'engineer' || p.founder)) gain += B.strainOnCall;
  gain += Math.min(B.strainSlackMax, burntOut * B.strainSlack);
  if (state.policies.no_crunch) gain *= B.noCrunchStrainMult;
  const recover = p.stamina >= B.strainRestedAbove ? B.strainRecoverWorking : 0;
  return gain - recover;
}

export function strainSystem(ctx) {
  const { state } = ctx;
  const burntOut = state.staff.filter((p) => p.mood === 'burnout').length;
  for (const p of state.staff) {
    const before = p.strain ?? 0;
    p.strain = clamp(before + strainDelta(state, p, burntOut - (p.mood === 'burnout' ? 1 : 0)), 0, 100);
    if (before < B.strainWarn && p.strain >= B.strainWarn && p.mood !== 'away') {
      ctx.emit({ type: 'toast', text: `${p.name} looks exhausted.`, tone: 'warn' });
    }
  }
}

registerSystem('strain', strainSystem, 49);

registerAction('timeOff', (ctx, { staffId }) => {
  const { state } = ctx;
  const p = state.staff.find((x) => x.id === staffId);
  if (!p) return { ok: false, reason: 'No such staff member' };
  if (p.mood === 'away') return { ok: false, reason: 'They are away' };
  if (p.assignment.type === 'project') state.flags[`returnTo_${p.id}`] = p.assignment.targetId;
  p.mood = 'away';
  p.assignment = { type: 'sabbatical', targetId: null };
  p.sabbaticalWeeksLeft = B.timeOffWeeks;
  state.flags[`awayFor_${p.id}`] = 'Time off';
  endMentorshipsOf(state, p);
  ctx.emit({ type: 'toast', text: `${p.name} is taking two weeks off. Their out-of-office is a photo of a hammock.`, tone: 'good' });
  return { ok: true };
});
