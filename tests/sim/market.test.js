import { describe, it, expect } from 'vitest';
import { calendarStart } from '../../src/sim/vendors.js';
import { marketSystem, categoryLeaders, cloneChance } from '../../src/sim/market.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { CATEGORIES } from '../../src/data/categories.js';
import { game, addProduct } from './helpers.js';

const at = (s, week, fn) => { s.week = week; const c = makeCtx(s); fn(c); return c.events; };

describe('year start unlocks', () => {
  it('unlocks categories, angles, and models at the year boundary', () => {
    const s = game();
    expect(s.market.unlockedCategories).not.toContain('crm');
    at(s, 51, calendarStart);
    expect(s.market.unlockedCategories).not.toContain('crm');
    const ev = at(s, 52, calendarStart);
    expect(s.market.unlockedCategories).toEqual(expect.arrayContaining(['crm', 'analytics']));
    expect(s.market.unlockedAngles).toEqual(expect.arrayContaining(['agent', 'native']));
    expect(s.models.mistrale.available).toBe(true);
    expect(ev.filter((e) => e.type === 'toast' && e.tone === 'info').length).toBeGreaterThanOrEqual(5);
    const again = at(s, 104, calendarStart).filter((e) => e.type === 'toast' && e.text.includes('CRM'));
    expect(again).toHaveLength(0);
  });
});

describe('trends', () => {
  it('rotate to a different trend when the countdown ends', () => {
    const s = game();
    s.market.trendWeeksLeft = 1;
    const ev = at(s, 5, calendarStart);
    expect(s.market.trend).not.toBe('steady');
    expect(s.market.trendWeeksLeft).toBeGreaterThan(1);
    expect(ev.some((e) => e.type === 'toast')).toBe(true);
  });
});

describe('vendor releases', () => {
  it('a release with deprecation sets migration deadlines on affected products only', () => {
    const s = game(3);
    for (const m of Object.keys(s.models)) if (m !== 'claudius') s.models[m].available = false;
    const hit = addProduct(s, { model: 'claudius' });
    const safe = addProduct(s, { model: 'chatgbt' });
    const orig = B.deprecateChance;
    B.deprecateChance = 1;
    try {
      const ev = at(s, B.vendorReleaseEveryWeeks, calendarStart);
      expect(s.models.claudius.version).toBe(2);
      expect(s.models.claudius.capability).toBe(80 + B.vendorCapabilityStep);
      expect(hit.migrationDueWeek).toBe(B.vendorReleaseEveryWeeks + B.migrationDeadlineWeeks);
      expect(safe.migrationDueWeek).toBe(null);
      expect(ev.some((e) => e.type === 'chat' && e.from === '@vendorbot' && e.fromId === null)).toBe(true);
      expect(ev.some((e) => e.type === 'toast' && e.tone === 'warn')).toBe(true);
    } finally {
      B.deprecateChance = orig;
    }
  });

  it('no release happens at week 0 or off-cycle', () => {
    const s = game();
    const before = JSON.stringify(s.models);
    at(s, 0, calendarStart);
    at(s, 7, calendarStart);
    expect(JSON.stringify(s.models)).toBe(before);
  });
});

describe('clones', () => {
  it('clone chance grows with the year', () => {
    const s = game();
    const y0 = cloneChance(s);
    s.week = 52 * 5;
    expect(cloneChance(s)).toBeGreaterThan(y0);
  });

  it('clones spawn only in categories with a good product', () => {
    const s = game();
    addProduct(s, { category: 'email', score: 8 });
    addProduct(s, { category: 'notes', score: 4 });
    let chats = 0;
    for (let w = 0; w < 400; w++) chats += at(s, w, marketSystem).filter((e) => e.type === 'chat' && e.from === '@hackernewsbot').length;
    expect(s.market.categories.email.clones).toBeGreaterThan(0);
    expect(s.market.categories.notes.clones).toBe(0);
    expect(chats).toBeGreaterThan(0);
  });
});

describe('incumbent copying', () => {
  it('halves novelty exactly once and strengthens the incumbent', () => {
    const s = game();
    const p = addProduct(s, { score: 7, novelty: 8, copyAtWeek: 10 });
    const strength = s.market.categories.email.incumbentStrength;
    at(s, 9, marketSystem);
    expect(p.copied).toBe(false);
    const ev = at(s, 10, marketSystem);
    expect(p.copied).toBe(true);
    expect(p.novelty).toBe(4);
    expect(s.market.categories.email.incumbentStrength).toBeCloseTo(strength * B.copyIncumbentMult);
    expect(ev.some((e) => e.type === 'toast' && e.text.includes('Gmale'))).toBe(true);
    at(s, 11, marketSystem);
    expect(p.novelty).toBe(4);
  });

  it('does not copy weak products', () => {
    const s = game();
    const p = addProduct(s, { score: 4, novelty: 8, copyAtWeek: 0 });
    at(s, 5, marketSystem);
    expect(p.copied).toBe(false);
  });
});

describe('categoryLeaders', () => {
  it('detects categories where you out-share the incumbent', () => {
    const s = game();
    s.market.categories.email.incumbentStrength = 20;
    addProduct(s, { category: 'email', customers: CATEGORIES.email.tam * 0.9 });
    addProduct(s, { category: 'notes', customers: 10 });
    expect(categoryLeaders(s)).toEqual(['email']);
    s.products[0].killed = true;
    expect(categoryLeaders(s)).toEqual([]);
  });
});
