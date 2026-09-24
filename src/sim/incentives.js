import { B } from './balance.js';
import { pick, shuffle, int } from './rng.js';
import { newId } from './util.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { outputMult } from './staff.js';
import { testPurpose } from './purpose.js';
import { INCENTIVES } from '../data/incentives.js';
import { raiseDecision } from './events.js';

// The timed ladder; the Waffle Party is earned by a milestone instead.
const LADDER = INCENTIVES.filter((r) => r.id !== 'waffle_party');

const inOffice = (p) => p.mood !== 'away' && !p.remote;

// The Incentives Program: every couple of months the top performer gets the next reward on the ladder.
// It buys a burst of output that shrinks with every reward (incentive fatigue), a happy winner, a slightly
// envious team, and a little Purpose lost each time: it is the shortcut, not the answer.
export function incentivesSystem(ctx) {
  const { state, rng } = ctx;
  if (!state.policies.incentives) return;
  waffleMilestone(ctx);
  // The first reward comes a couple of weeks after the program starts.
  state.flags.incentiveWeek ??= state.week - B.incentiveEveryWeeks + 2;
  if (state.week - state.flags.incentiveWeek < B.incentiveEveryWeeks) return;
  const eligible = state.staff.filter((p) => !p.founder && inOffice(p) && p.assignment.type !== 'idle');
  if (!eligible.length) return;
  const winner = eligible.reduce((a, b) => (outputMult(state, b) * b.level > outputMult(state, a) * a.level ? b : a));
  const count = state.flags.incentiveCount ?? 0;
  const reward = LADDER[Math.min(count, LADDER.length - 1)];
  state.flags.incentiveWeek = state.week;
  state.flags.incentiveCount = count + 1;
  if (reward.id === 'music_night') {
    // The winner picks the music first; the reward and the dance break happen when the decision resolves.
    state.flags.musicNightWinner = winner.id;
    state.flags.musicNightCount = count;
    raiseDecision(ctx, 'music_night_genre', winner.id, { queue: true });
    return;
  }
  award(ctx, winner, reward, count);
  ctx.emit({ type: 'incentive', staffId: winner.id, reward: reward.id });
  ctx.emit({ type: 'toast', text: `Incentives Program: ${winner.name} wins ${reward.name}.`, tone: 'good' });
  stageTalk(ctx, winner, reward);
}

// What every reward does: a happy winner, a slightly envious team, a fading burst of output, and a
// little Purpose lost.
function award(ctx, winner, reward, count) {
  const { state } = ctx;
  winner.meaning = Math.min(100, winner.meaning + B.incentiveWinnerMeaning);
  for (const p of state.staff) if (p !== winner) p.meaning = Math.max(0, p.meaning - B.incentiveEnvy);
  // Each reward's boost is named for the reward and runs until the next award replaces it quietly; only
  // the last one, when the program stops, ends with a toast.
  const boost = Math.max(0, B.incentiveOutput - B.incentiveFatigue * count);
  state.modifiers = state.modifiers.filter((m) => m.source !== 'incentives');
  if (boost > 0) {
    state.modifiers.push({ id: newId(state, 'mod'), key: 'output', value: boost, label: `The glow of ${reward.short}`, untilWeek: state.week + B.incentiveEveryWeeks + 1, source: 'incentives' });
  }
  testPurpose(state, { craft: -2, people: -3, trust: -1 }, 'The Incentives Program');
}

// Music night, once the winner has picked a genre: the winner and a few people nearby dance.
export function danceBreak(ctx, genre) {
  const { state, rng } = ctx;
  const winner = state.staff.find((p) => p.id === state.flags.musicNightWinner);
  const count = state.flags.musicNightCount ?? 0;
  delete state.flags.musicNightWinner;
  delete state.flags.musicNightCount;
  if (!winner) return;
  const reward = INCENTIVES.find((r) => r.id === 'music_night');
  award(ctx, winner, reward, count);
  const crowd = shuffle(rng, state.staff.filter((p) => p !== winner && inOffice(p)));
  const dancers = [winner.id, ...crowd.slice(0, int(rng, B.musicNightDancers[0], B.musicNightDancers[1])).map((p) => p.id)];
  ctx.emit({ type: 'incentive', staffId: winner.id, reward: 'music_night', genre, dancers });
  ctx.emit({ type: 'toast', text: `Incentives Program: ${winner.name} wins ${reward.name}. The genre is ${GENRES[genre]}.`, tone: 'good' });
  stageTalk(ctx, winner, reward);
}

export const GENRES = {
  corporate_synthwave: 'Corporate Synthwave', motivational_polka: 'Motivational Polka',
  aggressive_bossa_nova: 'Aggressive Bossa Nova', sad_lofi: 'Sad Lo-fi',
};

