import { describe, it, expect } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { beatsSystem } from '../../src/sim/beats.js';
import { moonshotSystem, moonshotEffect, lastBetEffect } from '../../src/sim/moonshot.js';
import { campaignCost } from '../../src/sim/marketing.js';
import { weeklyCosts, moonshotWeekly } from '../../src/sim/economy.js';
import { buildEpilogue } from '../../src/sim/endgame.js';
import { B } from '../../src/sim/balance.js';
import { CHANNELS } from '../../src/data/channels.js';
import { EVENTS } from '../../src/data/events.js';
import { game, addStaff, passOfficeGates, expectFail } from './helpers.js';

const rich = (seed = 1) => {
  const s = passOfficeGates(game(seed));
  s.cash = 1e9;
  dispatch(s, { type: 'upgradeOffice' });
  dispatch(s, { type: 'upgradeOffice' });
  return s;
};

describe('fame campaigns', () => {
  it('arrive with Consolidation, cost weeks of revenue, and raise fame', () => {
    const s = rich(1);
    const p = s.products[0];
    expectFail(expect, dispatch, s, { type: 'runCampaign', channel: 'documentary', productId: p.id }, 'Arrives with the Consolidation era');
    s.era = { id: 'consolidation', since: s.week };
    expect(campaignCost(s, 'documentary')).toBeGreaterThanOrEqual(CHANNELS.documentary.cost);
    p.mrr = 5e6;
    const cost = campaignCost(s, 'documentary');
    expect(cost).toBeGreaterThan(CHANNELS.documentary.cost);
    const cash = s.cash;
    expect(dispatch(s, { type: 'runCampaign', channel: 'documentary', productId: p.id }).ok).toBe(true);
    expect(s.cash).toBe(cash - cost);
    expect(s.fame).toBe(CHANNELS.documentary.fame);
    expect(campaignCost(s, 'content')).toBe(CHANNELS.content.cost);
  });

  it('fame fades, softens churn, and makes hiring cheaper', () => {
    const s = rich(2);
    s.fame = 80;
    tick(s);
    s.pendingDecision = null;
    expect(s.fame).toBeLessThan(80);
    const c = s.candidates[0] ?? null;
    if (c) {
      while (s.office.placed.filter((x) => x.itemId === 'desk').length <= s.staff.length) s.office.placed.push({ id: `d${s.office.placed.length}`, itemId: 'desk', x: 0, y: 0, rot: 0, level: 1 });
      const cash = s.cash;
      dispatch(s, { type: 'hire', candidateId: c.id });
      expect(cash - s.cash).toBeLessThan(c.salary * B.hireFeeWeeks);
    }
  });
});

describe('the moonshot lab', () => {
  it('is pitched 100 weeks into Consolidation at the HQ; funding it adds a weekly cost and check-ins', () => {
    const s = rich(3);
    s.era = { id: 'consolidation', since: 0 };
    s.flags.beats = { agent_bill: 0, rival_megaround: 0, floor_next_door: 0, deals_open: 0 };
    s.week = s.eraSchedule.consolidation + B.moonshotAfterConsolidation;
    delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek;
    beatsSystem(makeCtx(s));
    expect(s.pendingDecision?.eventId).toBe('moonshot_pitch');
    const weekly = moonshotWeekly(s);
    dispatch(s, { type: 'resolveDecision', choice: 0 });
    expect(weeklyCosts(s).moonshot).toBe(weekly);
    for (let i = 1; i < B.moonshotCheckins; i++) {
      s.week = s.flags.moonshot.since + i * B.moonshotCheckinWeeks;
      delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek;
      moonshotSystem(makeCtx(s));
      expect(s.pendingDecision?.eventId).toBe('moonshot_checkin');
      dispatch(s, { type: 'resolveDecision', choice: 0 });
    }
    s.week = s.flags.moonshot.since + B.moonshotCheckins * B.moonshotCheckinWeeks;
    delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek;
    moonshotSystem(makeCtx(s));
    expect(s.pendingDecision?.eventId).toBe('moonshot_result');
  });

  it('pulling the plug stops the spending; the unveiling ships a product or fails gloriously', () => {
    const s = rich(4);
    moonshotEffect(makeCtx(s), 'start');
    moonshotEffect(makeCtx(s), 'stop');
    expect(weeklyCosts(s).moonshot).toBe(0);
    expect(s.flags.moonshot.outcome).toBe('stopped');
    const outcomes = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const t = rich(seed);
      const products = t.products.length;
      moonshotEffect(makeCtx(t), 'start');
      moonshotEffect(makeCtx(t), 'resolve');
      outcomes.add(t.flags.moonshot.outcome);
      if (t.flags.moonshot.outcome === 'shipped') expect(t.products.length).toBe(products + 1);
      expect(t.flags.moonshot.active).toBe(false);
    }
    expect(outcomes).toEqual(new Set(['shipped', 'failed']));
  });
});

describe("the founders' last bet", () => {
  it('arrives at week 900, and each answer leaves its mark on the ending', () => {
    const s = rich(5);
    s.flags.beats = { agent_bill: 0, rival_megaround: 0, floor_next_door: 0, deals_open: 0, moonshot_pitch: 0 };
    s.week = B.lastBetWeek;
    delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek;
    beatsSystem(makeCtx(s));
    expect(s.pendingDecision?.eventId).toBe('last_bet');
    const cash = s.cash;
    dispatch(s, { type: 'resolveDecision', choice: EVENTS.last_bet.choices.findIndex((c) => c.label === 'Start a foundation') });
    expect(s.cash).toBeCloseTo(cash * (1 - B.foundationCashShare));
    expect(s.flags.lastBet).toBe('foundation');
    s.stats.launches = 3;
    s.week = 1040;
    expect(buildEpilogue(s, { won: true, reason: 'anniversary' }).join(' ')).toMatch(/Foundation still funds free tools/);
    const t = rich(6);
    const senior = addStaff(t, 'engineer', 'senior', { meaning: 50 });
    lastBetEffect(makeCtx(t), 'keys');
    expect(senior.meaning).toBe(50 + B.keysSeniorMeaning);
    expect(t.flags.lastBet).toBe('keys');
  });
});
