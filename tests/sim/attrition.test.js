import { describe, it, expect } from 'vitest';
import { makeCtx } from '../../src/sim/registry.js';
import { attritionRisk, attritionSystem } from '../../src/sim/alumni.js';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { game, addStaff, withItem } from './helpers.js';

describe('natural attrition', () => {
  it('unhappy, underpaid, and rival-courted people are likelier to leave; perks and good policies keep them', () => {
    const s = game(2);
    const p = addStaff(s, 'engineer', 'mid', { meaning: 80, mood: 'ok' });
    const base = attritionRisk(s, p);
    expect(attritionRisk(s, { ...p, meaning: 30, mood: 'coasting' })).toBeGreaterThan(base * 2);
    expect(attritionRisk(s, { ...p, salary: p.salary * 0.8 })).toBeGreaterThan(base);
    s.rival = { name: 'Rivalry Inc', status: 'rising', strength: 10 };
    expect(attritionRisk(s, p)).toBeGreaterThan(base);
    s.rival = null;
    s.policies.sabbatical = true;
    s.policies.craft_fridays = true;
    expect(attritionRisk(s, p)).toBeLessThan(base);
    withItem(s, 'plant_wall', 3);
    expect(attritionRisk(s, p)).toBeLessThan(base * B.attritionGoodPolicy ** 2);
  });

  it('a departure is a poached resignation with a farewell, and the person joins the alumni', () => {
    const s = game(3);
    for (let i = 0; i < 8; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: -100, meaning: 10, mood: 'burnout' });
    let ev = [];
    for (let w = 0; w < 400 && !ev.some((e) => e.type === 'resign'); w++) {
      const c = makeCtx(s);
      attritionSystem(c);
      ev = c.events;
      s.week++;
    }
    const r = ev.find((e) => e.type === 'resign');
    expect(r).toMatchObject({ fired: false, reason: 'poached' });
    expect(ev.some((e) => e.type === 'chat' && e.fromId === r.staffId)).toBe(true);
    expect(ev.find((e) => e.type === 'toast')).toMatchObject({ tone: 'good' });
    expect(s.stats.resignations).toBe(1);
    expect(s.flags.alumni.at(-1).name).toBe(r.name);
  });

  it('a balanced company loses someone every year or two, not zero and not a flood', () => {
    const rates = [];
    for (const seed of [1, 2, 3, 4]) {
      let n = 0;
      let weeks = 0;
      runBot('balanced', seed, 780, { onWeek: (s, ev) => { weeks++; n += ev.filter((e) => e.type === 'resign' && !e.fired).length; } });
      rates.push(n / (weeks / 52));
    }
    const mean = rates.reduce((a, b) => a + b) / rates.length;
    expect(mean).toBeGreaterThanOrEqual(0.4);
    expect(mean).toBeLessThanOrEqual(1.2);
  }, 120000);
});
