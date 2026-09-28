import { describe, it, expect } from 'vitest';
import { saveFileName } from './saveFiles.js';

describe('save file names', () => {
  it('slugs the company name and keeps the slot id', () => {
    expect(saveFileName('Roundtrip Labs!', 's2')).toBe('roundtrip-labs-s2.hitl.json');
    expect(saveFileName('', null)).toBe('company.hitl.json');
    expect(saveFileName('日本', 's1')).toBe('company-s1.hitl.json');
  });
});
