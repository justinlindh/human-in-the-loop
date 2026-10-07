import { describe, expect, it } from 'vitest';
import { ambientDetail } from './ambient.js';

describe('the water cooler "shared" toast as a desk bubble', () => {
  it('shows its short text over the person who gained most', () => {
    expect(ambientDetail({ topic: 'shared', subjectId: 's7', short: 'Context shared', tone: 'good' }))
      .toMatchObject({ topic: 'shared', subjectId: 's7', subjectKind: 'staff', text: 'Context shared', tone: 'good' });
  });

  it('falls back to its own words when the toast has no short text', () => {
    expect(ambientDetail({ topic: 'shared', subjectId: 's7' }).text).toBe('Context shared');
  });
});
