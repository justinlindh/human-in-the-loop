import { describe, it, expect } from 'vitest';
import { createGame, tick, calendarDate } from '../../src/sim/index.js';
import { endgameSystem } from '../../src/sim/endgame.js';
import { calendarStart } from '../../src/sim/vendors.js';
import { beatsSystem } from '../../src/sim/beats.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { ERA_STARTS, CAREER_MODES, careerMode } from '../../src/data/era-modes.js';

describe('Consolidation and Plateau starts', () => {
  it.each(['consolidation', 'plateau'])('founds a %s company at that era\'s seeded arrival', (startEra) => {
    const classic = createGame({ seed: 23 });
    const s = createGame({ seed: 23, startEra });
    const offset = classic.eraSchedule[startEra];
    expect(s.founding.calendarOffset).toBe(offset);
    expect(s.eraSchedule[startEra]).toBe(0);
    expect(s.eraSchedule.agents).toBe(0);
    expect(calendarDate(s).year).toBe(2019 + Math.floor(offset / 52));
    expect(s.unlocks.squads).toBe(0);
    expect(s.goals.place_desks.skipped).toBe(true);
    expect(s.founding.earlyChapters).toBeUndefined();
  });

  it('opens the Consolidation angles at founding', () => {
    const s = createGame({ seed: 3, startEra: 'consolidation' });
    expect(s.market.unlockedAngles).toEqual(expect.arrayContaining(['voice', 'vertical', 'agent']));
  });

  it('never replays an arrival card or lockdown for a Plateau company', () => {
    const s = createGame({ seed: 5, startEra: 'plateau' });
    const eras = [];
    for (let i = 0; i < 120; i++) {
      s.pendingDecision = null;
      for (const e of tick(s)) if (e.type === 'era') eras.push(e.eraId);
    }
    expect(eras).toEqual([]);
    expect(s.era.id).toBe('plateau');
    expect(s.flags.lockdownWeek).toBeUndefined();
  });

  it('meets Consolidation\'s successor on the shifted schedule', () => {
    const classic = createGame({ seed: 8 });
    const s = createGame({ seed: 8, startEra: 'consolidation' });
    expect(s.eraSchedule.plateau).toBe(classic.eraSchedule.plateau - classic.eraSchedule.consolidation);
    s.week = s.eraSchedule.plateau;
    const ctx = makeCtx(s);
    calendarStart(ctx);
    expect(ctx.events.filter((e) => e.type === 'era')).toEqual([{ type: 'era', eraId: 'plateau' }]);
  });

  it('runs twenty company years from founding', () => {
    const s = createGame({ seed: 2, startEra: 'plateau' });
    s.week = B.anniversaryWeek - 2;
    endgameSystem(makeCtx(s));
    expect(s.gameOver).toBe(null);
    s.week = B.anniversaryWeek - 1;
    endgameSystem(makeCtx(s));
    expect(s.gameOver.reason).toBe('anniversary');
  });

  it('carries a calibrated kit for each', () => {
    for (const id of ['consolidation', 'plateau']) {
      const kit = B.eraStarts[id];
      expect(ERA_STARTS[id].skippedGoals).toEqual(ERA_STARTS.agents.skippedGoals);
      expect(kit.desks).toBe(4);
      for (const k of ['cash', 'scoreMult', 'scoreShare', 'exitMrrMult']) expect(Number.isFinite(kit[k])).toBe(true);
      expect(kit.scoreShare).toBeLessThan(B.eraStarts.agents.scoreShare + 0.05);
    }
    expect(B.eraStarts.plateau.cash).toBeGreaterThan(B.eraStarts.consolidation.cash);
  });
});

describe('career modes', () => {
  it('names the long career and the classic career by their start', () => {
    expect(CAREER_MODES.long_career.startEra).toBe('preinternet');
    expect(CAREER_MODES.classic_career.startEra).toBe('classic');
    expect(careerMode(createGame({ seed: 1, startEra: 'preinternet' }))).toBe('long_career');
    expect(careerMode(createGame({ seed: 1 }))).toBe('classic_career');
    expect(careerMode(createGame({ seed: 1, startEra: 'dotcom' }))).toBe('era_start');
    expect(careerMode(createGame({ seed: 1, startEra: 'plateau' }))).toBe('era_start');
  });

  it('plays every chapter and the full modern run before the long career ends', () => {
    const s = createGame({ seed: 4, startEra: 'preinternet' });
    const total = B.preinternet.weeks + B.dotcom.weeks + B.web2.weeks + B.anniversaryWeek;
    expect(total).toBe(1612);
    for (const week of [B.anniversaryWeek - 1, B.anniversaryWeek + B.preinternet.weeks - 1, total - 2]) {
      s.week = week;
      endgameSystem(makeCtx(s));
      expect(s.gameOver, `week ${week}`).toBe(null);
    }
    s.week = total - 1;
    endgameSystem(makeCtx(s));
    expect(s.gameOver.reason).toBe('anniversary');
  });

  it('holds the founders\' last bet until the end of a chaptered career is near', () => {
    for (const startEra of ['classic', 'preinternet', 'web2']) {
      const s = createGame({ seed: 6, startEra });
      const early = (s.founding.earlyChapters ?? []).reduce((n, c) => n + c.weeks, 0);
      s.week = B.lastBetWeek + early - 1;
      beatsSystem(makeCtx(s));
      expect(s.flags.beats?.last_bet, startEra).toBeUndefined();
      s.week = B.lastBetWeek + early;
      beatsSystem(makeCtx(s));
      expect(s.flags.beats.last_bet, startEra).toBe(B.lastBetWeek + early);
    }
  });
});
