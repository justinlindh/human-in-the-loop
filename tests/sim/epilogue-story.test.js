import { describe, it, expect } from 'vitest';
import { buildEpilogue } from '../../src/sim/endgame.js';
import { onDeparture } from '../../src/sim/knowledge.js';
import { B } from '../../src/sim/balance.js';
import { EPILOGUES } from '../../src/data/epilogues.js';
import { game, addStaff, passOfficeGates } from './helpers.js';

const textOf = (id) => EPILOGUES.find((e) => e.id === id).text.split('{')[0];

describe('issue #151: the epilogue retells the run', () => {
  // The epilogue of whole bot runs is checked in epilogue-story.full.test.js.
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
