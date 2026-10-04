import { describe, expect, it, vi } from 'vitest';
import { createGame, tick, scoreRun } from '../../src/sim/index.js';
import { botDecide, botTurn, runBot } from '../../src/sim/bots.js';
import * as bots from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { exitMrr, ipoBlocker } from '../../src/sim/endgame.js';
import { helpers } from '../../src/sim/events.js';
import { saveGame, loadGame } from '../../src/save/save.js';

describe('era takeover', () => {
  it.each([['chatgbt', 0.5], ['agents', 0.3]])('targets a %s share below its garage start', (era, share) => {
    expect(B.takeover.scoreShare[era]).toBe(share);
    expect(B.takeover.scoreShare[era]).toBeGreaterThan(0);
    expect(B.takeover.scoreShare[era]).toBeLessThan(B.eraStarts[era].scoreShare);
  });

  it.each(['chatgbt', 'agents'])('reads Classic exit bars for a %s takeover, including after reload', (startEra) => {
    const original = createGame({ seed: 1, startEra, startMode: 'takeover' });
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
    expect(saveGame(original, storage)).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    const classicMult = B.eraStarts.classic.exitMrrMult;
    try {
      B.eraStarts.classic.exitMrrMult = 1.1;
      for (const s of [original, loaded.state]) {
        expect(s.founding.startEra).toBeUndefined();
        expect(s.era.id).toBe(startEra);
        const ipo = Math.round(B.ipoMrr * B.eraStarts.classic.exitMrrMult);
        const offer = Math.round(B.acquisitionOfferMrr * B.eraStarts.classic.exitMrrMult);
        expect(exitMrr(s, B.ipoMrr)).toBe(ipo);
        expect(exitMrr(s, B.acquisitionOfferMrr)).toBe(offer);
        s.week = B.retireFromWeek;
        s.brand = 100;
        s.officeStage = s.office.stage = 2;
        s.products.forEach((p) => { p.mrr = 0; });
        const product = s.products.find((p) => !p.killed);
        product.mrr = ipo - 1;
        expect(ipoBlocker(s)).toMatch(/MRR/);
        product.mrr = ipo;
        expect(ipoBlocker(s)).toBeNull();
        product.mrr = offer - 1;
        expect(helpers(s).offerReady).toBe(false);
        product.mrr = offer;
        expect(helpers(s).offerReady).toBe(true);
      }
    } finally { B.eraStarts.classic.exitMrrMult = classicMult; }
  });

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
    expect(first.flags).not.toHaveProperty('botDecorFull');
    expect(first.flags).not.toHaveProperty('botStandup');
    const { founding, flags, ...company } = first;
    const { founding: oldFounding, flags: oldFlags, ...oldCompany } = original;
    const { botDecorFull, botStandup, ...playerFlags } = oldFlags;
    expect(flags).toEqual(playerFlags);
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

  it.each(['classic', 'preinternet', 'dotcom', 'web2', 'unknown', 'toString'])('refuses an unsupported %s takeover', (startEra) => {
    expect(() => createGame({ seed: 1, startEra, startMode: 'takeover' })).toThrow(/Takeover/);
  });

  it('refuses unknown takeover funding', () => {
    expect(() => createGame({ startEra: 'agents', startMode: 'takeover', funding: 'unknown' })).toThrow(/funding/);
  });

  it('removes both predecessor bookkeeping flags while retaining earned flags', () => {
    const predecessor = createGame({ seed: 1, startEra: 'agents' });
    predecessor.flags.botDecorFull = 2;
    predecessor.flags.botStandup = 'async_standups';
    predecessor.flags.diluted = true;
    predecessor.flags.incubatorCut = 0.1;
    const run = vi.spyOn(bots, 'runBot').mockReturnValueOnce({ state: predecessor });
    try {
      const state = createGame({ seed: 1, startEra: 'agents', startMode: 'takeover' });
      expect(state.flags).not.toHaveProperty('botDecorFull');
      expect(state.flags).not.toHaveProperty('botStandup');
      expect(state.flags).toMatchObject({ diluted: true, incubatorCut: 0.1 });
    } finally { run.mockRestore(); }
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
    expect(loaded.state.flags).not.toHaveProperty('botDecorFull');
    expect(loaded.state.flags).not.toHaveProperty('botStandup');
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
