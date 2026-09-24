import { B } from './balance.js';
import { avg, newId, article } from './util.js';
import { chance, pick, range, shuffle } from './rng.js';
import { registerSystem } from './registry.js';
import { automationExposure } from './automation.js';
import { CHATTER } from '../data/chatter.js';
import { THREADS } from '../data/threads.js';
import { MODELS } from '../data/models.js';
import { CATEGORIES } from '../data/categories.js';
import { ITEMS } from '../data/items.js';
import { incumbentFor } from '../data/incumbents.js';
import { eraAllowsText, eraLines } from './eras.js';

const REACTIONS = {
  win: ['🎉', '🚀', '👏', '🔥', '💯'],
  incident: ['💀', '👀', '😬', '🫠'],
  farewell: ['🫡', '💙', '😢'],
  random: ['😂', '🐶', '☕', '🌱', '🍕'],
  normal: ['😂', '👍', '💯', '🙃', '☕', '👀'],
};

const present = (state) => state.staff.filter((p) => p.mood !== 'away');
const liveProducts = (state) => state.products.filter((p) => !p.killed);
export const teamMeaning = (state) => avg(present(state), (p) => p.meaning);

// Reaction pills for a message: more of them, and more varied, when the team is doing well.
export function reactionsFor(state, rng, channel, kind, meaning = teamMeaning(state)) {
  const byChannel = { wins: 'win', incidents: 'incident', random: 'random' };
  const set = REACTIONS[kind] ?? REACTIONS[byChannel[channel]] ?? REACTIONS.normal;
  const everyday = !REACTIONS[kind] && channel !== 'wins' && channel !== 'incidents';
  if (everyday && !chance(rng, (meaning / 100) * B.everydayReactChance)) return {};
  let count = Math.round((meaning / 100) * B.reactionMax * range(rng, 0.3, 1.3));
  if (kind === 'farewell') count = Math.max(1, count);
  if (count <= 0) return {};
  const kinds = Math.min(set.length, count, 1 + Math.floor(meaning / 40));
  const picked = kind === 'farewell' ? [set[0], ...shuffle(rng, set.slice(1))].slice(0, kinds) : shuffle(rng, set).slice(0, kinds);
  const out = Object.fromEntries(picked.map((e) => [e, 1]));
  for (let i = kinds; i < count; i++) out[pick(rng, picked)]++;
  return out;
}

// Emits a Slackk chat event in the contract shape. `person` may be a staff object or null for bots.
export function emitChat(ctx, { channel = 'general', person = null, from = person?.name, text, replyTo = null, reactions, kind = null }) {
  const msg = {
    type: 'chat', id: newId(ctx.state, 'm'), week: ctx.state.week, channel, from, fromId: person?.id ?? null, text, replyTo,
    reactions: reactions ?? reactionsFor(ctx.state, ctx.rng, channel, kind),
  };
  ctx.emit(msg);
  const log = ctx.state.chatLog;
  if (Array.isArray(log)) {
    log.push(msg);
    if (log.length > B.chatLogSize) log.splice(0, log.length - B.chatLogSize);
  }
  return msg;
}

