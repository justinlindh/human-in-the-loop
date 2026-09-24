import { B } from './balance.js';
import { int, pick, shuffle } from './rng.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { mentorOf } from './staff.js';
import { STANDUP } from '../data/standup.js';

export const standupMode = (state) => (state.policies.daily_standups ? 'daily' : state.policies.async_standups ? 'async' : null);

const first = (p) => p.name.split(' ')[0];

// Picks a line for one person from what they are doing this week; '' means they say nothing.
function lineFor(ctx, p) {
  const { state, rng } = ctx;
  if (p.mood === 'burnout') return '';
  if (p.mood === 'coasting') return pick(rng, STANDUP.coasting);
  const others = state.staff.filter((x) => x.id !== p.id && x.mood !== 'away' && first(x) !== first(p));
  const fill = (text, vars = {}) => text
    .replaceAll('{coworker}', others.length ? first(pick(rng, others)) : 'the team')
    .replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  const a = p.assignment;
  const outage = state.outage && state.products.find((x) => x.id === state.outage.productId);
  if (outage && p.role === 'engineer' && a.type !== 'project') return fill(pick(rng, STANDUP.outage), { product: outage.name });
  if (a.type === 'project') {
    const j = state.projects.find((x) => x.id === a.targetId);
    if (j) {
      const pct = Math.floor((100 * j.progress) / j.pointsNeeded);
      const pool = pct < 25 ? STANDUP.projectEarly : pct < 80 ? STANDUP.projectMid : STANDUP.projectLate;
      return fill(pick(rng, pool), { project: j.name, pct });
    }
  }
  if (a.type === 'mentor') {
    const m = state.staff.find((x) => x.id === a.targetId);
    if (m) return fill(pick(rng, STANDUP.mentor), { mentee: first(m) });
  }
  if (p.seniority === 'junior' && mentorOf(state, p)) return fill(pick(rng, STANDUP.mentee));
  if (a.type === 'hardProblem') return fill(pick(rng, STANDUP.hardProblem));
  if (a.type === 'oversight') return fill(pick(rng, STANDUP.oversight));
  if (a.type === 'maintenance') {
    const due = state.products.find((x) => !x.killed && x.migrationDueWeek !== null);
    return due && p.role === 'engineer' ? fill(pick(rng, STANDUP.migration), { product: due.name }) : fill(pick(rng, STANDUP.maintenance));
  }
  const byRole = { support: 'support', sales: 'sales', marketing: 'marketing', security: 'security' }[a.type];
  return fill(pick(rng, STANDUP[byRole ?? 'idle']));
}

// Weekly standup when a standup policy is on: 3 to 5 people give an update. Daily standups also lift
// the speakers' meaning a little; async updates are posted to #standup instead.
export function standupSystem(ctx) {
  const { state } = ctx;
  const mode = standupMode(state);
  if (!mode) return;
  const present = state.staff.filter((p) => p.mood !== 'away');
  if (!present.length) return;
  const speakers = shuffle(ctx.rng, present).slice(0, Math.min(present.length, int(ctx.rng, 3, 5)));
  const lines = speakers.map((p) => ({ staffId: p.id, text: lineFor(ctx, p) }));
  ctx.emit({ type: 'standup', mode, lines });
  if (mode === 'daily') {
    for (const p of speakers) p.meaning = Math.min(100, p.meaning + B.standupDailyMeaning);
  } else {
    for (const l of lines) {
      if (l.text) emitChat(ctx, { channel: 'standup', person: state.staff.find((p) => p.id === l.staffId), text: l.text });
    }
  }
}

registerSystem('standup', standupSystem, 12);
