import { describe, it, expect } from 'vitest';
import { createSpeechBudget, speechMax } from './speech-budget.js';
import { B } from '../sim/balance.js';
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
  it('lets an ordered standup reply use a free slot without weakening ambient cooldowns', () => {
    const b = createSpeechBudget();
    expect(b.admit('a', 3, 0)).toBe(true);
    expect(b.admit('a', 3, 1, { standup: true })).toBe(false);
    b.step(3);
    expect(b.admit('a', 3, 0, { standup: true })).toBe(true);
    b.step(3);
    expect(b.admit('b', 3, 0)).toBe(false);
    b.step(6);
    expect(b.admit('b', 3, 0)).toBe(true);
  });
  it('allows one more ordinary bubble for each bubbleStaffPerExtra people, up to the cap', () => {
    const per = B.bubbleStaffPerExtra;
    expect([0, per - 1, per, 2 * per - 1, 2 * per, 10 * per].map(speechMax)).toEqual([1, 1, 2, 2, 3, B.bubbleMaxOnScreen]);
  });
  it('lets a bigger office speak on parallel slots, each with its own quiet beat', () => {
    const b = createSpeechBudget();
    b.step(0, 2 * B.bubbleStaffPerExtra);
    expect(b.admit('a', 3, 0)).toBe(true);
    expect(b.admit('b', 3, 1)).toBe(true);
    expect(b.admit('c', 3, 2)).toBe(true);
    expect(b.admit('d', 3, 3)).toBe(false);
    b.step(3, 2 * B.bubbleStaffPerExtra);
    // The lines have ended, but every slot is still in its quiet beat.
    expect(b.admit('d', 3, 0)).toBe(false);
    b.step(6, 2 * B.bubbleStaffPerExtra);
    expect(b.admit('d', 3, 0)).toBe(true);
    expect(b.admit('e', 3, 1)).toBe(true);
  });
  it('keeps a small office to one bubble', () => {
    const b = createSpeechBudget();
    b.step(0, B.bubbleStaffPerExtra - 1);
    expect(b.admit('a', 3, 0)).toBe(true);
    expect(b.admit('b', 3, 1)).toBe(false);
    expect(b.admit('b', 3, 0)).toBe(false);
  });
  it.each([1, 2, 4])('allows the reading minimum plus fading at %ix', speed => {
    for (const text of ['Hi.', Array(40).fill('word').join(' ')]) {
      expect(readSeconds(text, speed) - 0.4).toBeGreaterThanOrEqual(Math.max(2.5, text.split(/\s+/).length * 0.25));
    }
  });
});
