import { B } from './balance.js';
import { avg, newId, article, clamp } from './util.js';
import { createRng, chance, pick, range, shuffle } from './rng.js';
import { registerSystem } from './registry.js';
import { automationExposure } from './automation.js';
import { CHATTER } from '../data/chatter.js';
import { MODELS } from '../data/models.js';
import { CATEGORIES } from '../data/categories.js';
import { ITEMS } from '../data/items.js';
import { incumbentFor } from '../data/incumbents.js';
import { eraLines } from './eras.js';
import { talkSystem } from './talk.js';

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

// Reaction pills for a message, scaled by its weight. Wins, incidents, farewells and other big posts get a
// spread of reactions that grows with the team's mood; routine chatter usually gets none, or one or two; replies
// rarely get any. Once in a while a trivial post gets an absurd pile of one emoji, as a joke.
export function reactionsFor(state, rng, channel, kind, meaning = teamMeaning(state), { reply = false, important = false } = {}) {
  const byChannel = { wins: 'win', incidents: 'incident', random: 'random' };
  const set = REACTIONS[kind] ?? REACTIONS[byChannel[channel]] ?? REACTIONS.normal;
  const big = !reply && (important || !!REACTIONS[kind] || channel === 'wins' || channel === 'incidents');
  const R = B.reactions;
  if (!big) {
    if (!reply && chance(rng, R.pileOnChance)) return { [pick(rng, set)]: Math.round(range(rng, R.pileOnMin, R.pileOnMax)) };
    if (!chance(rng, (reply ? R.replyChance : R.routineChance) * clamp(meaning / 70, 0.3, 1.2))) return {};
    const n = 1 + (chance(rng, R.routineSecond) ? 1 : 0);
    const out = {};
    for (let i = 0; i < n; i++) { const e = pick(rng, set); out[e] = (out[e] ?? 0) + 1; }
    return out;
  }
  let count = Math.round((meaning / 100) * B.reactionMax * range(rng, 0.3, 1.3));
  if (kind === 'farewell') count = Math.max(1, count);
  if (count <= 0) return {};
  const kinds = Math.min(set.length, count, 1 + Math.floor(meaning / 40));
  const picked = kind === 'farewell' ? [set[0], ...shuffle(rng, set.slice(1))].slice(0, kinds) : shuffle(rng, set).slice(0, kinds);
  const out = Object.fromEntries(picked.map((e) => [e, 1]));
  for (let i = kinds; i < count; i++) out[pick(rng, picked)]++;
  return out;
}

// Reactions draw from a stream of their own, seeded by the game seed and the message's place in the log, so
// how many emoji a post gets never shifts anything else in the game.
function reactionRng(state) {
  state.flags.reactSeq = (state.flags.reactSeq ?? 0) + 1;
  return createRng(((state.seed >>> 0) * 104729 + state.flags.reactSeq * 7919 + state.week * 31) >>> 0);
}

// Emits a Yak chat event in the contract shape. `person` may be a staff object or null for bots.
export function emitChat(ctx, { channel = 'general', person = null, from = person?.name, text, replyTo = null, reactions, kind = null, id = null, important = false }) {
  const msg = {
    type: 'chat', id: id ?? newId(ctx.state, 'm'), week: ctx.state.week, channel, from, fromId: person?.id ?? null, text, replyTo,
    reactions: reactions ?? reactionsFor(ctx.state, reactionRng(ctx.state), channel, kind, teamMeaning(ctx.state), { reply: !!replyTo, important }),
  };
  // A post that matters without being a win, an incident or a bot post (a running joke, a warranted @channel).
  if (important) msg.important = true;
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
    clone: ev.some((e) => e.type === 'chat' && e.from === '@hackerspewsbot')
      ? { product: liveProducts(state).find((p) => p.category === state.flags.lastCloneCategory) ?? null } : null,
    copied: ev.some((e) => e.type === 'toast' && /Sounds familiar/.test(e.text)) ? {} : null,
  };
}

const NUDGES = {
  desks: ['We should probably get desks in here first.', 'I have been sitting on a paint can for a week. Desks?', 'Standing is fine. Standing for a year is not. Desks.'],
  product: ['Desks: done. Now we just need, you know, a product.', 'Should we build something? I feel like we should build something.'],
};

const GROWTH_LINES = [
  'Growth week: {names} all levelled up. Someone get these people a bigger whiteboard.',
  'Level-ups this week: {names}. The skill tree is looking bushy.',
  '{names} levelled up this week. HR has run out of gold stars and is using yellow sticky notes.',
];

// A #wins line when several people levelled up this week. The wording follows the week and the reactions are
// fixed, so it draws nothing from the game's random stream.
export function growthDigest(ctx) {
  const { state } = ctx;
  const ids = [...new Set(ctx.happenings?.levelUps ?? [])];
  if (ids.length < B.growthDigestMin) return;
  const names = ids.map((id) => state.staff.find((p) => p.id === id)?.name.split(' ')[0]).filter(Boolean);
  const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const text = GROWTH_LINES[state.week % GROWTH_LINES.length].replace('{names}', list);
  // Its own id sequence, so the digest never shifts the ids of anything created after it.
  state.flags.growthSeq = (state.flags.growthSeq ?? 0) + 1;
  emitChat(ctx, { channel: 'wins', from: '@hr-bot', text, reactions: { '🎉': names.length, '👏': Math.max(1, names.length - 1) }, id: `mg${state.flags.growthSeq}` });
}

// A founder's nudge toward the first goals in the opening weeks, or null.
function founderNudge(state) {
  if (![1, 4, 9].includes(state.week)) return null;
  const desks = state.office.placed.filter((p) => p.itemId === 'desk').length;
  if (desks < 2) return NUDGES.desks[[1, 4, 9].indexOf(state.week)];
  if (!state.projects.length && !state.products.length) return NUDGES.product[state.week === 1 ? 0 : 1];
  return null;
}

// Weekly Yak: launch announcements, a thread about this week's news, an occasional everyday
// thread, and mood chatter. The number of everyday lines falls as the team's meaning falls.
export function chatSystem(ctx) {
  const { state } = ctx;
  const team = present(state);
  const meaning = teamMeaning(state);

  for (const e of ctx.events.filter((x) => x.type === 'launch')) {
    const p = state.products.find((x) => x.id === e.productId);
    if (p) emitChat(ctx, { channel: 'wins', from: '@launchbot', text: `${p.name} v${p.version} is live. Reviews average ${p.score}.`, kind: 'win' });
  }
  if (!team.length) return;

  growthDigest(ctx);

  const nudge = founderNudge(state);
  if (nudge) {
    const f = pick(ctx.rng, team.filter((p) => p.founder).length ? team.filter((p) => p.founder) : team);
    emitChat(ctx, { person: f, text: nudge });
    ctx.emit({ type: 'say', id: newId(state, 'v'), week: state.week, staffId: f.id, text: nudge, toId: null, replyTo: null });
  }

  // Conversations, spoken and in Yak; then, if nobody posted, an occasional mood line in #general.
  const posted = talkSystem(ctx, happenings(ctx));
  if (posted || !chance(ctx.rng, B.chatSoloChance * clamp(meaning / 70, 0.3, 1.2))) return;
  const recent = state.flags.recentChat ?? [];
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
  state.flags.recentChat = recent.slice(-B.chatMemory);
}

registerSystem('chat', chatSystem, 88);
