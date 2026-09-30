import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision } from '../../src/sim/events.js';
import { dotcomStep, dotcomAcquisition, dotcomEffect } from '../../src/sim/dotcom.js';
import { web2Step } from '../../src/sim/web2.js';
import { chapterStart } from '../../src/sim/util.js';
import { EVENTS } from '../../src/data/events.js';

const fresh = (s) => { s.pendingDecision = null; s.scheduled = []; delete s.flags.lastDecisionWeek; return s; };

// A dot-com chapter that begins after an earlier one, as a longer timeline or a mid-history start would give.
function laterDotcom(lead = 100) {
  const s = createGame({ seed: 17, startEra: 'dotcom' });
  s.founding.earlyChapters = [{ id: 'preinternet', weeks: lead, startYear: 1990, endYear: 1997 }, ...s.founding.earlyChapters];
  for (const era of Object.keys(s.eraSchedule)) s.eraSchedule[era] += lead;
  return s;
}
const at = (s, week) => { fresh(s); s.week = week; const ctx = makeCtx(s); dotcomStep(ctx); return ctx; };

describe('era gates on decisions', () => {
  it('refuses a decision whose data names other eras', () => {
    const classic = fresh(createGame({ seed: 3 }));
    expect(EVENTS.noc_bet.eras).not.toContain('classic');
    expect(raiseDecision(makeCtx(classic), 'noc_bet')).toBe(false);
    const dotcom = fresh(createGame({ seed: 3, startEra: 'dotcom' }));
    expect(EVENTS.web2_activex.eras).toEqual(['web2']);
    expect(raiseDecision(makeCtx(dotcom), 'web2_activex')).toBe(false);
    const web2 = fresh(createGame({ seed: 3, startEra: 'web2' }));
    expect(raiseDecision(makeCtx(web2), 'web2_activex')).toBe(true);
  });

  it('keeps the dot-com phase rules for its own cards', () => {
    const s = fresh(createGame({ seed: 17, startEra: 'dotcom' }));
    s.week = B.dotcom.bustWeek;
    expect(raiseDecision(makeCtx(s), 'dotcom_ipo_frenzy')).toBe(false);
    expect(raiseDecision(makeCtx(s), 'dotcom_bust')).toBe(true);
  });
});

describe('dot-com milestones follow the chapter', () => {
  it('finds where each chapter starts on the company timeline', () => {
    const s = laterDotcom(100);
    expect(chapterStart(s, 'preinternet')).toBe(0);
    expect(chapterStart(s, 'dotcom')).toBe(100);
    expect(chapterStart(s, 'web2')).toBe(100 + B.dotcom.weeks);
    expect(chapterStart(createGame({ seed: 1 }), 'dotcom')).toBe(null);
  });

  it('times the boom, the IPO card and the bust from the chapter start', () => {
    const s = laterDotcom(100);
    at(s, B.dotcom.boomWeek); expect(dotcomAcquisition(s)).toBe(1);
    at(s, 100 + B.dotcom.boomWeek); expect(dotcomAcquisition(s)).toBe(B.dotcom.boomAcquisition);
    at(s, B.dotcom.ipoWeek); expect(s.flags.dotcom.seen?.dotcom_ipo_frenzy).toBeUndefined();
    at(s, 100 + B.dotcom.ipoWeek); expect(s.pendingDecision?.eventId).toBe('dotcom_ipo_frenzy');
    dotcomEffect(makeCtx(s), 'float'); expect(s.flags.dotcom.float).toBe(true);
    at(s, B.dotcom.bustWeek + 50); expect(s.flags.dotcom.phase).toBe('warning');
    dotcomEffect(makeCtx(s), 'retain'); expect(s.flags.dotcom.settled).toBe(false);
    at(s, 100 + B.dotcom.bustWeek); expect(dotcomAcquisition(s)).toBe(B.dotcom.bustAcquisition);
  });
});

describe('period chatter', () => {
  it.each([
    ['dotcom', dotcomStep, B.dotcom.chatterEvery],
    ['web2', web2Step, B.web2.chatterEvery],
  ])('%s chatter leaves the main random stream alone', (startEra, step, every) => {
    const s = createGame({ seed: 5, startEra });
    if (startEra === 'web2') s.flags.web2 = { arrived: true, retired: false };
    s.flags.dotcom && Object.assign(s.flags.dotcom, { seen: { dotcom_eyeballs: true, dotcom_ipo_frenzy: true, dotcom_warning: true, dotcom_bust: true, dotcom_recovery: true } });
    s.week = every * 2;
    const before = { ...s.rng };
    const ctx = makeCtx(s); step(ctx);
    expect(s.rng).toEqual(before);
    expect(s.chatLog.some((m) => m.channel === 'random')).toBe(true);
    const again = createGame({ seed: 5, startEra });
    if (startEra === 'web2') again.flags.web2 = { arrived: true, retired: false };
    again.flags.dotcom && Object.assign(again.flags.dotcom, structuredClone(s.flags.dotcom), { seen: s.flags.dotcom.seen });
    again.week = every * 2; step(makeCtx(again));
    expect(again.chatLog.at(-1).text).toBe(s.chatLog.at(-1).text);
  });
});
