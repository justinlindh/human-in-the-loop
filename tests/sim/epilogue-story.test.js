import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { buildEpilogue } from '../../src/sim/endgame.js';
import { onDeparture } from '../../src/sim/knowledge.js';
import { B } from '../../src/sim/balance.js';
import { EPILOGUES } from '../../src/data/epilogues.js';
import { game, addStaff, passOfficeGates } from './helpers.js';

const textOf = (id) => EPILOGUES.find((e) => e.id === id).text.split('{')[0];

describe('issue #151: the epilogue retells the run', () => {
  it('how it ended comes first, then the recap and one people line, then the consequences', () => {
    // The first seed whose run reaches the anniversary.
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

  it('names the office reached and the longest-serving person, after the outcome', () => {
    const s = passOfficeGates(game(3));
    s.officeStage = 2;
    s.office.stage = 2;
    s.stats.launches = 7;
    s.stats.peakMrr = 2e6;
    s.week = 1040;
    const v = addStaff(s, 'designer', 'senior', { hiredWeek: 100 });
    const lines = buildEpilogue(s, { won: true, reason: 'anniversary' });
    expect(lines[0]).toContain(textOf('anniversary_big').replace('{company}', ''));
    expect(lines[1]).toMatch(/started in a garage and ended up in its own HQ\. 7 launches/);
    expect(lines[2]).toContain(`${v.name} has been at`);
  });

  it('counts every alum, not just the ones the alumni list keeps', () => {
    const s = game(4);
    for (let i = 0; i < B.alumniKept + 15; i++) {
      const p = addStaff(s, 'engineer', 'mid');
      s.staff.splice(s.staff.indexOf(p), 1);
      onDeparture(s, p);
    }
    s.stats.launches = 3;
    s.week = 1040;
    const lines = buildEpilogue(s, { won: true, reason: 'anniversary' });
    expect(lines.join(' ')).toContain(`${B.alumniKept + 15} people have worked at`);
  });
});

describe('consequences outrank flavour', () => {
  it('the reviewer case: sensible seed 1 with 14 breaches always gets the breach line', () => {
    let st = null;
    runBot('sensible', 1, 1040, { setup: (s) => { st = s; }, onWeek: (s) => { st = s; } });
    expect(st.stats.breaches).toBeGreaterThanOrEqual(3);
    const lines = st.gameOver.epilogue;
    const breach = lines.findIndex((l) => l.startsWith('Your customer data now lives in several places'));
    expect(breach).toBeGreaterThan(-1);
    const flavour = lines.findIndex((l) => /leads its categories|lasted longer than most/.test(l));
    if (flavour > -1) expect(breach).toBeLessThan(flavour);
  }, 120000);

  it('the more a run earned a consequence, the higher it ranks', () => {
    const s = game(9);
    s.week = 1040;
    s.stats.launches = 5;
    s.stats.breaches = 20;
    s.stats.juniorsHired = 6;
    s.comprehensionDebt = 70;
    const lines = buildEpilogue(s, { won: true, reason: 'anniversary' });
    const at = (re) => lines.findIndex((l) => re.test(l));
    expect(at(/customer data now lives/)).toBeLessThan(at(/billing service/));
    expect(at(/billing service/)).toBeLessThan(at(/former juniors/));
  });
});
