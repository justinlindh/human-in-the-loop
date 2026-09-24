import { describe, it, expect } from 'vitest';
import { recordStats, recordLine, recordLeaders, hasRecord } from './record.js';

const rec = (o) => ({ launches: 0, features: 0, prsMerged: 0, salesMrr: 0, deals: 0, tickets: 0, incidentsCaught: 0, mentored: 0, mentorWeeks: 3, ...o });

describe('track record', () => {
  it('stays hidden until the sim fills the work counters', () => {
    expect(hasRecord({ record: { mentorWeeks: 4, catches: 1 } })).toBe(false);
    expect(recordLine({ role: 'sales', record: { mentorWeeks: 4 } })).toBe('');
    expect(hasRecord({ record: rec({}) })).toBe(true);
  });
  it('leads with the role, hides zeros, formats money', () => {
    const sales = { role: 'sales', record: rec({ salesMrr: 1_200_000, deals: 14, launches: 2 }) };
    expect(recordLine(sales)).toBe('$1.2M in new MRR · 14 deals');
    const eng = { role: 'engineer', record: rec({ features: 38, prsMerged: 412, launches: 6, mentored: 1 }) };
    expect(recordLine(eng, 3)).toBe('38 features · 412 PRs merged · 6 launches');
    expect(recordStats(eng).at(-1).text).toBe('1 person mentored');
    expect(recordLine({ role: 'support', record: rec({ tickets: 1 }) })).toBe('1 ticket');
    expect(recordLine({ role: 'designer', record: rec({}) })).toBe('');
  });
  it('puts catches first for someone on oversight', () => {
    const p = { role: 'engineer', assignment: { type: 'oversight' }, record: rec({ features: 3, incidentsCaught: 5 }) };
    expect(recordStats(p)[0].key).toBe('incidentsCaught');
  });
  it('badges clear leaders only, one badge each', () => {
    const staff = [
      { id: 'a', record: rec({ salesMrr: 900, deals: 9 }) },
      { id: 'b', record: rec({ salesMrr: 100, deals: 2, tickets: 4 }) },
      { id: 'c', record: rec({ tickets: 4, features: 7 }) },
    ];
    const m = recordLeaders(staff);
    expect(m.get('a')).toBe('Top seller');
    expect(m.has('b')).toBe(false);          // tickets tie with c
    expect(m.get('c')).toBe('Top builder');
    expect(recordLeaders(staff.slice(0, 2)).size).toBe(0);
  });
});
