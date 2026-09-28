import { describe, it, expect } from 'vitest';
import { staffUpPool, staffUpMatches } from './bulkAssign.js';

const person = (id, type, role, seniority, mood = 'content') => ({ id, role, seniority, mood, assignment: { type, targetId: null } });

describe('staff up', () => {
  const s = { staff: [
    person('a', 'maintenance', 'engineer', 'senior'),
    person('b', 'idle', 'designer', 'junior'),
    person('c', 'project', 'engineer', 'mid'),
    person('d', 'maintenance', 'engineer', 'junior', 'away'),
    person('e', 'sabbatical', 'engineer', 'mid'),
    person('f', 'maintenance', 'engineer', 'mid'),
  ] };

  it('pools only available people on maintenance or idle', () => {
    expect(staffUpPool(s).map((p) => p.id)).toEqual(['a', 'b', 'f']);
  });

  it('empty filter sets mean any', () => {
    const pool = staffUpPool(s);
    const none = { from: new Set(), roles: new Set(), seniority: new Set() };
    expect(staffUpMatches(pool, none).map((p) => p.id)).toEqual(['a', 'b', 'f']);
    expect(staffUpMatches(pool, { ...none, roles: new Set(['engineer']) }).map((p) => p.id)).toEqual(['a', 'f']);
    expect(staffUpMatches(pool, { ...none, from: new Set(['idle']) }).map((p) => p.id)).toEqual(['b']);
    expect(staffUpMatches(pool, { ...none, roles: new Set(['engineer']), seniority: new Set(['mid']) }).map((p) => p.id)).toEqual(['f']);
  });
});