// The Waffle Party is earned, not scheduled: someone crosses a big personal milestone (their
// waffleLaunches-th shipped launch, or the top level), at most once each and once per waffleCooldownWeeks.
function waffleMilestone(ctx) {
  const { state, rng } = ctx;
  const won = (state.flags.waffleWinners ??= []);
  if (state.flags.waffleWeek !== undefined && state.week - state.flags.waffleWeek < B.waffleCooldownWeeks) return;
  const shipped = state.flags.shippedBy ?? {};
  for (const p of state.staff) {
    if (p.founder || p.mood === 'away' || won.includes(p.id)) continue;
    const launches = shipped[p.id] ?? 0;
    const milestone = launches >= B.waffleLaunches ? 'launches' : p.level >= B.waffleLevel ? 'level' : null;
    if (!milestone) continue;
    const count = milestone === 'launches' ? launches : p.level;
    won.push(p.id);
    state.flags.waffleWeek = state.week;
    // The party is the event of the season: the timed ladder waits a full round after it.
    state.flags.incentiveWeek = state.week;
    const reward = INCENTIVES.find((r) => r.id === 'waffle_party');
    award(ctx, p, reward, 0);
    const first = p.name.split(' ')[0];
    ctx.emit({ type: 'incentive', staffId: p.id, reward: 'waffle_party', milestone, count });
    ctx.emit({ type: 'toast', text: `${p.name} earned THE WAFFLE PARTY.`, tone: 'good' });
    const why = milestone === 'launches' ? `${first} just shipped their ${ordinal(count)} launch` : `${first} just reached level ${count}`;
    emitChat(ctx, { channel: 'wins', from: '@officebot', text: `${why}. Waffles have been authorised.` });
    stageTalk(ctx, p, reward);
    return;
  }
}

const ordinal = (n) => {
  const words = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
    'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
  return words[n] ?? `${n}th`;
};

// Onlookers whisper, the winner says something awkward, and Yak speculates.
function stageTalk(ctx, winner, reward) {
  const { state, rng } = ctx;
  const name = winner.name.split(' ')[0];
  const fill = (t) => t.replaceAll('{winner}', name);
  const say = (person, text, to, replyTo) => {
    const e = { type: 'say', id: newId(state, 'v'), week: state.week, staffId: person.id, text: fill(text), toId: to?.id ?? null, replyTo: replyTo?.id ?? null };
    ctx.emit(e);
    return e;
  };
  const watchers = shuffle(rng, state.staff.filter((p) => p !== winner && inOffice(p)));
  let prev = null;
  if (watchers.length >= 2) {
    const [a, b] = watchers;
    for (const [role, variants] of reward.onlookers) {
      const who = role === 'a' ? a : b;
      prev = say(who, pick(rng, variants), who === a ? b : a, prev);
    }
  }
  if (inOffice(winner)) say(winner, pick(rng, reward.winner), null, null);
  const posters = shuffle(rng, state.staff.filter((p) => p !== winner && p.mood !== 'away'));
  if (posters.length) {
    const root = emitChat(ctx, { channel: 'random', person: posters[0], text: fill(pick(rng, reward.chat.post)), kind: 'win' });
    if (posters[1]) emitChat(ctx, { channel: 'random', person: posters[1], text: fill(pick(rng, reward.chat.replies)), replyTo: root.id });
  }
}

registerSystem('incentives', incentivesSystem, 51);

// Dev and capture only: sets up a reward so the next tick stages it, whatever the ladder position. A tick
// does nothing while a decision is pending, so resolve any open decision before ticking.
// 'music_night' makes it the next timed reward (its genre decision follows); 'waffle_party' puts the top
// performer at the launch milestone with the cooldown clear. Turns the program on. Returns the staff id.
export function stageIncentive(state, reward) {
  state.policies.incentives = true;
  const pool = state.staff.filter((p) => !p.founder && inOffice(p));
  const who = pool.sort((a, b) => b.level - a.level)[0];
  if (!who) return null;
  if (reward === 'music_night') {
    state.flags.incentiveCount = LADDER.findIndex((r) => r.id === 'music_night');
    state.flags.incentiveWeek = state.week - B.incentiveEveryWeeks;
  } else if (reward === 'waffle_party') {
    (state.flags.shippedBy ??= {})[who.id] = B.waffleLaunches;
    state.flags.incentiveWeek = state.week;
    state.flags.waffleWinners = (state.flags.waffleWinners ?? []).filter((id) => id !== who.id);
    delete state.flags.waffleWeek;
  }
  return who.id;
}
