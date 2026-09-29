import { describe, it, expect } from 'vitest';
import { EVENTS } from '../../src/data/events.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { eligibleEvents } from '../../src/sim/events.js';
import { windowsSystem, windowWeek } from '../../src/sim/windows.js';
import { runBot } from '../../src/sim/bots.js';
import { game, addStaff } from './helpers.js';

const N = B.nods;

// A company that has just moved to the Office Floor, with people and no decision history.
function onTheFloor(seed = 3) {
  const s = game(seed);
  while (s.staff.length < 6) addStaff(s, 'engineer', 'mid');
  s.week = 150;
  s.officeStage = 1;
  s.office.stage = 1;
  delete s.flags.lastDecisionWeek;
  delete s.flags.lastPauseWeek;
  return s;
}
const run = (s, weeks) => {
  for (let i = 0; i < weeks && !s.pendingDecision; i++) {
    windowsSystem(makeCtx(s));
    if (!s.pendingDecision) s.week++;
  }
  return s.pendingDecision;
};

describe('printer_jam fires in a window after the Office Floor (#1022)', () => {
  it('is no longer a random roll', () => {
    expect(EVENTS.printer_jam.random).toBe(false);
    expect(EVENTS.printer_jam.floorWindow).toEqual({ from: N.printerFromWeeks, to: N.printerToWeeks });
    const s = onTheFloor();
    expect(eligibleEvents(s).some((e) => e.id === 'printer_jam')).toBe(false);
  });

  it('picks a week inside the window from the seed, and fires on it', () => {
    const weeks = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const s = onTheFloor(seed);
      windowsSystem(makeCtx(s));
      const due = windowWeek(s, EVENTS.printer_jam);
      expect(due - s.flags.floorWeek).toBeGreaterThanOrEqual(N.printerFromWeeks);
      expect(due - s.flags.floorWeek).toBeLessThanOrEqual(N.printerToWeeks);
      weeks.add(due - s.flags.floorWeek);
      const rng = JSON.stringify(s.rng);
      expect(run(s, due - s.week)).toBe(null);
      expect(JSON.stringify(s.rng)).toBe(rng);
      expect(run(s, 1)?.eventId).toBe('printer_jam');
      expect(s.week).toBe(due);
    }
    expect(weeks.size).toBeGreaterThan(10);
  });

  it('waits out a pending decision and the decision gap, then fires; and only once', () => {
    const s = onTheFloor(5);
    windowsSystem(makeCtx(s));
    s.week = windowWeek(s, EVENTS.printer_jam);
    s.flags.lastPauseWeek = s.week;
    windowsSystem(makeCtx(s));
    expect(s.pendingDecision).toBe(null);
    s.pendingDecision = { eventId: 'something_else', choices: [] };
    s.week += B.decisionGapWeeks;
    windowsSystem(makeCtx(s));
    expect(s.pendingDecision.eventId).toBe('something_else');
    s.pendingDecision = null;
    windowsSystem(makeCtx(s));
    expect(s.pendingDecision?.eventId).toBe('printer_jam');
    s.pendingDecision = null;
    s.week += 10;
    s.flags.lastPauseWeek = undefined;
    windowsSystem(makeCtx(s));
    expect(s.pendingDecision).toBe(null);
  });

  it('never fires in the garage', () => {
    const s = onTheFloor();
    s.officeStage = 0;
    s.office.stage = 0;
    expect(run(s, 200)).toBe(null);
    expect(s.flags.floorWeek).toBe(undefined);
  });

  it('bot games get their printer jam within the window after the move', () => {
    for (const bot of ['balanced', 'sensible', 'allHumans']) {
      let floor = null;
      let jam = null;
      runBot(bot, 2, 700, { onWeek: (s) => {
        if (floor === null && s.officeStage >= 1) floor = s.flags.floorWeek;
        if (jam === null && s.pendingDecision?.eventId === 'printer_jam') jam = s.week;
      } });
      expect(floor, bot).not.toBe(null);
      expect(jam - floor, bot).toBeLessThanOrEqual(N.printerToWeeks + 8);
      expect(jam - floor, bot).toBeGreaterThanOrEqual(N.printerFromWeeks);
    }
  }, 60000);
});
