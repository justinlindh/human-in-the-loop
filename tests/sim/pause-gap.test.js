import { describe, it, expect } from 'vitest';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision, eligibleEvents, lastPauseWeek, eventsSystem } from '../../src/sim/events.js';
import { B } from '../../src/sim/balance.js';
import { showsCard } from '../../src/sim/unlocks.js';
import { game, addProduct } from './helpers.js';

// A settled company with a product, past the opening grace, with nothing recent.
function settled(seed = 1) {
  const s = game(seed);
  s.week = 200;
  s.stats.launches = 3;
  addProduct(s, { name: 'Inboxer' });
  delete s.flags.lastDecisionWeek;
  delete s.flags.lastPauseWeek;
  return s;
}

describe('issue #556: a launch or an unlock counts as the last pausing moment', () => {
  it('the pause is the later of the last decision and the last launch or unlock', () => {
    const s = settled(1);
    expect(lastPauseWeek(s)).toBe(undefined);
    s.flags.lastDecisionWeek = 190;
    s.flags.lastPauseWeek = 198;
    expect(lastPauseWeek(s)).toBe(198);
    s.flags.lastDecisionWeek = 199;
    expect(lastPauseWeek(s)).toBe(199);
  });

  it('decisions wait the gap after a launch week, then come back', () => {
    const s = settled(2);
    expect(eligibleEvents(s).some((e) => e.choices)).toBe(true);
    s.flags.lastPauseWeek = s.week;
    expect(eligibleEvents(s).some((e) => e.choices)).toBe(false);
    expect(raiseDecision(makeCtx(s), 'vendor_new_version', null)).toBe(false);
    s.week += B.decisionGapWeeks;
    expect(eligibleEvents(s).some((e) => e.choices)).toBe(true);
  });

  it('a decision queued inside the gap is scheduled for the week the gap ends', () => {
    const s = settled(3);
    s.flags.lastPauseWeek = s.week - 1;
    raiseDecision(makeCtx(s), 'four_day_week_review', null, { queue: true });
    expect(s.pendingDecision).toBe(null);
    expect(s.scheduled.at(-1)).toMatchObject({ kind: 'event', week: s.week - 1 + B.decisionGapWeeks, payload: { eventId: 'four_day_week_review' } });
  });

  it('incidents and cyber attacks still interrupt right away', () => {
    const s = settled(4);
    s.flags.lastPauseWeek = s.week;
    expect(raiseDecision(makeCtx(s), 'ransomware', s.products[0].id)).toBe(true);
  });

  it('a roll that lands in a launch pause is held and spent when the gap clears, so events do not thin out', () => {
    const s = settled(5);
    const chance = B.randomEventChance;
    try {
      B.randomEventChance = 1;
      s.flags.lastPauseWeek = s.week;
      eventsSystem(makeCtx(s));
      expect(s.pendingDecision).toBe(null);
      expect(s.flags.heldRolls).toBe(1);
      s.week += 1;
      eventsSystem(makeCtx(s));
      expect(s.flags.heldRolls).toBe(B.heldRollsMax);
      B.randomEventChance = 0;
      s.week = s.flags.lastPauseWeek + B.decisionGapWeeks;
      const before = s.flags.heldRolls;
      for (let i = 0; i < 5 && !s.pendingDecision && s.flags.heldRolls === before; i++) eventsSystem(makeCtx(s));
      expect(s.flags.heldRolls).toBe(before - 1);
    } finally {
      B.randomEventChance = chance;
    }
  });

  it('only unlocks that show a card pause decisions: a later policy is a toast unless an era comes with it', () => {
    const s = settled(6);
    s.unlocks = { marketing: 10 };
    expect(showsCard(makeCtx(s), 'ops')).toBe(true);
    expect(showsCard(makeCtx(s), 'policy.crunch')).toBe(true);
    s.unlocks['policy.crunch'] = s.week - 20;
    expect(showsCard(makeCtx(s), 'policy.remote_first')).toBe(false);
    const withEra = makeCtx(s);
    withEra.events.push({ type: 'era', eraId: 'agents' });
    expect(showsCard(withEra, 'policy.remote_first')).toBe(true);
  });
});
