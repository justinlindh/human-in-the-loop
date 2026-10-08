import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGame, dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { POLICIES } from '../../src/data/policies.js';
import { EVENTS } from '../../src/data/events.js';
import { checkUnlocks } from '../../src/sim/unlocks.js';
import { refreshCandidates, STATS } from '../../src/sim/staff.js';
import { aiInterviewSystem } from '../../src/sim/ai-interviews.js';
import { raiseDecision } from '../../src/sim/events.js';
import { staffUpkeep } from '../../src/sim/staff.js';
import { addDesks, addStaff, expectFail, pinPacing } from './helpers.js';

pinPacing({ askQueue: false, askExpiry: false });

// An Agents-era company with desks free, cash in hand and the policy unlocked.
function company(seed = 3) {
  const s = createGame({ seed, startEra: 'agents' });
  s.cash = 500000;
  s.week = 40;
  addDesks(s, 6);
  for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0, meaning: 60 });
  for (let i = 0; i < 3; i++) checkUnlocks(makeCtx(s));
  return s;
}
const weekOf = (s) => { const ctx = makeCtx(s); aiInterviewSystem(ctx); return ctx.events; };
const skillSum = (p) => STATS.reduce((n, k) => n + p.skills[k], 0);

let enabled;
beforeEach(() => { enabled = B.aiInterviews.enabled; B.aiInterviews.enabled = true; });
afterEach(() => { B.aiInterviews.enabled = enabled; });

