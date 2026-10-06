import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGame, dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { checkUnlocks } from '../../src/sim/unlocks.js';
import { refreshCandidates, capacity } from '../../src/sim/staff.js';
import { aiInterviewSystem, TELLS, DECOYS } from '../../src/sim/ai-interviews.js';
import { addDesks, addStaff, expectFail, pinPacing } from './helpers.js';

pinPacing({ askQueue: false, askExpiry: false });

// An Agents-era company with the policy on and calibrated, desks free and cash in hand.
function company(seed = 3) {
  const s = createGame({ seed, startEra: 'agents' });
  s.cash = 500000;
  s.week = 40;
  addDesks(s, 6);
  for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0, meaning: 60 });
  for (let i = 0; i < 3; i++) checkUnlocks(makeCtx(s));
  dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: true });
  aiInterviewSystem(makeCtx(s));
  s.pendingDecision = null;
  return s;
}
const weekOf = (s) => { const ctx = makeCtx(s); aiInterviewSystem(ctx); return ctx.events; };
const watch = (s, c = s.candidates[0]) => dispatch(s, { type: 'watchInterview', candidateId: c.id });
const choice = (s, label) => EVENTS.ai_interview_watch.choices.findIndex((c) => c.label.startsWith(label));
const meanings = (s) => s.staff.map((p) => p.meaning);

let enabled;
beforeEach(() => { enabled = B.aiInterviews.enabled; B.aiInterviews.enabled = true; });
afterEach(() => { B.aiInterviews.enabled = enabled; });

