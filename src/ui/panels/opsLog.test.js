import { describe, expect, it } from 'vitest';
import { incidentLogCounts } from './ops.js';

describe('incidentLogCounts', () => {
  it('is singular at exactly one', () => {
    expect(incidentLogCounts({ incidents: 1, caught: 1, breaches: 1 })).toBe('1 incident · 1 caught · 1 breach');
  });
  it('is plural at zero and many, and treats missing counts as zero', () => {
    expect(incidentLogCounts({ incidents: 0, caught: 0, breaches: 2 })).toBe('0 incidents · 0 caught · 2 breaches');
    expect(incidentLogCounts({})).toBe('0 incidents · 0 caught · 0 breaches');
  });
});
