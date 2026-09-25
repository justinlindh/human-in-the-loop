import { describe, it, expect } from 'vitest';
import { TRENDS } from '../../src/data/trends.js';
import { TRAITS } from '../../src/data/traits.js';

describe('issue #131: no agent copy before agents exist', () => {
  it('AI-themed trends carry their era', () => {
    for (const id of ['agents_hot', 'compliance']) expect(TRENDS[id].eras).toEqual(['agents', 'consolidation', 'plateau']);
    expect(TRENDS.ai_fatigue.eras).not.toContain('classic');
  });

  it('traits about agents only appear on hires from the Agents era', async () => {
    const { generateStaff } = await import('../../src/sim/staff.js');
    const { classicGame } = await import('./helpers.js');
    for (const t of Object.values(TRAITS)) if (/\bagents?\b/i.test(t.desc)) expect(t.era, t.id).toBe('agents');
    const s = classicGame(3);
    s.era = { id: 'chatgbt', since: 0 };
    const seen = new Set();
    for (let i = 0; i < 400; i++) for (const t of generateStaff(s, { role: 'security', seniority: 'mid' }).traits) seen.add(t);
    expect(seen.has('paranoid') || seen.has('red_teamer')).toBe(false);
    s.era = { id: 'agents', since: 0 };
    for (let i = 0; i < 400; i++) for (const t of generateStaff(s, { role: 'security', seniority: 'mid' }).traits) seen.add(t);
    expect(seen.has('paranoid') || seen.has('red_teamer')).toBe(true);
  });
});

describe('the trend toast', () => {
  it('carries the id of the trend it announces', async () => {
    const { makeCtx } = await import('../../src/sim/registry.js');
    const { calendarStart } = await import('../../src/sim/vendors.js');
    const { game } = await import('./helpers.js');
    const s = game(2);
    s.market.trendWeeksLeft = 1;
    const c = makeCtx(s);
    calendarStart(c);
    const toast = c.events.find((e) => e.type === 'toast' && e.text.startsWith('Trend: '));
    expect(toast.trendId).toBe(s.market.trend);
    expect(TRENDS[toast.trendId]).toBeTruthy();
  });
});

describe('the standing desks item', () => {
  it('reads as an office-wide perk, not a seat', async () => {
    const { ITEMS } = await import('../../src/data/items.js');
    const d = ITEMS.standing_desk;
    expect(d.desc).toMatch(/Not a seat/);
    expect(d.desc).toMatch(/everyone/i);
    expect(d.effects[0].staminaDrain).toBeLessThan(0);
  });
});
