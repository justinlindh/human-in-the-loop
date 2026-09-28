import { B } from './balance.js';
import { createRng, shuffle } from './rng.js';
import { seatOf } from './office.js';
import { isIn } from './props.js';
import { MOMENT_TALK, CELEBRATION_TALK } from '../data/moment-talk.js';

// Who can speak for a staged moment: the person the stage names, then the subject, then people in the office
// seated within B.momentTalkRadius tiles of the prop. Someone with no seat is only in range when named.
export function momentCast(state, decision) {
  const here = state.staff.filter(isIn), st = decision.stage;
  const onTile = Number.isFinite(st?.x) && Number.isFinite(st?.y);
  const distance = (p) => {
    const seat = seatOf(state, p.id);
    return seat && onTile ? Math.hypot(seat[0] - st.x, seat[1] - st.y) : Infinity;
  };
  const named = new Set([st?.staffId, decision.subjectId].filter(Boolean));
  if (decision.eventId === 'first_user_test') for (const p of here) if (p.founder) named.add(p.id);
  const near = here.filter((p) => named.has(p.id) || distance(p) <= B.momentTalkRadius);
  const pool = near.length ? near : onTile ? [...here].sort((a, b) => distance(a) - distance(b)).slice(0, 1) : here;
  return pool.sort((a, b) => Number(b.id === st?.staffId) - Number(a.id === st?.staffId)
    || Number(named.has(b.id)) - Number(named.has(a.id)) || distance(a) - distance(b));
}

// Cosmetic draws come from a stream of their own, so they never advance the game's RNG.
function momentRng(state, eventId) {
  let seed = (state.seed >>> 0) + state.week;
  for (const c of eventId) seed = Math.imul(seed, 31) + c.charCodeAt(0);
  return createRng((seed + (state.flags.momentSaySeq ?? 0)) >>> 0);
}

// Lines not heard recently come first, so a moment that comes back picks different words.
function draw(state, rng, decision, choice) {
  const pool = MOMENT_TALK[decision.eventId] ?? CELEBRATION_TALK[decision.eventId];
  const lines = choice == null ? pool?.open : pool?.choices?.[choice];
  if (!lines) return [];
  const recent = state.flags.momentRecent ?? [];
  const shuffled = shuffle(rng, lines);
  return [...shuffled.filter((t) => !recent.includes(t)), ...shuffled.filter((t) => recent.includes(t))];
}

// Speaks a moment's own lines: up to B.momentTalkLines when it opens, one when a choice is made.
export function emitMomentTalk(ctx, decision, choice = null) {
  const { state } = ctx;
  const rng = momentRng(state, decision.eventId);
  const lines = draw(state, rng, decision, choice);
  if (!lines.length) return;
  let cast = momentCast(state, decision);
  const named = new Set([decision.stage?.staffId, decision.subjectId].filter(Boolean));
  // An untiled moment (a party) has the whole office in range: the named go first, the rest in a random order.
  if (!Number.isFinite(decision.stage?.x)) cast = [...cast.filter((p) => named.has(p.id)), ...shuffle(rng, cast.filter((p) => !named.has(p.id)))];
  const count = Math.min(choice == null ? B.momentTalkLines : 1, cast.length, lines.length);
  const recent = (state.flags.momentRecent ??= []);
  for (let i = 0; i < count; i++) {
    state.flags.momentSaySeq = (state.flags.momentSaySeq ?? 0) + 1;
    ctx.emit({ type: 'say', id: `momentSay${state.flags.momentSaySeq}`, week: state.week,
      staffId: cast[i].id, text: lines[i], toId: null, replyTo: null, moment: decision.eventId });
    recent.push(lines[i]);
  }
  if (recent.length > B.momentTalkMemory) recent.splice(0, recent.length - B.momentTalkMemory);
}

// At the end of the week, after restaging: a decision or staged prompt that opened this week speaks its
// opening lines with its final cast. Otherwise a launch, award or party gets a line or two, at most once
// every B.partyTalkGapWeeks. Ordinary chatter is left alone; the renderer drops unmarked lines near a moment.
export function momentTalkSystem(ctx) {
  const { state } = ctx;
  const week = [...ctx.events];
  let spoke = false;
  if (state.pendingDecision?.stage && week.some((e) => e.type === 'decision')) {
    emitMomentTalk(ctx, state.pendingDecision);
    spoke = true;
  }
  for (const e of week) {
    if (e.type !== 'chatPrompt') continue;
    const p = (state.chatPrompts ?? []).find((x) => x.id === e.promptId && !x.resolved);
    if (p?.stage && MOMENT_TALK[p.kind]) { emitMomentTalk(ctx, { ...p, eventId: p.kind }); spoke = true; }
  }
  if (spoke || week.some((e) => e.type === 'incentive')) return;
  const party = week.find((e) => CELEBRATION_TALK[e.type]);
  const last = state.flags.partyTalkWeek;
  if (!party || (last !== undefined && state.week - last < B.partyTalkGapWeeks)) return;
  state.flags.partyTalkWeek = state.week;
  emitMomentTalk(ctx, { eventId: party.type, subjectId: party.staffId ?? null, stage: { anchor: 'screens' } });
}
