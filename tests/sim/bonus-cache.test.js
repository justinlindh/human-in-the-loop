import { describe, it, expect } from 'vitest';
import { itemBonus } from '../../src/sim/bonus.js';
import { game, addStaff, addDesks } from './helpers.js';

// A cold cache per check: a copy of the state is a new key for the cache.
const fresh = (s, key) => itemBonus(structuredClone(s), key);

describe('itemBonus cache', () => {
  it('follows in-place changes to position, level, seating and headcount', () => {
    const s = game(1);
    addDesks(s, 4);
    for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid');
    s.office.placed.push({ id: 'i900', itemId: 'coffee_corner', level: 1, x: 0, y: 0, rot: 0 });
    const check = () => { for (const key of ['staminaRecovery', 'knowledgeGain', 'output']) expect(itemBonus(s, key), key).toBe(fresh(s, key)); };
    check();
    const corner = s.office.placed.at(-1);
    const desk = s.office.placed.find((p) => p.itemId === 'desk');
    corner.x = desk.x;
    corner.y = Math.max(0, desk.y - 2);
    check();
    corner.rot = 2;
    check();
    s.office.placed.push({ id: 'i901', itemId: 'espresso', level: 1, x: 10, y: 0, rot: 0 });
    check();
    s.office.placed.at(-1).level = 3;
    check();
    s.staff[1].deskId = null;
    check();
    s.staff.pop();
    check();
    s.office.placed.splice(s.office.placed.indexOf(corner), 1);
    check();
  });
});
