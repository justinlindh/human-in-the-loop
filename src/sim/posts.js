import { B } from './balance.js';
import { createRng, pick, int, shuffle } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { clamp } from './util.js';
import { emitChat, teamMeaning } from './chat.js';
import { eraLines } from './eras.js';
import { POSTS } from '../data/posts.js';

// The founders' quick posts in Yak (issue #16). Whether a post lands, falls flat or backfires follows from
// the moment; its own stream, seeded by the game seed, the week and a post sequence, picks only the words,
// the repliers and the reactions, so a game where nobody posts plays exactly as one without the feature.

const BY_ID = Object.fromEntries(POSTS.map((p) => [p.id, p]));
const present = (state) => state.staff.filter((p) => p.mood !== 'away' && !p.remote);
const memory = (state) => { const m = (state.flags.posts ??= { lastWeek: null, byId: {}, queue: [] }); m.byId ??= {}; m.queue ??= []; return m; };

const pizzaCost = (state) => B.posts.pizzaPerHead * Math.max(1, present(state).length);
const recentNews = (state) => {
  const since = state.week - B.posts.newsWeeks;
  const launch = state.products.filter((p) => !p.killed && p.launchedWeek >= since).at(-1);
  if (launch) return `${launch.name} is live`;
  const hire = state.staff.filter((p) => !p.founder && p.hiredWeek >= since).at(-1);
  if (hire) return `${hire.name.split(' ')[0]} joined the team`;
  if (Object.values(state.goals ?? {}).some((g) => g.done && g.week >= since)) return 'we hit another milestone';
  return null;
};

// What a post does in this moment: its outcome and the effects that go with it.
const OUTCOMES = {
  pep_talk: (state) => (state.outage || teamMeaning(state) < B.posts.lowMorale
    ? { outcome: 'backfired', teamMeaning: -B.posts.backfire } : { outcome: 'landed', teamMeaning: B.posts.pepTalk }),
  who_broke_prod: (state) => (state.outage
    ? { outcome: 'landed', health: B.posts.fixHealth, teamMeaning: -B.posts.blame } : { outcome: 'backfired', teamMeaning: -B.posts.scare }),
  meme: (state) => (state.outage ? { outcome: 'backfired', teamMeaning: -B.posts.memeBackfire } : { outcome: 'landed', teamMeaning: B.posts.meme }),
  pizza: (state) => ({ outcome: state.outage ? 'backfired' : 'landed', cash: -pizzaCost(state), teamMeaning: B.posts.pizza, stamina: B.posts.pizzaStamina }),
  announcement: (state) => (recentNews(state) ? { outcome: 'landed', teamMeaning: B.posts.news } : { outcome: 'backfired', teamMeaning: -B.posts.backfire }),
};

// Why a post cannot go out right now, or null.
function blocker(state, post) {
  const last = state.flags.posts?.lastWeek ?? null;
  if (last !== null && state.week - last < B.posts.cooldownWeeks) {
    const n = last + B.posts.cooldownWeeks - state.week;
    return state.week === last ? 'Posted recently' : `Ready in ${n} week${n === 1 ? '' : 's'}`;
  }
  if (post.id === 'pizza' && state.cash < pizzaCost(state)) return 'Not enough cash';
  return null;
}

// The posts the picker offers, in a fixed order, with why any of them is greyed out and when it is ready.
export function postOptions(state) {
  if (!B.postsEnabled) return [];
  const last = state.flags.posts?.lastWeek ?? null;
  const ready = last === null ? null : last + B.posts.cooldownWeeks;
  return POSTS.map((p) => {
    const reason = blocker(state, p);
    const hint = p.id === 'pizza' ? `$${pizzaCost(state).toLocaleString('en-US')} for the office; team meaning and stamina up.` : p.hint;
    return { id: p.id, label: p.label, icon: p.icon, hint, channel: p.channel, available: !reason, reason, readyWeek: ready !== null && ready > state.week ? ready : null };
  });
}

const REACTIONS = {
  landed: ['🎉', '👏', '🔥', '💯', '🙌', '❤️'],
  flat: ['👍', '🙂'],
  backfired: ['😬', '👀', '🫠', '💀'],
};

