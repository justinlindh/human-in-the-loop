import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { buildEpilogue } from '../../src/sim/endgame.js';
import { game, addStaff, passOfficeGates } from './helpers.js';

describe('issue #151: the epilogue retells the run', () => {
  it('a 20-year run opens with where the company ended up, what it shipped, and who was there', () => {
    let st = null;
    const r = runBot('allHumans', 2, 1040, { setup: (s) => { st = s; }, onWeek: (s) => { st = s; } });
    expect(r.reason).toBe('anniversary');
    const lines = st.gameOver.epilogue;
    expect(lines[0]).toMatch(new RegExp(`${st.stats.launches} launches`));
    expect(lines[0]).not.toMatch(/never left the garage/);
    for (const l of lines) expect(l).not.toMatch(/[{}]/);
  }, 120000);

  it('names the office reached and the longest-serving person', () => {
    const s = passOfficeGates(game(3));
    s.cash = 1e9;
    s.officeStage = 2;
    s.office.stage = 2;
    s.stats.launches = 7;
    s.week = 1040;
    const v = addStaff(s, 'designer', 'senior', { hiredWeek: 100 });
    const lines = buildEpilogue(s, { won: true, reason: 'anniversary' });
    expect(lines[0]).toMatch(/started in a garage and ended up in its own HQ\. 7 launches/);
    expect(lines.some((l) => l.includes(`${v.name} has been at`))).toBe(true);
  });
});
