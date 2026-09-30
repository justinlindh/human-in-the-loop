import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick, calendarDate } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { calendarStart } from '../../src/sim/vendors.js';
import { dotcomStep, dotcomEffect, dotcomAcquisition } from '../../src/sim/dotcom.js';
import { eraAtLeast, eraIndex, eraLines } from '../../src/sim/eras.js';
import { checkGoals } from '../../src/sim/goals.js';
import { endgameSystem } from '../../src/sim/endgame.js';
import { raiseDecision } from '../../src/sim/events.js';
import { purchaseProblem } from '../../src/sim/office.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { addProduct } from './helpers.js';

const game = () => createGame({ seed: 17, startEra: 'dotcom' });
const at = (s, week) => { s.week = week; s.pendingDecision = null; delete s.flags.lastDecisionWeek; const ctx = makeCtx(s); dotcomStep(ctx); return ctx; };
const roundtrip = (s) => { const m = new Map(); const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; expect(saveGame(s, store)).toBe(true); const r = loadGame(store); expect(r.ok).toBe(true); return r.state; };

describe('dot-com career', () => {
  it('starts with period permissions, a versioned bridge and the intended kit', () => {
    const s = game();
    expect(s.cash).toBe(B.funding.bootstrapped.cash + B.eraStarts.dotcom.cash);
    expect(s.office.placed).toHaveLength(4);
    expect(s.era.id).toBe('dotcom');
    expect(eraIndex(s)).toBeLessThan(0);
    expect(eraIndex(createGame())).toBe(0);
    expect(eraAtLeast(s, 'classic')).toBe(false);
    expect(s.market.unlockedAngles).toEqual(['web', 'onprem']);
    expect(Object.values(s.models).some((m) => m.available)).toBe(false);
    expect(s.goals.first_launch.skipped).toBeUndefined();
    expect(s.founding.timelineVersion).toBe('dotcom-bridge-v1');
    expect(calendarDate(s)).toMatchObject({ year: 1997, week: 1, quarter: 1 });
    expect(calendarDate(s, 1).week).toBeGreaterThan(0);
    expect(s.eraSchedule.classic).toBe(B.dotcom.weeks);
    expect(s.eraSchedule.agents).toBe(createGame({ seed: 17 }).eraSchedule.agents + B.dotcom.weeks);
    expect(dispatch(s, { type: 'startProject', kind: 'new', name: 'Directory', category: 'email', angle: 'web', size: 'small' }).ok).toBe(true);
    expect(dispatch(s, { type: 'startProject', kind: 'new', name: 'Phone', category: 'notes', angle: 'mobile', size: 'small' }).ok).toBe(false);
    expect(dispatch(s, { type: 'setAutomation', fn: 'engineering', level: 1, model: 'chatgbt' }).ok).toBe(false);
    expect(s.unlocks['policy.pair']).toBeUndefined();
    expect(dispatch(s, { type: 'setPolicy', id: 'pair', on: true }).ok).toBe(false);
    expect(dispatch(s, { type: 'runCampaign', channel: 'producthunt', projectId: s.projects[0].id }).ok).toBe(false);
    expect(dispatch(s, { type: 'runCampaign', channel: 'content', projectId: s.projects[0].id }).ok).toBe(true);
  });

  it('advances demand even when an unrelated decision holds the IPO card', () => {
    const s = game();
    at(s, B.dotcom.boomWeek - 1); expect(dotcomAcquisition(s)).toBe(1);
    at(s, B.dotcom.boomWeek); expect(dotcomAcquisition(s)).toBe(B.dotcom.boomAcquisition);
    s.pendingDecision = { eventId: 'other' };
    s.week = B.dotcom.ipoWeek; dotcomStep(makeCtx(s));
    expect(s.scheduled.some((x) => x.payload.eventId === 'dotcom_ipo_frenzy')).toBe(true);
    s.week = B.dotcom.bustWeek; dotcomStep(makeCtx(s));
    expect(dotcomAcquisition(s)).toBe(B.dotcom.bustAcquisition);
    s.pendingDecision = null;
    expect(raiseDecision(makeCtx(s), 'dotcom_ipo_frenzy')).toBe(false);
    dotcomEffect(makeCtx(s), 'float'); expect(s.flags.dotcom.float).toBe(null);
    calendarStart(makeCtx(s));
    expect(s.pendingDecision?.eventId).not.toBe('dotcom_ipo_frenzy');
  });

  it('finances once and preserves the financing choice through a save', () => {
    const s = game(); at(s, B.dotcom.ipoWeek);
    const cash = s.cash;
    dotcomEffect(makeCtx(s), 'float'); dotcomEffect(makeCtx(s), 'float');
    expect(s.cash).toBe(cash + B.dotcom.floatCash);
    expect(s.flags.diluted).toBe(true);
    expect(s.gameOver).toBe(null);
    const loaded = roundtrip(s);
    dotcomEffect(makeCtx(loaded), 'float');
    expect(loaded.cash).toBe(s.cash);
  });

  it.each(['retain', 'preserve'])('settles %s across live products once, with bounded cash costs', (choice) => {
    const s = game(); at(s, B.dotcom.ipoWeek); dotcomEffect(makeCtx(s), 'float');
    const p = addProduct(s, { angle: 'web', model: null, customers: 1000 });
    const dead = addProduct(s, { killed: true, customers: 1000 });
    s.cash = 10000; at(s, B.dotcom.bustWeek);
    dotcomEffect(makeCtx(s), choice);
    expect(s.cash).toBe(choice === 'retain' ? 7200 : 8000);
    expect(p.customers).toBe(choice === 'retain' ? 900 : 750);
    expect(dead.customers).toBe(1000);
    const loaded = roundtrip(s); dotcomEffect(makeCtx(loaded), choice);
    expect(loaded.cash).toBe(s.cash); expect(loaded.products).toEqual(s.products);
  });

  it('never spends negative cash on retention or public-company costs', () => {
    const s = game(); at(s, B.dotcom.ipoWeek); dotcomEffect(makeCtx(s), 'float');
    s.cash = -100; at(s, B.dotcom.bustWeek); dotcomEffect(makeCtx(s), 'retain');
    expect(s.cash).toBe(-100);
  });

  it('recovers into Classic, carries the company and awards only eligible goals', () => {
    const s = game(); const p = addProduct(s, { angle: 'web', model: null, customers: 1000 });
    const people = s.staff.map((x) => x.id);
    at(s, B.dotcom.bustWeek); dotcomEffect(makeCtx(s), 'retain');
    s.pendingDecision = null; s.scheduled = []; delete s.flags.lastDecisionWeek;
    s.week = B.dotcom.weeks;
    calendarStart(makeCtx(s));
    expect(s.era.id).toBe('classic');
    expect(calendarDate(s).year).toBe(2019);
    expect(s.market.unlockedAngles).toContain('mobile');
    expect(s.products[0]).toBe(p); expect(s.staff.map((x) => x.id)).toEqual(people);
    expect(dotcomAcquisition(s)).toBe(1);
    expect(s.flags.erasVisited).toEqual(['dotcom', 'classic']);
    const c = makeCtx(s); checkGoals(c);
    expect(c.events.filter((e) => e.type === 'goal').map((e) => e.goalId)).toEqual(expect.arrayContaining(['dotcom_first_web', 'dotcom_survivor']));
    const cash = s.cash; checkGoals(makeCtx(s)); expect(s.cash).toBe(cash);
    const modern = createGame(); checkGoals(makeCtx(modern)); expect(modern.goals.dotcom_survivor).toBeUndefined();
    s.week = B.anniversaryWeek - 1; endgameSystem(makeCtx(s)); expect(s.gameOver).toBe(null);
    s.week = B.anniversaryWeek + B.dotcom.weeks - 1; endgameSystem(makeCtx(s)); expect(s.gameOver.reason).toBe('anniversary');
  });

  it('bounds a delayed bust at recovery and does not charge it again', () => {
    const s = game(); at(s, B.dotcom.ipoWeek); dotcomEffect(makeCtx(s), 'float');
    const p = addProduct(s, { angle: 'web', model: null, customers: 1000 });
    at(s, B.dotcom.weeks);
    expect(s.flags.dotcom.recovered).toBe(true); expect(p.customers).toBe(750);
    const cash = s.cash; dotcomEffect(makeCtx(s), 'preserve'); expect(s.cash).toBe(cash);
    expect(raiseDecision(makeCtx(s), 'dotcom_bust')).toBe(false);
  });

  it('makes the banner buyable only in its era and has a safe period fallback', () => {
    expect(purchaseProblem(game(), 'dotcom_banner')).toBe(null);
    expect(purchaseProblem(createGame(), 'dotcom_banner')).toBeTruthy();
    expect(eraLines(game(), ['Ask the AI agent in Yak'])).toEqual(['The office is quiet. Someone is thinking.']);
  });

  it('continues identically after saving at the bust boundary', () => {
    const s = game(); s.cash = 1e7; s.week = B.dotcom.bustWeek - 1;
    const loaded = roundtrip(s);
    for (let i = 0; i < 60; i++) {
      if (s.pendingDecision) {
        const choice = s.pendingDecision.choices.findIndex((x) => x.available);
        expect(dispatch(loaded, { type: 'resolveDecision', choice })).toEqual(dispatch(s, { type: 'resolveDecision', choice }));
      }
      expect(tick(loaded)).toEqual(tick(s));
    }
    expect(loaded).toEqual(s); expect(s.era.id).toBe('classic'); expect(s.lockdown).toBe(null);
  });
});