describe('issue #670: AI job interviews', () => {
  it('ships on: the policy and Spot the AI are in the game', () => {
    expect(enabled).toBe(true);
  });

  it('with the flag off, the policy never unlocks and cannot be set', () => {
    B.aiInterviews.enabled = false;
    const s = company();
    expect(POLICIES.ai_interviews.unlock(s)).toBe(false);
    expectFail(expect, dispatch, s, { type: 'setPolicy', id: 'ai_interviews', on: true }, POLICIES.ai_interviews.lockText);
    expect(weekOf(s)).toEqual([]);
  });

  it('arrives with the Agents era, and only then', () => {
    expect(POLICIES.ai_interviews.unlock(company())).toBe(true);
    expect(POLICIES.ai_interviews.unlock(createGame({ seed: 3 }))).toBe(false);
  });

  it('switching it on asks the team to help calibrate it, once: a meaning dip and a groan in Yak', () => {
    const s = company();
    expect(dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: true }).ok).toBe(true);
    const before = s.staff.map((p) => p.meaning);
    const ev = weekOf(s);
    expect(s.staff.map((p) => p.meaning)).toEqual(before.map((m) => Math.max(0, m + B.aiInterviews.calibrateMeaning)));
    expect(ev.some((e) => e.type === 'chat')).toBe(true);
    const again = s.staff.map((p) => p.meaning);
    weekOf(s);
    expect(s.staff.map((p) => p.meaning)).toEqual(again);
  });

  it('hiring through it is cheaper, costs a little brand, and the first hire is staged', () => {
    const s = company(), plain = company();
    dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: true });
    const c = s.candidates[0], cash = s.cash;
    const res = dispatch(s, { type: 'hire', candidateId: c.id });
    expect(res.ok).toBe(true);
    dispatch(plain, { type: 'hire', candidateId: plain.candidates[0].id });
    expect(cash - s.cash).toBeCloseTo((cash - plain.cash) * B.aiInterviews.feeMult, 6);
    expect(s.brand).toBeCloseTo(plain.brand + B.aiInterviews.brandPerHire, 6);
    expect(res.events.find((e) => e.type === 'aiInterview')).toEqual({ type: 'aiInterview', candidateId: c.id, staffId: c.id, staged: true });
    const keep = B.aiInterviews.stageChance;
    B.aiInterviews.stageChance = 0;
    let next;
    try { next = dispatch(s, { type: 'hire', candidateId: s.candidates[0].id }); } finally { B.aiInterviews.stageChance = keep; }
    expect(next.events.find((e) => e.type === 'aiInterview').staged).toBe(false);
  });

  it('the pool refreshes sooner with one more candidate', () => {
    const s = company();
    dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: true });
    refreshCandidates(s);
    expect(s.candidates).toHaveLength(B.candidateCount + B.aiInterviews.extraCandidates);
    s.week += B.aiInterviews.refreshWeeks;
    const ids = s.candidates.map((c) => c.id);
    staffUpkeep(makeCtx(s));
    expect(s.candidates.map((c) => c.id)).not.toEqual(ids);
  });

  it('a candidate whose own AI took the interview looks better than they are, until a few weeks after hire', () => {
    const s = company();
    dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: true });
    const keep = B.aiInterviews.gamerChance;
    B.aiInterviews.gamerChance = 1;
    try { refreshCandidates(s); } finally { B.aiInterviews.gamerChance = keep; }
    const c = s.candidates[0];
    const listed = skillSum(c);
    expect(s.flags.aiPolish[c.id]).toBeTruthy();
    dispatch(s, { type: 'hire', candidateId: c.id });
    for (let i = 0; i < B.aiInterviews.revealWeeks - 1; i++) { s.week++; expect(weekOf(s).some((e) => e.type === 'interviewReveal')).toBe(false); }
    s.week++;
    const ev = weekOf(s);
    const reveal = ev.find((e) => e.type === 'interviewReveal');
    expect(reveal.staffId).toBe(c.id);
    const p = s.staff.find((x) => x.id === c.id);
    expect(skillSum(p)).toBe(listed - reveal.drop);
    expect(reveal.drop).toBeGreaterThan(0);
    expect(ev.some((e) => e.type === 'chat')).toBe(true);
    expect(s.flags.aiPolish[c.id]).toBeUndefined();
  });

  it('a polished candidate hired after the policy is switched off still shows their real skills later', () => {
    const s = company();
    dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: true });
    const keep = B.aiInterviews.gamerChance;
    B.aiInterviews.gamerChance = 1;
    try { refreshCandidates(s); } finally { B.aiInterviews.gamerChance = keep; }
    const c = s.candidates[0];
    const listed = skillSum(c);
    dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: false });
    const res = dispatch(s, { type: 'hire', candidateId: c.id });
    expect(res.events.some((e) => e.type === 'aiInterview')).toBe(false);
    s.week += B.aiInterviews.revealWeeks;
    const reveal = weekOf(s).find((e) => e.type === 'interviewReveal');
    expect(reveal.staffId).toBe(c.id);
    expect(skillSum(s.staff.find((x) => x.id === c.id))).toBe(listed - reveal.drop);
    expect(s.flags.aiPolish[c.id]).toBeUndefined();
  });

  it('wider rolls and gamed candidates never touch the main random stream', () => {
    const a = company(), b = company();
    const keep = B.aiInterviews.extraCandidates;
    B.aiInterviews.extraCandidates = 0;
    try {
      dispatch(a, { type: 'setPolicy', id: 'ai_interviews', on: true });
      refreshCandidates(a);
      B.aiInterviews.enabled = false;
      refreshCandidates(b);
    } finally { B.aiInterviews.extraCandidates = keep; }
    expect(a.rng).toEqual(b.rng);
    expect(a.candidates.map((c) => c.role)).toEqual(b.candidates.map((c) => c.role));
  });

  it('two AIs interviewing each other: let them finish, pull the plug, or hire the AI', () => {
    const ev = EVENTS.ai_interview_loop;
    expect(ev.choices.map((c) => c.label)).toEqual(['Let them finish', 'Pull the plug', 'Hire the AI']);
    const s = company();
    dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: true });
    s.pendingDecision = null;
    s.week += B.decisionGapWeeks;
    expect(raiseDecision(makeCtx(s), 'ai_interview_loop', null)).toBe(true);
    const n = s.candidates.length;
    dispatch(s, { type: 'resolveDecision', choice: 0 });
    expect(s.candidates).toHaveLength(n + 1);
    expect(s.flags.aiPolish[s.candidates.at(-1).id]).toBeTruthy();
    const t = company();
    dispatch(t, { type: 'setPolicy', id: 'ai_interviews', on: true });
    t.pendingDecision = null;
    t.week += B.decisionGapWeeks;
    expect(raiseDecision(makeCtx(t), 'ai_interview_loop', null)).toBe(true);
    const eng = t.automation.engineering.level;
    dispatch(t, { type: 'resolveDecision', choice: 2 });
    expect(t.automation.engineering.level).toBeGreaterThan(eng);
  });
});
