import { describe, expect, it } from 'vitest';
import { ADVISORS, advisorPerson } from './advisors.js';
import { ROLE_COLORS } from './palette.js';

describe('advisors', () => {
  it('builds a portrait person per advisor, never in a staff role colour', () => {
    for (const key of Object.keys(ADVISORS)) {
      const p = advisorPerson(key);
      expect(p.id.startsWith('advisor:')).toBe(true);
      expect(Object.values(ROLE_COLORS)).not.toContain(p.roleColor);
      expect(p.pose).toBeNull();
      expect(advisorPerson(key, { idea: true }).pose).toBe('idea');
    }
    expect(advisorPerson('nobody')).toBeNull();
  });
});
