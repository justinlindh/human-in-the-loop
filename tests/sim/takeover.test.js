import { describe, expect, it, vi } from 'vitest';
import { createGame, tick, scoreRun } from '../../src/sim/index.js';
import { botDecide, botTurn, runBot } from '../../src/sim/bots.js';
import * as bots from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { saveGame, loadGame } from '../../src/save/save.js';

describe('era takeover', () => {
  it.each(['chatgbt', 'agents'])('builds the same %s company twice and preserves the bot run', (startEra) => {
    const options = { seed: 1, startEra, startMode: 'takeover', funding: 'preseed' };
    const first = createGame(options);
    expect(createGame(options)).toEqual(first);
    const original = runBot('sensible', 1, null, {
      founding: { funding: 'preseed', companyName: first.companyName },
      stopWhen: (s) => s.era.id === startEra,
    }).state;
    expect(first.week).toBe(original.week);
    expect(first.week).toBeGreaterThan(0);
    expect(first.staff.length).toBeGreaterThan(2);
    expect(first.products.some((p) => !p.killed)).toBe(true);
    expect(first.gameOver).toBeNull();
    const { founding, ...company } = first;
    const { founding: oldFounding, ...oldCompany } = original;
    expect(company).toEqual(oldCompany);
    expect(founding).toEqual({ ...oldFounding, startMode: 'takeover', takeoverEra: startEra,
      takeoverWeek: first.week, takeoverBot: 'sensible', eraScoreMult: B.takeover.scoreMult[startEra] });
    expect(founding.eraScoreMult).toBeLessThan(B.eraStarts[startEra].scoreMult);
    expect(founding.eraScoreMult).toBeGreaterThan(0);
  });

  it.each(['chatgbt', 'agents'].flatMap((era) => ['bootstrapped', 'family', 'preseed'].map((funding) => [era, funding])))('handles %s / %s through the predecessor run', (startEra, funding) => {
    const s = createGame({ seed: 1, funding, startEra, startMode: 'takeover' });
    expect(s.founding.funding).toBe(funding);
    expect(s.era.id).toBe(startEra);
    expect(s.founding.startEra).toBeUndefined();
  });

  it.each(['classic', 'dotcom', 'web2', 'unknown', 'toString'])('refuses an unsupported %s takeover', (startEra) => {
    expect(() => createGame({ seed: 1, startEra, startMode: 'takeover' })).toThrow(/Takeover/);
  });

  it('refuses unknown takeover funding', () => {
    expect(() => createGame({ startEra: 'agents', startMode: 'takeover', funding: 'unknown' })).toThrow(/funding/);
  });

  it('refuses a predecessor that fails rather than changing its seed or repairing its books', () => {
    const failed = createGame({ seed: 1 });
    failed.gameOver = { reason: 'runway', won: false };
    const before = structuredClone(failed);
    const run = vi.spyOn(bots, 'runBot').mockReturnValueOnce({ state: failed });
    try {
      expect(() => createGame({ seed: 1, startEra: 'agents', startMode: 'takeover' })).toThrow(/did not reach/);
      expect(run).toHaveBeenCalledTimes(1);
      expect(failed).toEqual(before);
    } finally { run.mockRestore(); }
  });

  it.each(['classic', 'dotcom', 'web2', 'chatgbt', 'agents'])('leaves %s garage founding unchanged', (startEra) => {
    const options = { seed: 17, startEra, funding: 'family' };
    expect(createGame({ ...options, startMode: 'garage' })).toEqual(createGame(options));
    expect(createGame(options).week).toBe(0);
  });

  it.each(['chatgbt', 'agents'])('round-trips %s and continues with the same decisions, events and score', (startEra) => {
    const s = createGame({ seed: 1, funding: 'preseed', startEra, startMode: 'takeover' });
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
    expect(saveGame(s, storage)).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    expect(loaded.state).toEqual(s);
    for (let i = 0; i < 20; i++) {
      for (const state of [s, loaded.state]) {
        botDecide('balanced', state);
        botTurn('balanced', state);
      }
      expect(tick(loaded.state)).toEqual(tick(s));
    }
    expect(loaded.state).toEqual(s);
    const raw = structuredClone(s);
    delete raw.founding.eraScoreMult;
    const breakdown = Object.values(scoreRun(raw).breakdown).reduce((a, b) => a + b, 0);
    expect(scoreRun(s).score).toBe(Math.round(Math.max(0, breakdown) * 0.5
      * (s.flags.diluted ? 0.8 : 1) * B.funding.preseed.scoreMult
      * (1 - (s.flags.incubatorCut ?? 0)) * B.takeover.scoreMult[startEra]));
  });
});