// Fills chat placeholders from real state. Returns null when a placeholder has nothing to point at.
export function fillChat(state, rng, text, { speaker = null, product = null, poster = null, item = null } = {}) {
  const live = state.products.filter((p) => !p.killed);
  const prod = product ?? (live.length ? pick(rng, live) : null);
  const first = (p) => p.name.split(' ')[0];
  const others = present(state).filter((p) => p.id !== speaker?.id && (!speaker || first(p) !== first(speaker)));
  const auto = state.automation.engineering;
  const values = {
    product: prod?.name,
    category: prod ? CATEGORIES[prod.category].name : null,
    incumbent: incumbentFor(prod?.category ?? pick(rng, state.market.unlockedCategories)).name,
    coworker: others.length ? pick(rng, others).name.split(' ')[0] : null,
    model: prod?.model ? MODELS[prod.model].name : auto.level > 0 ? MODELS[auto.model].name : null,
    item,
    poster: poster ? poster.name.split(' ')[0] : null,
  };
  let missing = false;
  // "a {category}" becomes "an Email" or "a CRM" depending on what is filled in.
  const withArticles = text.replace(/\b([Aa])n? \{(\w+)\}/g, (m, a, key) => {
    const v = values[key];
    if (v === null || v === undefined) return m;
    const phrase = article(v);
    return a === 'A' ? phrase[0].toUpperCase() + phrase.slice(1) : phrase;
  });
  const out = withArticles.replace(/\{(\w+)\}/g, (_, key) => {
    const v = values[key];
    if (v === null || v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
}

function chatterKey(state, p) {
  if (automationExposure(state, p) > 0.5) return 'automated';
  if (p.assignment.type === 'mentor') return 'mentor';
  if (p.seniority === 'junior' && state.staff.some((m) => m.assignment.type === 'mentor' && m.assignment.targetId === p.id)) return 'junior';
  if (p.assignment.type === 'oversight') return 'overseer';
  if (p.mood === 'coasting') return 'coasting';
  if (p.mood === 'burnout') return 'burnout';
  return p.assignment.type === 'idle' ? 'idle' : 'happy';
}

// What happened this week, read from the week's events, for context threads.
function happenings(ctx) {
  const { state } = ctx;
  const ev = ctx.events;
  const productOf = (e) => state.products.find((p) => p.id === e?.productId) ?? null;
  const launch = ev.find((e) => e.type === 'launch' && productOf(e)?.version === 1);
  const incident = ev.find((e) => e.type === 'incident' && !e.caught);
  const caught = ev.find((e) => e.type === 'incident' && e.caught);
  const promotedId = ctx.happenings?.promoted?.[0];
  const lastItem = state.office.placed.find((p) => p.itemId === state.flags.lastItemId && ITEMS[p.itemId].kind === 'shop');
  return {
    launch: launch ? { product: productOf(launch) } : null,
    incident: incident ? { product: productOf(incident) } : null,
    caught: caught ? { product: productOf(caught) } : null,
    promotion: promotedId ? { person: state.staff.find((p) => p.id === promotedId) } : null,
    research: ctx.happenings?.research ? {} : null,
    award: ev.some((e) => e.type === 'award' && e.text.startsWith('Product of the Year')) ? {} : null,
    item: lastItem && state.flags.lastItemWeek >= state.week - 1 ? { item: ITEMS[lastItem.itemId]?.name } : null,
    priceHike: ev.some((e) => e.type === 'toast' && /raised prices/.test(e.text)) ? {} : null,
    clone: ev.some((e) => e.type === 'chat' && e.from === '@hackernewsbot')
      ? { product: liveProducts(state).find((p) => p.category === state.flags.lastCloneCategory) ?? null } : null,
    copied: ev.some((e) => e.type === 'toast' && /Sounds familiar/.test(e.text)) ? {} : null,
  };
}

// Everyone who could play a thread role, not counting people already in the thread.
function cast(state, who, poster, used, promoted) {
  if (who === 'poster') return poster ? [poster] : [];
  const pool = present(state).filter((p) => !used.has(p.id));
  const mentorOf = (p) => state.staff.find((m) => m.assignment.type === 'mentor' && m.assignment.targetId === p.id && m.mood !== 'away');
  switch (who) {
    case 'random': return pool;
    case 'founder': return pool.filter((p) => p.founder);
    case 'any junior': return pool.filter((p) => p.seniority === 'junior');
    case 'coasting senior': return pool.filter((p) => p.seniority === 'senior' && p.mood === 'coasting');
    case 'automated senior': return pool.filter((p) => p.seniority === 'senior' && automationExposure(state, p) > 0.5);
    case 'burnout': return pool.filter((p) => p.mood === 'burnout');
    case 'mentor': return pool.filter((p) => p.assignment.type === 'mentor' && pool.some((q) => q.id === p.assignment.targetId));
    case 'mentored junior': return pool.filter((p) => p.seniority === 'junior' && mentorOf(p));
    case 'their mentee': return poster?.assignment.type === 'mentor' ? pool.filter((p) => p.id === poster.assignment.targetId) : [];
    case 'their mentor': return poster ? pool.filter((p) => mentorOf(poster)?.id === p.id) : [];
    case 'overseer': return pool.filter((p) => p.assignment.type === 'oversight');
    case 'new hire': return pool.filter((p) => !p.founder && p.hiredWeek >= state.week - 8);
    case 'promoted': return promoted && pool.includes(promoted) ? [promoted] : [];
    default: return pool.filter((p) => p.role === who);
  }
}

// Casts and fills a thread; returns null if any part cannot be cast or filled.
function planThread(state, rng, t, context) {
  const used = new Set();
  const posters = cast(state, t.post.who, null, used, context?.person);
  if (!posters.length) return null;
  const poster = pick(rng, posters);
  used.add(poster.id);
  const fillOpts = { product: context?.product ?? null, item: context?.item ?? null };
  const postText = fillChat(state, rng, t.post.text, { ...fillOpts, speaker: poster });
  if (postText === null) return null;
  const lines = [{ person: poster, text: postText }];
  for (const r of t.replies) {
    const options = cast(state, r.who, poster, used, context?.person);
    if (!options.length) return null;
    const person = pick(rng, options);
    used.add(person.id);
    const text = fillChat(state, rng, r.text, { ...fillOpts, speaker: person, poster });
    if (text === null) return null;
    lines.push({ person, text });
  }
  return lines;
}

function postThread(ctx, t, lines) {
  const kind = t.channel === 'wins' ? 'win' : t.channel === 'incidents' ? 'incident' : null;
  const root = emitChat(ctx, { channel: t.channel, person: lines[0].person, text: lines[0].text, kind });
  for (const l of lines.slice(1)) emitChat(ctx, { channel: t.channel, person: l.person, text: l.text, replyTo: root.id, kind });
  ctx.state.flags[`cdThread_${t.id}`] = ctx.state.week + (t.cooldown ?? B.threadCooldownWeeks);
}

const NUDGES = {
  desks: ['We should probably get desks in here first.', 'I have been sitting on a paint can for a week. Desks?', 'Standing is fine. Standing for a year is not. Desks.'],
  product: ['Desks: done. Now we just need, you know, a product.', 'Should we build something? I feel like we should build something.'],
};

// A founder's nudge toward the first goals in the opening weeks, or null.
function founderNudge(state) {
  if (![1, 4, 9].includes(state.week)) return null;
  const desks = state.office.placed.filter((p) => p.itemId === 'desk').length;
  if (desks < 2) return NUDGES.desks[[1, 4, 9].indexOf(state.week)];
  if (!state.projects.length && !state.products.length) return NUDGES.product[state.week === 1 ? 0 : 1];
  return null;
}

// Weekly Slackk: launch announcements, a thread about this week's news, an occasional everyday
// thread, and mood chatter. The number of everyday lines falls as the team's meaning falls.
export function chatSystem(ctx) {
  const { state } = ctx;
  const team = present(state);
  const meaning = teamMeaning(state);
  const h = {
    avgMeaning: meaning, debt: state.comprehensionDebt, ik: state.institutionalKnowledge, week: state.week,
    hasModifier: (label) => state.modifiers.some((m) => m.label === label && m.untilWeek > state.week),
  };

  for (const e of ctx.events.filter((x) => x.type === 'launch')) {
    const p = state.products.find((x) => x.id === e.productId);
    if (p) emitChat(ctx, { channel: 'wins', from: '@launchbot', text: `${p.name} v${p.version} is live. Reviews average ${p.score}.`, kind: 'win' });
  }
  if (!team.length) return;

  const nudge = founderNudge(state);
  if (nudge) {
    const f = pick(ctx.rng, team.filter((p) => p.founder).length ? team.filter((p) => p.founder) : team);
    emitChat(ctx, { person: f, text: nudge });
    ctx.emit({ type: 'bubble', staffId: f.id, text: nudge, tone: 'good' });
  }

  const cooled = (t) => (state.flags[`cdThread_${t.id}`] ?? -1) <= state.week && eraAllowsText(state, [t.post.text, ...t.replies.map((r) => r.text)].join(' '));
  const happened = happenings(ctx);
  for (const t of shuffle(ctx.rng, THREADS.filter((x) => x.context && happened[x.context] && cooled(x)))) {
    const lines = planThread(state, ctx.rng, t, happened[t.context]);
    if (lines) { postThread(ctx, t, lines); break; }
  }

  let budget = Math.min(B.chatMax, Math.round(B.chatBase + B.chatPerMeaning * meaning));
  if (budget >= 2 && chance(ctx.rng, B.threadChance)) {
    for (const t of shuffle(ctx.rng, THREADS.filter((x) => !x.context && cooled(x) && x.when(state, h)))) {
      const lines = planThread(state, ctx.rng, t, null);
      if (lines && lines.length <= budget) { postThread(ctx, t, lines); budget -= lines.length; break; }
    }
  }
  // Recently used template lines are kept in flags so the feed does not loop.
  const recent = state.flags.recentChat ?? [];
  for (let i = 0; i < budget; i++) {
    const p = pick(ctx.rng, team);
    const pool = eraLines(state, CHATTER[chatterKey(state, p)]).filter((line) => !recent.includes(line));
    for (let tries = 0; tries < 4 && pool.length; tries++) {
      const line = pick(ctx.rng, pool);
      const text = fillChat(state, ctx.rng, line, { speaker: p });
      if (text !== null) {
        emitChat(ctx, { person: p, text });
        recent.push(line);
        break;
      }
    }
  }
  state.flags.recentChat = recent.slice(-B.chatMemory);
}

registerSystem('chat', chatSystem, 88);
