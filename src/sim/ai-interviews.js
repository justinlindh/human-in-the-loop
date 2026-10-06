import { B } from './balance.js';
import { createRng, chance, pick, range, int, shuffle } from './rng.js';
import { registerSystem, registerAction } from './registry.js';
import { emitChat } from './chat.js';
import { raiseDecision } from './events.js';
import { makeCandidate, hireCandidate, removeStaff } from './staff.js';
import {
  CALIBRATE_LINES, INTERVIEW_CHATTER, REVEAL_LINES, WATCH_QUESTIONS, FOLLOW_UPS, CATCH_LINES, WRONG_REJECT_LINES, EXPOSED_LINES,
} from '../data/ai-interviews.js';

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

// Spot the AI: the player watches one interview tape and decides whether the candidate is a person. The
// card carries what render and ui show (tells, decoy, transcript); whether it is an AI stays in flags.aiWatch.
export const TELLS = ['glitch', 'loopBackground', 'loopBlink', 'lensEyes'];
export const DECOYS = ['cat', 'freeze', 'glare', 'leaver'];
const STAGED_TELLS = TELLS.slice(0, 3);

const fillCompany = (state, text) => text.replaceAll('{company}', state.companyName);

function watchTape(state, c) {
  const rng = sideRng(state, 5);
  const ai = chance(rng, B.aiInterviews.watchAiChance);
  let tells = [];
  let decoy = null;
  if (ai) {
    tells = shuffle(rng, STAGED_TELLS).slice(0, 2);
    if (chance(rng, B.aiInterviews.thirdTellChance)) tells.push(pick(rng, [...STAGED_TELLS.filter((t) => !tells.includes(t)), 'lensEyes']));
    if (chance(rng, B.aiInterviews.aiDecoyChance)) decoy = pick(rng, DECOYS);
  } else {
    decoy = pick(rng, DECOYS);
  }
  const asked = shuffle(rng, WATCH_QUESTIONS).slice(0, 2);
  const spoken = int(rng, 0, 1);
  const lines = [];
  let followUp = pick(rng, FOLLOW_UPS.ai);
  asked.forEach((q, i) => {
    lines.push({ who: 'Interviewer', text: q.q });
    if (!ai) {
      const h = pick(rng, q.human);
      lines.push({ who: c.name, text: h.a });
      followUp = h.f;
    } else {
      lines.push({ who: c.name, text: i === spoken ? pick(rng, q.ai) : q.bland });
    }
  });
  for (const l of lines) l.text = fillCompany(state, l.text);
  return { ai, followUp: fillCompany(state, followUp), vars: { candidateId: c.id, tells, decoy, lines } };
}

// Opens the card on a candidate. asked: the player opened it, so it skips the gap after the last decision.
function openWatch(ctx, c, { asked }) {
  const { state } = ctx;
  const tape = watchTape(state, c);
  if (!raiseDecision(ctx, 'ai_interview_watch', c.id, { asked, vars: tape.vars })) return false;
  c.watched = true;
  state.flags.aiWatch = { candidateId: c.id, name: c.name, ai: tape.ai, followUp: tape.followUp, asked: false };
  return true;
}

registerAction('watchInterview', (ctx, { candidateId }) => {
  const { state } = ctx;
  if (!interviewsOn(state)) return { ok: false, reason: 'AI interviews are off' };
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return { ok: false, reason: 'No such candidate' };
  if (c.watched) return { ok: false, reason: 'Already watched' };
  if (state.pendingDecision) return { ok: false, reason: 'Finish the open decision first' };
  if (!openWatch(ctx, c, { asked: true })) return { ok: false, reason: 'Not right now' };
  return { ok: true };
});

