import { B } from './balance.js';
import { createRng, shuffle } from './rng.js';
import { seatOf } from './office.js';
import { isIn } from './props.js';
import { MOMENT_TALK, CELEBRATION_TALK } from '../data/moment-talk.js';

// The sim knows desk tiles; the renderer also guards people who walk into the scene.
export function momentCast(state, decision) {
  const here = state.staff.filter(isIn), st = decision.stage;
  const distance = (p) => {
    const seat = seatOf(state, p.id);
    return seat && Number.isFinite(st?.x) && Number.isFinite(st?.y)
      ? Math.hypot(seat[0] - st.x, seat[1] - st.y) : 0;
  };
  const named = new Set([st?.staffId, decision.subjectId]);
  if (decision.eventId === 'first_user_test') for (const p of here) if (p.founder) named.add(p.id);
  const near = here.filter(p => named.has(p.id) || distance(p) <= B.momentTalkRadius);
  const pool = near.length ? near : [...here].sort((a, b) => distance(a) - distance(b)).slice(0, 1);
  return pool.sort((a, b) => Number(b.id === st?.staffId) - Number(a.id === st?.staffId)
    || Number(named.has(b.id)) - Number(named.has(a.id)) || distance(a) - distance(b));
}

function draw(state, decision, choice) {
  const pool = MOMENT_TALK[decision.eventId] ?? CELEBRATION_TALK[decision.eventId];
  if (!pool) return [];
  const lines = choice == null ? pool.open : pool.choices[choice];
  if (!lines) return [];
  // Cosmetic draws and ids never advance the economy's RNG or shared id counter.
  let seed = state.seed + state.week;
  for (const c of decision.eventId) seed = Math.imul(seed, 31) + c.charCodeAt(0);
  return shuffle(createRng(seed + (state.flags.momentSaySeq ?? 0)), lines);
}

export function emitMomentTalk(ctx, decision, choice = null) {
  const cast = momentCast(ctx.state, decision), lines = draw(ctx.state, decision, choice);
  const count = choice == null ? Math.min(B.momentTalkLines, cast.length) : Math.min(1, cast.length);
  for (let i = 0; i < count && i < lines.length; i++) {
    ctx.state.flags.momentSaySeq = (ctx.state.flags.momentSaySeq ?? 0) + 1;
    ctx.emit({ type: 'say', id: `momentSay${ctx.state.flags.momentSaySeq}`, week: ctx.state.week,
      staffId: cast[i].id, text: lines[i], toId: null, replyTo: null, moment: decision.eventId });
  }
}

// Runs after ordinary talk and restaging, so nudges and exchanges cannot give the cast an unrelated line.
export function momentTalkSystem(ctx) {
  const decisions = [ctx.state.pendingDecision, ...(ctx.state.chatPrompts ?? [])
    .filter(p => !p.resolved && p.stage).map(p => ({ ...p, eventId: p.kind }))].filter(d => d?.stage && MOMENT_TALK[d.eventId]);
  const party = ctx.events.find(e => CELEBRATION_TALK[e.type]);
  if (!decisions.length && party && !ctx.events.some(e => e.type === 'incentive')) {
    const d = { eventId: party.type, subjectId: party.staffId, stage: { anchor: 'screens' } };
    decisions.push(d);
    emitMomentTalk(ctx, d);
  }
  for (const d of decisions) {
    const cast = new Set(momentCast(ctx.state, d).map(p => p.id));
    const lines = draw(ctx.state, d, null);
    let n = 0;
    for (const e of ctx.events) {
      if (e.type !== 'say' || e.moment) continue;
      if (!cast.has(e.staffId)) continue;
      Object.assign(e, { text: lines[n++ % lines.length], moment: d.eventId, toId: null, replyTo: null });
    }
  }
}
