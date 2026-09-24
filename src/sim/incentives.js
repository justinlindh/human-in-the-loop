import { B } from './balance.js';
import { pick, shuffle } from './rng.js';
import { newId } from './util.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { outputMult } from './staff.js';
import { testPurpose } from './purpose.js';
import { INCENTIVES } from '../data/incentives.js';

const inOffice = (p) => p.mood !== 'away' && !p.remote;

// The Incentives Program: every couple of months the top performer gets the next reward on the ladder.
// It buys a burst of output that shrinks with every reward (incentive fatigue), a happy winner, a slightly
// envious team, and a little Purpose lost each time: it is the shortcut, not the answer.
export function incentivesSystem(ctx) {
  const { state, rng } = ctx;
  if (!state.policies.incentives) return;
  // The first reward comes a couple of weeks after the program starts.
  state.flags.incentiveWeek ??= state.week - B.incentiveEveryWeeks + 2;
  if (state.week - state.flags.incentiveWeek < B.incentiveEveryWeeks) return;
  const eligible = state.staff.filter((p) => !p.founder && inOffice(p) && p.assignment.type !== 'idle');
  if (!eligible.length) return;
  const winner = eligible.reduce((a, b) => (outputMult(state, b) * b.level > outputMult(state, a) * a.level ? b : a));
  const count = state.flags.incentiveCount ?? 0;
  const reward = INCENTIVES[Math.min(count, INCENTIVES.length - 1)];
  state.flags.incentiveWeek = state.week;
  state.flags.incentiveCount = count + 1;

  winner.meaning = Math.min(100, winner.meaning + B.incentiveWinnerMeaning);
  for (const p of state.staff) if (p !== winner) p.meaning = Math.max(0, p.meaning - B.incentiveEnvy);
  const boost = Math.max(0, B.incentiveOutput - B.incentiveFatigue * count);
  if (boost > 0) {
    state.modifiers.push({ id: newId(state, 'mod'), key: 'output', value: boost, label: 'Incentives Program', untilWeek: state.week + B.incentiveEveryWeeks, source: 'incentives' });
  }
  testPurpose(state, { craft: -2, people: -3, trust: -1 }, 'The Incentives Program');

  ctx.emit({ type: 'incentive', staffId: winner.id, reward: reward.id });
  ctx.emit({ type: 'toast', text: `Incentives Program: ${winner.name} wins ${reward.name}.`, tone: 'good' });
  stageTalk(ctx, winner, reward);
}

// Onlookers whisper, the winner says something awkward, and Slackk speculates.
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
    const root = emitChat(ctx, { channel: 'random', person: posters[0], text: fill(pick(rng, reward.slack.post)), kind: 'win' });
    if (posters[1]) emitChat(ctx, { channel: 'random', person: posters[1], text: fill(pick(rng, reward.slack.replies)), replyTo: root.id });
  }
}

registerSystem('incentives', incentivesSystem, 51);