describe('issue #670: spot the AI', () => {
  it('opens on its own once, at the first candidate refresh after the policy is on', () => {
    const s = company();
    expect(weekOf(s).some((e) => e.type === 'decision')).toBe(false);
    s.week += B.aiInterviews.refreshWeeks;
    refreshCandidates(s);
    s.week++;
    expect(weekOf(s).some((e) => e.type === 'decision')).toBe(true);
    const d = s.pendingDecision;
    expect(d.eventId).toBe('ai_interview_watch');
    expect(Object.keys(d.vars).sort()).toEqual(['candidateId', 'decoy', 'lines', 'tells']);
    expect(s.candidates.find((c) => c.id === d.vars.candidateId).watched).toBe(true);
    expect(d.vars.lines.length).toBeLessThanOrEqual(4);
    for (const l of d.vars.lines) expect(Object.keys(l).sort()).toEqual(['text', 'who']);
    s.pendingDecision = null;
    s.week += B.aiInterviews.refreshWeeks;
    refreshCandidates(s);
    s.week += B.decisionGapWeeks;
    expect(weekOf(s).some((e) => e.type === 'decision')).toBe(false);
  });

  it('the player opens it on a candidate, once each, even right after another decision', () => {
    const s = company();
    s.flags.lastDecisionWeek = s.week;
    const c = s.candidates[0];
    const res = watch(s, c);
    expect(res.ok).toBe(true);
    expect(res.events.some((e) => e.type === 'decision')).toBe(true);
    expect(s.pendingDecision.vars.candidateId).toBe(c.id);
    expectFail(expect, dispatch, s, { type: 'watchInterview', candidateId: s.candidates[1].id }, 'Finish the open decision first');
    s.pendingDecision = null;
    expectFail(expect, dispatch, s, { type: 'watchInterview', candidateId: c.id }, 'Already watched');
    expectFail(expect, dispatch, s, { type: 'watchInterview', candidateId: 'nobody' }, 'No such candidate');
    dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: false });
    expectFail(expect, dispatch, s, { type: 'watchInterview', candidateId: s.candidates[1].id }, 'AI interviews are off');
  });

  it('watching pays nothing by itself', () => {
    const s = company();
    const before = { cash: s.cash, brand: s.brand, meaning: meanings(s), rng: { ...s.rng } };
    watch(s);
    expect({ cash: s.cash, brand: s.brand, meaning: meanings(s), rng: { ...s.rng } }).toEqual(before);
  });

  it('an AI shows two or three tells and at most one decoy; a person shows no tells and one decoy; the card never says which', () => {
    let ais = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = company(seed);
      watch(s);
      const { tells, decoy } = s.pendingDecision.vars;
      const ai = s.flags.aiWatch.ai;
      for (const t of tells) expect(TELLS).toContain(t);
      if (ai) {
        ais++;
        expect(tells.length).toBeGreaterThanOrEqual(2);
        expect(tells.length).toBeLessThanOrEqual(3);
        expect(tells.slice(0, 2)).not.toContain('lensEyes');
        if (decoy !== null) expect(DECOYS).toContain(decoy);
      } else {
        expect(tells).toEqual([]);
        expect(DECOYS).toContain(decoy);
      }
      expect(JSON.stringify(s.pendingDecision)).not.toMatch(/"ai"/);
    }
    expect(ais).toBeGreaterThan(8);
    expect(ais).toBeLessThan(32);
  });

  it('one follow-up question adds one line; a second is refused, and so is one with no interview open', () => {
    const s = company();
    expectFail(expect, dispatch, s, { type: 'askFollowUp' }, 'No interview open');
    watch(s);
    const n = s.pendingDecision.vars.lines.length;
    expect(dispatch(s, { type: 'askFollowUp' }).ok).toBe(true);
    expect(s.pendingDecision.vars.lines).toHaveLength(n + 1);
    expect(s.pendingDecision.vars.lines.length).toBeLessThanOrEqual(5);
    expectFail(expect, dispatch, s, { type: 'askFollowUp' }, 'Already asked');
  });

  it('rejecting an AI is a catch: brand and meaning up; rejecting a person costs brand', () => {
    const s = company(), t = company();
    watch(s); watch(t);
    s.flags.aiWatch.ai = true;
    t.flags.aiWatch.ai = false;
    const [sb, sm, tb] = [s.brand, meanings(s), t.brand];
    const sid = s.pendingDecision.vars.candidateId, tid = t.pendingDecision.vars.candidateId;
    expect(dispatch(s, { type: 'resolveDecision', choice: choice(s, 'Reject') }).ok).toBe(true);
    expect(dispatch(t, { type: 'resolveDecision', choice: choice(t, 'Reject') }).ok).toBe(true);
    expect(s.brand).toBeCloseTo(Math.min(100, sb + B.aiInterviews.catchBrand), 6);
    expect(meanings(s)).toEqual(sm.map((m) => Math.min(100, m + B.aiInterviews.catchMeaning)));
    expect(t.brand).toBeCloseTo(Math.max(0, tb + B.aiInterviews.wrongRejectBrand), 6);
    expect(s.candidates.some((c) => c.id === sid)).toBe(false);
    expect(t.candidates.some((c) => c.id === tid)).toBe(false);
    expect(s.flags.aiWatch).toBeUndefined();
  });

  it('Hire uses the usual hiring refusals, shown on the choice', () => {
    const s = company();
    while (s.staff.length < capacity(s)) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
    watch(s);
    const hire = s.pendingDecision.choices[choice(s, 'Hire')];
    expect(hire.available).toBe(false);
    expect(hire.reason).toBe('No free desk');
    expectFail(expect, dispatch, s, { type: 'resolveDecision', choice: choice(s, 'Hire') }, 'No free desk');
  });

  it('hiring a person is an ordinary hire; hiring an AI plants an incident weeks later that never ends the game', () => {
    const s = company();
    watch(s);
    s.flags.aiWatch.ai = true;
    const id = s.pendingDecision.vars.candidateId;
    expect(dispatch(s, { type: 'resolveDecision', choice: choice(s, 'Hire') }).ok).toBe(true);
    expect(s.staff.some((p) => p.id === id)).toBe(true);
    const [lo, hi] = B.aiInterviews.exposeWeeks;
    s.cash = 1000;
    const resignations = s.stats.resignations;
    const name = s.staff.find((p) => p.id === id).name;
    let exposed = null, weeks = 0, ev = [];
    while (!exposed && weeks <= hi) { s.week++; weeks++; ev = weekOf(s); exposed = ev.find((e) => e.type === 'aiHireExposed'); }
    expect(exposed).toEqual({ type: 'aiHireExposed', staffId: id });
    // It walks out like anyone leaving, but an agent leaving is not a person resigning.
    expect(ev.find((e) => e.type === 'resign')).toEqual({ type: 'resign', staffId: id, name, fired: false, reason: 'exposed' });
    expect(s.stats.resignations).toBe(resignations);
    expect(weeks).toBeGreaterThanOrEqual(lo);
    expect(weeks).toBeLessThanOrEqual(hi);
    expect(s.staff.some((p) => p.id === id)).toBe(false);
    expect(s.cash).toBeGreaterThanOrEqual(0);
    expect(s.cash).toBeLessThan(1000);
    expect(s.gameOver).toBeFalsy();
  });

  it('switching the policy off leaves an open card answerable, and none opens while it is off', () => {
    const s = company();
    watch(s);
    dispatch(s, { type: 'setPolicy', id: 'ai_interviews', on: false });
    expect(dispatch(s, { type: 'askFollowUp' }).ok).toBe(true);
    expect(dispatch(s, { type: 'resolveDecision', choice: choice(s, 'Reject') }).ok).toBe(true);
    const t = company();
    dispatch(t, { type: 'setPolicy', id: 'ai_interviews', on: false });
    t.week += B.aiInterviews.refreshWeeks;
    refreshCandidates(t);
    t.week += B.decisionGapWeeks;
    expect(weekOf(t).some((e) => e.type === 'decision')).toBe(false);
  });
});
