import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadGame, saveGame, SAVE_KEY } from '../../src/save/save.js';
import { createGame, dispatch, tick, calendarDate } from '../../src/sim/index.js';
import { endgameSystem } from '../../src/sim/endgame.js';
import { makeCtx } from '../../src/sim/registry.js';
import { earlyWeeks } from '../../src/sim/util.js';
import { B } from '../../src/sim/balance.js';
import { careerMode } from '../../src/data/era-modes.js';

// Saves written by the build before the long career and late starts existed: a pre-internet career in its
// Web 2.0 chapter and a dot-com start in the bust.
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/era-career-saves.json', import.meta.url)));
const memory = (state) => {
  const map = new Map([[SAVE_KEY, JSON.stringify(state)]]);
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
};
const play = (s, weeks) => {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    if (s.pendingDecision) dispatch(s, { type: 'resolveDecision', choice: s.pendingDecision.choices.findIndex((c) => c.available) });
    tick(s);
  }
};

describe('career saves across builds', () => {
  it.each(Object.keys(fixtures))('loads an earlier %s save and keeps its calendar and career length', (key) => {
    const original = structuredClone(fixtures[key]);
    const loaded = loadGame(memory(original));
    expect(loaded.ok).toBe(true);
    const s = loaded.state;
    expect(s.founding).toEqual(original.founding);
    expect(calendarDate(s)).toEqual(calendarDate(original));
    expect(earlyWeeks(s)).toBe(earlyWeeks(original));
    expect(careerMode(s)).toBe(key.startsWith('long_career') ? 'long_career' : 'era_start');
    play(s, 30);
    expect(s.week).toBe(original.week + 30);
    expect(Number.isFinite(s.cash)).toBe(true);
  });

  it('reads chapter lengths from the save, so a retuned chapter calendar leaves running careers alone', () => {
    const s = createGame({ seed: 12, startEra: 'preinternet' });
    s.week = 300;
    const before = calendarDate(s);
    const end = B.anniversaryWeek + earlyWeeks(s);
    const mem = memory(s);
    const weeks = [B.preinternet.weeks, B.dotcom.weeks, B.web2.weeks];
    try {
      B.preinternet.weeks += 20; B.dotcom.weeks -= 30; B.web2.weeks += 52;
      const loaded = loadGame(mem).state;
      expect(calendarDate(loaded)).toEqual(before);
      expect(B.anniversaryWeek + earlyWeeks(loaded)).toBe(end);
      loaded.week = end - 2;
      endgameSystem(makeCtx(loaded));
      expect(loaded.gameOver).toBe(null);
      expect(saveGame(loaded, mem)).toBe(true);
      expect(loadGame(mem).state.founding.earlyChapters).toEqual(s.founding.earlyChapters);
    } finally {
      [B.preinternet.weeks, B.dotcom.weeks, B.web2.weeks] = weeks;
    }
  });
});
