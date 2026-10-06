import { B } from './balance.js';
import { createRng, chance, pick, range } from './rng.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { raiseDecision } from './events.js';
import { makeCandidate } from './staff.js';
import { CALIBRATE_LINES, INTERVIEW_CHATTER, REVEAL_LINES } from '../data/ai-interviews.js';

// AI video interviews (#670): a policy from the Agents era. Hiring through it is cheaper and faster, candidates
// roll wider, some had their own AI take the interview (listed skills inflated until a few weeks after hire;
// the gap lives in flags.aiPolish by person id), and each hire costs a little brand. The rolls draw from the
// feature's own stream; only a candidate added by the loop decision uses the main one. A game without the
// policy plays exactly as before.

const SKILLS = ['features', 'polish', 'reliability', 'novelty'];

export const interviewsOn = (state) => B.aiInterviews.enabled && !!state.policies?.ai_interviews;

function sideRng(state, salt) {
  const seq = state.flags.aiSeq = (state.flags.aiSeq ?? 0) + 1;
  return createRng(((state.seed >>> 0) * 8513 + state.week * 577 + seq * 6007 + salt) >>> 0);
}

// A candidate interviewed by the bot: skills spread wider, and maybe polished by their own AI.
export function shapeCandidate(state, c, { gamed = null } = {}) {
  if (!interviewsOn(state)) return c;
  const rng = sideRng(state, 1);
  for (const k of SKILLS) c.skills[k] = Math.round(Math.min(100, Math.max(1, c.skills[k] + range(rng, -B.aiInterviews.spread, B.aiInterviews.spread))));
  if (gamed ?? chance(rng, B.aiInterviews.gamerChance)) {
    const drop = {};
    for (const k of SKILLS) {
      const up = Math.min(B.aiInterviews.polish, 100 - c.skills[k]);
      c.skills[k] += up;
      drop[k] = up;
    }
    (state.flags.aiPolish ??= {})[c.id] = { drop, revealWeek: null };
  }
  return c;
}

// "Let them finish": the candidate whose AI did the talking joins the pool, polish and all.
export function addFinishedCandidate(state) {
  if (!interviewsOn(state)) return;
  const c = makeCandidate(state, 'engineer', 'mid');
  state.candidates.push(shapeCandidate(state, c, { gamed: true }));
}

export const hireFeeMult = (state) => (interviewsOn(state) ? B.aiInterviews.feeMult : 1);

// A hire made through the bot: a little brand, the moment staged on the first one and now and then after,
// and a polished hire's reveal scheduled.
export function onInterviewHire(ctx, c) {
  const { state } = ctx;
  const polish = state.flags.aiPolish?.[c.id];
  if (polish) polish.revealWeek = state.week + B.aiInterviews.revealWeeks;
  if (!interviewsOn(state)) return;
  state.brand = Math.max(0, Math.min(100, state.brand + B.aiInterviews.brandPerHire));
  const first = !state.flags.aiInterviewHires;
  state.flags.aiInterviewHires = (state.flags.aiInterviewHires ?? 0) + 1;
  const staged = first || chance(sideRng(state, 2), B.aiInterviews.stageChance);
  ctx.emit({ type: 'aiInterview', candidateId: c.id, staffId: c.id, staged });
}

const others = (state, not) => state.staff.filter((p) => p.id !== not && !p.founder && p.mood !== 'away');

function reveal(ctx, p, polish) {
  const { state } = ctx;
  let drop = 0;
  for (const [k, n] of Object.entries(polish.drop)) {
    const was = p.skills[k];
    p.skills[k] = Math.max(1, was - n);
    drop += was - p.skills[k];
  }
  delete state.flags.aiPolish[p.id];
  ctx.emit({ type: 'interviewReveal', staffId: p.id, drop });
  const rng = sideRng(state, 3);
  const teller = pick(rng, others(state, p.id).length ? others(state, p.id) : state.staff);
  emitChat(ctx, { channel: 'random', person: teller, text: pick(rng, REVEAL_LINES).replaceAll('{name}', p.name) });
}

export function aiInterviewSystem(ctx) {
  const { state } = ctx;
  if (!B.aiInterviews.enabled) return;
  const polish = state.flags.aiPolish ?? {};
  for (const id of Object.keys(polish)) {
    const p = state.staff.find((x) => x.id === id);
    if (p && polish[id].revealWeek !== null && state.week >= polish[id].revealWeek) reveal(ctx, p, polish[id]);
    else if (!p && !state.candidates.some((c) => c.id === id)) delete polish[id];
  }
  if (!interviewsOn(state)) return;
  const rng = sideRng(state, 4);
  if (!state.flags.aiCalibrated) {
    state.flags.aiCalibrated = true;
    for (const p of state.staff) p.meaning = Math.max(0, p.meaning + B.aiInterviews.calibrateMeaning);
    const who = others(state, null);
    if (who.length) emitChat(ctx, { channel: 'general', person: pick(rng, who), text: pick(rng, CALIBRATE_LINES) });
    return;
  }
  if (chance(rng, B.aiInterviews.chatterChance)) {
    const who = others(state, null);
    if (who.length) emitChat(ctx, { channel: 'random', person: pick(rng, who), text: pick(rng, INTERVIEW_CHATTER) });
  }
  if (!state.pendingDecision && chance(rng, B.aiInterviews.loopChance)) raiseDecision(ctx, 'ai_interview_loop', null);
}

registerSystem('ai-interviews', aiInterviewSystem, 83);