function reactionsFor(state, rng, outcome) {
  const people = present(state).length;
  const set = shuffle(rng, REACTIONS[outcome]).slice(0, outcome === 'landed' ? 3 : 2);
  const most = outcome === 'flat' ? Math.max(1, Math.round(people / 4)) : Math.max(1, Math.round(people * clamp(teamMeaning(state) / 100, 0.2, 1)));
  return Object.fromEntries(set.map((e, i) => [e, Math.max(1, Math.round(most / (i + 1)))]));
}

function applyOutcome(state, fx) {
  if (fx.cash) state.cash += fx.cash;
  for (const p of state.staff) {
    if (fx.teamMeaning) p.meaning = clamp(p.meaning + fx.teamMeaning, 0, 100);
    if (fx.stamina && p.mood !== 'away') p.stamina = clamp(p.stamina + fx.stamina, 0, 100);
  }
  if (fx.health && state.outage) {
    const product = state.products.find((p) => p.id === state.outage.productId);
    if (product) product.health = clamp(product.health + fx.health, 0, 100);
  }
}

registerAction('postMessage', (outer, { id }) => {
  const { state } = outer;
  if (!B.postsEnabled) return { ok: false, reason: 'Posts are off' };
  const post = BY_ID[id];
  if (!post) return { ok: false, reason: 'Unknown message' };
  const why = blocker(state, post);
  if (why) return { ok: false, reason: why };
  const founder = present(state).find((p) => p.founder) ?? state.staff.find((p) => p.founder);
  if (!founder) return { ok: false, reason: 'Unknown message' };
  const m = memory(state);
  state.flags.postSeq = (state.flags.postSeq ?? 0) + 1;
  const rng = createRng(((state.seed >>> 0) * 6151 + state.week * 389 + state.flags.postSeq * 9973) >>> 0);
  const ctx = { ...outer, rng };
  const repeat = m.byId[id] !== undefined && state.week - m.byId[id] < B.posts.repeatWeeks;
  const fx = repeat ? { outcome: 'flat' } : OUTCOMES[id](state);
  const news = recentNews(state);
  const lines = id === 'announcement' && !news ? post.vague : post.text.map((t) => t.replace('{news}', news ?? ''));
  const msg = emitChat(ctx, { channel: post.channel, person: founder, text: pick(rng, eraLines(state, lines)), reactions: reactionsFor(state, rng, fx.outcome) });
  applyOutcome(state, fx);
  // Replies, chosen now and posted over the next week or two: people in the roles that care first, one to three of them.
  const staff = present(state).filter((p) => !p.founder);
  const byRole = (p) => { const i = post.who.indexOf(p.role); return i < 0 ? post.who.length : i; };
  const repliers = shuffle(rng, staff).sort((a, b) => byRole(a) - byRole(b)).slice(0, int(rng, 1, Math.min(3, Math.max(1, staff.length))));
  const used = new Set();
  for (const p of repliers) {
    const tired = p.mood === 'burnout' || p.mood === 'coasting';
    const pool = eraLines(state, (tired && post.replies.tired) || post.replies[fx.outcome]).filter((l) => !used.has(l));
    if (!pool.length) break;
    const text = pick(rng, pool);
    used.add(text);
    m.queue.push({ week: state.week + int(rng, 1, B.posts.replyWeeks), channel: post.channel, fromId: p.id, text, replyTo: msg.id });
  }
  if (fx.outcome === 'backfired') outer.emit({ type: 'toast', text: `That ${post.label.toLowerCase()} did not land.`, tone: 'warn' });
  m.lastWeek = state.week;
  m.byId[id] = state.week;
  outer.emit({ type: 'posted', id, chatId: msg.id, outcome: fx.outcome });
  return { ok: true, outcome: fx.outcome, chatId: msg.id };
});

// Weekly: posts the queued replies that are due, from people still at the company.
export function postsSystem(ctx) {
  const m = ctx.state.flags.posts;
  if (!m?.queue?.length) return;
  const due = m.queue.filter((r) => r.week <= ctx.state.week);
  m.queue = m.queue.filter((r) => r.week > ctx.state.week);
  for (const r of due) {
    const person = ctx.state.staff.find((p) => p.id === r.fromId);
    if (person) emitChat(ctx, { channel: r.channel, person, text: r.text, replyTo: r.replyTo, reactions: {} });
  }
}

registerSystem('posts', postsSystem, 91);
