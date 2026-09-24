import { B } from './balance.js';
import { clamp } from './util.js';
import { registerAction, registerSystem } from './registry.js';
import { modifierBonus } from './modifiers.js';
import { endMentorshipsOf } from './staff.js';
import { emitChat } from './chat.js';
import { pick } from './rng.js';

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
  // On-call pressure lasts the first weeks of an outage; after that people stop pulling all-nighters.
  if (state.outage && state.outage.weeks < B.strainOnCallWeeks && (p.role === 'engineer' || p.founder)) gain += B.strainOnCall;
  gain += Math.min(B.strainSlackMax, burntOut * B.strainSlack);
  if (state.policies.crunch && (a === 'project' || a === 'maintenance')) gain += B.crunchStrain;
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

const VACATION_POSTS = [
  'Out for two weeks. Please do not break anything I would have to fix.',
  'Vacation starts tomorrow. My out-of-office is a photo of a lake.',
  'Off for two weeks. If something is on fire, it will still be on fire when I am back.',
  'Taking my vacation. Handover doc is in the usual place, which is my head. Kidding. Mostly.',
  'Two weeks off. I have promised my family I will not check Slackk. I am lying to them.',
];

// Natural vacations: everyone takes about two weeks a year, staggered so few are away at once. A crunch or
// an outage postpones a vacation (with strain and a toast saying why), at most vacationMaxPostpones times
// in a row; after that the person goes anyway.
const firstName = (p) => p.name.split(' ')[0];
const listNames = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`);
export function vacationSystem(ctx) {
  const { state, rng } = ctx;
  const due = (state.flags.vacationDue ??= {});
  const n = (id) => Number(String(id).replace(/\D/g, '')) || 0;
  for (const id of Object.keys(due)) if (!state.staff.some((p) => p.id === id)) delete due[id];
  const away = state.staff.filter((p) => p.mood === 'away').length;
  let leaving = 0;
  const postponedCount = (state.flags.vacationPostponed ??= {});
  const blockedBy = state.outage ? 'the outage' : modifierBonus(state, 'output') > 0 ? 'the crunch' : null;
  const postponed = [];
  for (const p of state.staff) {
    // The first vacation falls somewhere in the person's first year, spread by id.
    due[p.id] ??= p.hiredWeek + B.vacationFirstAfter + (n(p.id) * 7) % 52;
    if (p.mood === 'away' || state.week < due[p.id]) continue;
    if (blockedBy && (postponedCount[p.id] ?? 0) < B.vacationMaxPostpones) {
      postponedCount[p.id] = (postponedCount[p.id] ?? 0) + 1;
      due[p.id] = state.week + B.vacationPostponeWeeks;
      p.strain = clamp((p.strain ?? 0) + B.vacationPostponeStrain, 0, 100);
      postponed.push(firstName(p));
      continue;
    }
    if ((away + leaving + 1) > Math.max(1, Math.floor(state.staff.length * B.vacationMaxShare))) {
      due[p.id] = state.week + 1;
      continue;
    }
    leaving++;
    delete postponedCount[p.id];
    due[p.id] = state.week + 52 + ((n(p.id) * 13) % 9) - 4;
    if (p.assignment.type === 'project') state.flags[`returnTo_${p.id}`] = p.assignment.targetId;
    p.mood = 'away';
    p.assignment = { type: 'sabbatical', targetId: null };
    p.sabbaticalWeeksLeft = B.vacationWeeks;
    p.stamina = Math.min(100, p.stamina + B.vacationStamina);
    state.flags[`awayFor_${p.id}`] = 'Vacation';
    endMentorshipsOf(state, p);
    emitChat(ctx, { person: p, text: pick(rng, VACATION_POSTS) });
  }
  for (const id of Object.keys(postponedCount)) if (!(id in due)) delete postponedCount[id];
  if (postponed.length) {
    const whose = postponed.length === 1 ? `${postponed[0]}'s vacation is` : `Vacations for ${listNames(postponed)} are`;
    ctx.emit({ type: 'toast', tone: 'warn', text: `${whose} postponed because of ${blockedBy}. They are not thrilled.` });
  }
}

registerSystem('vacation', vacationSystem, 48);
