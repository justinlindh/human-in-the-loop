import { B } from './balance.js';
import { chance, createRng, int, pick, shuffle } from './rng.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { mentorOf } from './staff.js';
import { STANDUP, STANDUP_EXCHANGES } from '../data/standup.js';
import { eraAllowsText, eraLines } from './eras.js';

export const standupMode = (state) => (state.policies.daily_standups ? 'daily' : state.policies.async_standups ? 'async' : null);

const first = (p) => p.name.split(' ')[0];

// Picks a line for one person from what they are doing this week; '' means they say nothing.
function lineFor(ctx, p, outageSpeakers) {
  const { state, rng } = ctx;
  const lines = (key) => eraLines(state, STANDUP[key]);
  // A line nobody has used lately, remembered so updates do not repeat week after week.
  const recent = (state.flags.standupRecent ??= []);
  // Each person also remembers their own last few lines, so nobody posts the same update twice running.
  const mine = ((state.flags.standupRecentBy ??= {})[p.id] ??= []);
  // `product: null` drops lines that need a product; `progressOnly` keeps only lines that show the percent.
  const choose = (key, product, progressOnly = false) => {
    const pool = lines(key).filter((l) => (product !== null || !l.includes('{product}')) && (!progressOnly || l.includes('{pct}')));
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
  if (outage && p.role === 'engineer' && a.type !== 'project') {
    outageSpeakers.add(p.id);
    return fill(choose('outage'), { product: outage.name });
  }
  if (a.type === 'project') {
    const j = state.projects.find((x) => x.id === a.targetId);
    if (j) {
      const pct = Math.floor((100 * j.progress) / j.pointsNeeded);
      const key = pct < 25 ? 'projectEarly' : pct < 80 ? 'projectMid' : 'projectLate';
      // After the first week, updates show the percent, so the same project never reads the same twice.
      return fill(choose(key, undefined, pct >= 5), { project: j.name, pct });
    }
  }
  if (a.type === 'mentor') {
    const m = state.staff.find((x) => x.id === a.targetId);
    if (m) return fill(choose('mentor'), { mentee: first(m) });
  }
  // A mentee talks about learning about half the time, and about their actual work the rest.
  if (p.seniority === 'junior' && mentorOf(state, p) && chance(rng, 0.5)) return fill(choose('mentee'));
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

// Standup dialogue draws from a stream of its own, one per week, so it never shifts the game's RNG.
export function standupRng(state) {
  return createRng((Math.imul(state.seed >>> 0, 2654435761) + Math.imul(state.week, 40503) + 91) >>> 0);
}

// A short exchange about real work: someone asks, the person doing the work answers, a third responds, and
// when few active colleagues are waiting to speak the first two get a follow-up each. Everyone else then
// gives their own update, keeping the exchange plus active updates to about B.standupMaxLines lines.
// Live work comes first (an outage, then a project, then oversight): a random exchange of the first topic
// with one not heard recently.
const TOPIC_ORDER = ['outage', 'project', 'oversight', 'general'];
export function standupConversation(state, speakers, updates, rng = standupRng(state)) {
  delete state.flags.standupConversation;
  const active = speakers.filter(p => !['burnout', 'coasting', 'away'].includes(p.mood) && !p.remote && p.assignment.type !== 'sabbatical');
  if (active.length < 2) return updates;
  const projects = active.map(p => ({ person: p, project: state.projects.find(j => p.assignment.type === 'project' && j.id === p.assignment.targetId) })).filter(x => x.project);
  const outage = state.outage && state.products.find(p => p.id === state.outage.productId && !p.killed);
  const engineer = active.find(p => p.role === 'engineer' && p.assignment.type !== 'project');
  const overseer = active.find(p => p.assignment.type === 'oversight');
  const context = {
    general: { person: active[1], vars: {} },
    ...(projects.length ? { project: { person: projects[0].person, vars: { project: projects[0].project.name, pct: Math.floor(100 * projects[0].project.progress / projects[0].project.pointsNeeded) } } } : {}),
    ...(outage && engineer ? { outage: { person: engineer, vars: { product: outage.name } } } : {}),
    ...(overseer ? { oversight: { person: overseer, vars: {} } } : {}),
  };
  const recent = (state.flags.standupConversationRecent ??= []);
  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
  const pool = STANDUP_EXCHANGES.filter(e => context[e.topic] && e.lines.every(t => eraAllowsText(state, t) && fill(t, context[e.topic].vars).length <= 70));
  if (!pool.length) return updates;
  const fresh = pool.filter(e => !recent.includes(e.id));
  const topic = TOPIC_ORDER.find(t => fresh.some(e => e.topic === t));
  const chosen = topic ? pick(rng, fresh.filter(e => e.topic === topic))
    : pool.reduce((a, b) => recent.lastIndexOf(a.id) <= recent.lastIndexOf(b.id) ? a : b);
  const { person, vars } = context[chosen.topic];
  // The second line is the work update. The other attendees ask and respond around its owner.
  const others = active.filter(p => p !== person);
  const cast = [others[0], person, ...others.slice(1)].slice(0, B.standupConversationCast);
  const rest = updates.filter(l => !cast.some(p => p.id === l.staffId));
  // Only real updates from active colleagues make room; quiet, flat or absent colleagues don't cut the exchange short.
  const waiting = rest.filter(l => active.some(p => p.id === l.staffId)).length;
  const turns = Math.max(3, Math.min(chosen.lines.length, B.standupMaxLines - waiting));
  const lines = chosen.lines.slice(0, turns).map((text, i) => ({ staffId: cast[i % cast.length].id, text: fill(text, vars) }));
  // The whole meeting stops at B.standupMaxTotalLines spoken lines; attendees past that skip their update today.
  let spoken = lines.length;
  for (const l of rest) {
    if (l.text && spoken >= B.standupMaxTotalLines) continue;
    if (l.text) spoken++;
    lines.push(l);
  }
  // One bounded snapshot ties the event lines to their subject for live presentation.
  state.flags.standupConversation = {
    script: chosen.id, topic: chosen.topic, personId: person.id, lines: lines.map(l => ({ ...l })),
    ...(chosen.topic === 'project' ? { subjectId: person.assignment.targetId, name: vars.project } : {}),
    ...(chosen.topic === 'outage' ? { subjectId: outage.id, name: outage.name, kind: state.outage.kind ?? null, startedWeek: state.week - (state.outage.weeks ?? 0), occurrence: state.flags.outageSeq ?? 0 } : {}),
  };
  recent.push(chosen.id);
  if (recent.length > B.standupConversationMemory) recent.splice(0, recent.length - B.standupConversationMemory);
  return lines;
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
  // Keep outage context beside the lines so the standup event keeps its contract shape.
  const outageSpeakers = new Set();
  const updates = speakers.map((p) => ({ staffId: p.id, text: lineFor(ctx, p, outageSpeakers) }));
  const talkRng = standupRng(state);
  const talk = mode === 'daily' && chance(talkRng, B.standupConversationChance);
  if (!talk) delete state.flags.standupConversation;
  const lines = talk ? standupConversation(state, speakers, updates, talkRng) : updates;
  const by = state.flags.standupRecentBy ?? {};
  for (const id of Object.keys(by)) if (!state.staff.some((p) => p.id === id)) delete by[id];
  ctx.emit({ type: 'standup', mode, lines });
  if (mode === 'daily') {
    for (const p of speakers) p.meaning = Math.min(100, p.meaning + B.standupDailyMeaning);
  } else {
    // Async updates are easy to skip: about half the speakers actually post.
    for (const l of lines) {
      if (l.text && chance(ctx.rng, B.asyncStandupPostChance)) emitChat(ctx, { channel: 'standup', person: state.staff.find((p) => p.id === l.staffId), text: l.text, outage: outageSpeakers.has(l.staffId) });
    }
  }
}

registerSystem('standup', standupSystem, 12);
