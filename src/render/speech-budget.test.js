import { describe, it, expect } from 'vitest';
import { createSpeechBudget } from './speech-budget.js';
import { readSeconds } from '../pacing.js';

describe('office speech attention', () => {
  it('caps unrelated speakers and leaves a quiet beat after a readable line', () => {
    const b = createSpeechBudget();
    expect(b.admit('a', 3, 0)).toBe(true);
    expect(b.admit('b', 3, 1)).toBe(false);
    b.step(3);
    expect(b.admit('b', 3, 0)).toBe(false);
    b.step(6);
    expect(b.admit('b', 3, 0)).toBe(true);
    b.step(9);
    expect(b.admit('a', 3, 0)).toBe(false);
    b.step(2);
    expect(b.admit('a', 3, 0)).toBe(true);
  });
  it('never suppresses a moment line under a full room or person cooldown', () => {
    const b = createSpeechBudget();
    b.admit('a', 6, 0);
    expect(b.admit('a', 6, 4, { moment: 'waffle_party' })).toBe(true);
  });
  it.each([1, 2, 4])('allows the reading minimum plus fading at %ix', speed => {
    for (const text of ['Hi.', Array(40).fill('word').join(' ')]) {
      expect(readSeconds(text, speed) - 0.4).toBeGreaterThanOrEqual(Math.max(2.5, text.split(/\s+/).length * 0.25));
    }
  });
});