registerAction('askFollowUp', (ctx) => {
  const { state } = ctx;
  const w = state.flags.aiWatch;
  const d = state.pendingDecision;
  if (!w || d?.eventId !== 'ai_interview_watch') return { ok: false, reason: 'No interview open' };
  if (w.asked) return { ok: false, reason: 'Already asked' };
  w.asked = true;
  d.vars.lines.push({ who: w.name, text: w.followUp });
  return { ok: true };
});

const clamp100 = (n) => Math.max(0, Math.min(100, n));

// The watch card's two choices. Hire has passed hireProblem by the time this runs.
export function watchOutcome(ctx, kind, candidateId) {
  const { state } = ctx;
  const w = state.flags.aiWatch;
  delete state.flags.aiWatch;
  const ai = !!w?.ai;
  const rng = sideRng(state, 6);
  if (kind === 'hire') {
    hireCandidate(ctx, candidateId);
    if (ai) (state.flags.aiPlanted ??= []).push({ staffId: candidateId, week: state.week + int(rng, ...B.aiInterviews.exposeWeeks) });
    return;
  }
  const c = state.candidates.find((x) => x.id === candidateId);
  state.candidates = state.candidates.filter((x) => x.id !== candidateId);
  const who = others(state, null);
  if (ai) {
    state.brand = clamp100(state.brand + B.aiInterviews.catchBrand);
    for (const p of state.staff) p.meaning = clamp100(p.meaning + B.aiInterviews.catchMeaning);
    if (who.length) emitChat(ctx, { channel: 'general', person: pick(rng, who), text: pick(rng, CATCH_LINES) });
  } else {
    state.brand = clamp100(state.brand + B.aiInterviews.wrongRejectBrand);
    const text = pick(rng, WRONG_REJECT_LINES).replaceAll('{name}', c?.name ?? w?.name ?? 'The candidate');
    if (who.length) emitChat(ctx, { channel: 'random', person: pick(rng, who), text });
    else ctx.emit({ type: 'toast', text, tone: 'warn' });
  }
}

// A hired AI walks out with its credentials: a little brand and some cash, never the whole runway.
function expose(ctx, p) {
  const { state } = ctx;
  removeStaff(state, p);
  state.cash -= Math.min(B.aiInterviews.exposeCash, Math.max(0, state.cash) * B.aiInterviews.exposeCashShare);
  state.brand = clamp100(state.brand + B.aiInterviews.exposeBrand);
  // It walks out like anyone leaving; an agent leaving is not counted as a resignation.
  ctx.emit({ type: 'resign', staffId: p.id, name: p.name, fired: false, reason: 'exposed' });
  ctx.emit({ type: 'aiHireExposed', staffId: p.id });
  const text = pick(sideRng(state, 7), EXPOSED_LINES).replaceAll('{name}', p.name);
  const who = others(state, null);
  if (who.length) emitChat(ctx, { channel: 'general', person: pick(sideRng(state, 8), who), text });
  else ctx.emit({ type: 'toast', text, tone: 'warn' });
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
  const planted = state.flags.aiPlanted;
  if (planted?.length) {
    const due = planted.filter((x) => state.week >= x.week);
    state.flags.aiPlanted = planted.filter((x) => state.week < x.week);
    for (const x of due) {
      const p = state.staff.find((s) => s.id === x.staffId);
      if (p) expose(ctx, p);
    }
  }
  if (!interviewsOn(state)) return;
  const rng = sideRng(state, 4);
  // The first tape after the policy goes on arrives by itself, at the first refresh of the pool.
  if (state.flags.aiCalibrated && !state.flags.aiWatchShown && state.candidatesWeek > (state.flags.aiWatchFrom ?? Infinity) && !state.pendingDecision) {
    const fresh = state.candidates.filter((c) => !c.watched);
    if (fresh.length && openWatch(ctx, pick(rng, fresh), { asked: false })) state.flags.aiWatchShown = true;
  }
  if (!state.flags.aiCalibrated) {
    state.flags.aiCalibrated = true;
    state.flags.aiWatchFrom = state.candidatesWeek;
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
