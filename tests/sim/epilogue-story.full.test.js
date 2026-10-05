import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';

// The epilogue as whole bot runs end it; the line order rules themselves are in epilogue-story.test.js.
describe('issue #151: the epilogue retells the run', () => {
  it('how it ended comes first, then the recap and one people line, then the consequences', () => {
    // The first seed whose run reaches the anniversary: which seeds do is up to balance, not this test.
    let st = null;
    for (let seed = 1; seed <= 8; seed++) {
      runBot('allHumans', seed, 1040, { setup: (s) => { st = s; }, onWeek: (s) => { st = s; } });
      if (st.gameOver?.reason === 'anniversary') break;
    }
    expect(st.gameOver.reason).toBe('anniversary');
    const lines = st.gameOver.epilogue;
    expect(lines[0]).toMatch(/turned twenty/);
    const recap = lines.findIndex((l) => new RegExp(`${st.stats.launches} launches`).test(l));
    expect(recap).toBe(1);
    expect(lines.length).toBeLessThanOrEqual(B.epilogueLines);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(l).not.toMatch(/[{}]/);
  }, 120000);
});

describe('consequences outrank flavour', () => {
  it('a breach-heavy run (sensible seed 2) always gets the breach line', () => {
    let st = null;
    runBot('sensible', 2, 1040, { setup: (s) => { st = s; }, onWeek: (s) => { st = s; } });
    expect(st.stats.breaches).toBeGreaterThanOrEqual(3);
    const lines = st.gameOver.epilogue;
    const breach = lines.findIndex((l) => l.startsWith('Your customer data now lives in several places'));
    expect(breach).toBeGreaterThan(-1);
    const flavour = lines.findIndex((l) => /leads its categories|lasted longer than most/.test(l));
    if (flavour > -1) expect(breach).toBeLessThan(flavour);
  }, 120000);
});
