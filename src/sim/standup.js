import { B } from './balance.js';
import { chance, int, pick, shuffle } from './rng.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { mentorOf } from './staff.js';
import { STANDUP } from '../data/standup.js';
import { eraLines } from './eras.js';

export const standupMode = (state) => (state.policies.daily_standups ? 'daily' : state.policies.async_standups ? 'async' : null);

const first = (p) => p.name.split(' ')[0];

// Picks a line for one person from what they are doing this week; '' means they say nothing.
function lineFor(ctx, p) {
  const { state, rng } = ctx;
  const lines = (key) => eraLines(state, STANDUP[key]);
  // A line nobody has used lately, remembered so updates do not repeat week after week.
  const recent = (state.flags.standupRecent ??= []);
  // Each person also remembers their own last few lines, so nobody posts the same update twice running.
  const mine = ((state.flags.standupRecentBy ??= {})[p.id] ??= []);
  const choose = (key, product) => {
    const pool = lines(key).filter((l) => product !== null || !l.includes('{product}'));
    const fresh = pool.filter((l) => !recent.includes(l) && !mine.includes(l));
    // With nothing fresh left, take the line anyone used longest ago.
    const t = fresh.length ? pick(rng, fresh) : pool.reduce((x, y) => (recent.lastIndexOf(y) < recent.lastIndexOf(x) ? y : x));
    recent.push(t);
    mine.push(t);
    if (recent.length > B.standupMemory) recent.splice(0, recent.length - B.standupMemory);
    if (mine.length > B.standupPersonMemory) mine.splice(0, mine.length - B.standupPersonMemory);
    return t;
  };
  if (p.mood === 'burnout') return '';
  if (p.mood === 'coasting') return choose('coasting');
  const others = state.staff.filter((x) => x.id !== p.id && x.mood !== 'away' && first(x) !== first(p));
  const fill = (text, vars = {}) => text
    .replaceAll('{coworker}', others.length ? first(pick(rng, others)) : 'the team')
    .replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  const a = p.assignment;
  const outage = state.outage && state.products.find((x) => x.id === state.outage.productId);
  if (outage && p.role === 'engineer' && a.type !== 'project') return fill(choose('outage'), { product: outage.name });
  if (a.type === 'project') {
    const j = state.projects.find((x) => x.id === a.targetId);
    if (j) {
      const pct = Math.floor((100 * j.progress) / j.pointsNeeded);
      const key = pct < 25 ? 'projectEarly' : pct < 80 ? 'projectMid' : 'projectLate';
      return fill(choose(key), { project: j.name, pct });
    }
  }
  if (a.type === 'mentor') {
    const m = state.staff.find((x) => x.id === a.targetId);
    if (m) return fill(choose('mentor'), { mentee: first(m) });
  }
  if (p.seniority === 'junior' && mentorOf(state, p)) return fill(choose('mentee'));
  if (a.type === 'hardProblem') return fill(choose('hardProblem'));
  if (a.type === 'oversight') return fill(choose('oversight'));
  if (a.type === 'maintenance') {
    const due = state.products.find((x) => !x.killed && x.migrationDueWeek !== null);
    if (due && p.role === 'engineer') return fill(choose('migration'), { product: due.name });
    const live = state.products.filter((x) => !x.killed);
    const liveName = live.length ? pick(rng, live).name : null;
    return fill(choose('maintenance', liveName), { product: liveName });
  }
  const byRole = { support: 'support', sales: 'sales', marketing: 'marketing', security: 'security' }[a.type];
  if (!byRole) return fill(choose('idle'));
  const live = state.products.filter((x) => !x.killed);
  const liveName = live.length ? pick(rng, live).name : null;
  return fill(choose(byRole, liveName), { product: liveName });
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
  const by = state.flags.standupRecentBy ?? {};
  for (const id of Object.keys(by)) if (!state.staff.some((p) => p.id === id)) delete by[id];
  ctx.emit({ type: 'standup', mode, lines });
  if (mode === 'daily') {
    for (const p of speakers) p.meaning = Math.min(100, p.meaning + B.standupDailyMeaning);
  } else {
    // Async updates are easy to skip: about half the speakers actually post.
    for (const l of lines) {
      if (l.text && chance(ctx.rng, B.asyncStandupPostChance)) emitChat(ctx, { channel: 'standup', person: state.staff.find((p) => p.id === l.staffId), text: l.text });
    }
  }
}

registerSystem('standup', standupSystem, 12);
