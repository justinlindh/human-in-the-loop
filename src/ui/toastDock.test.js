import { describe, it, expect } from 'vitest';
import { dockTop } from './toasts.js';

const t = (id, tone, at, answer = false) => ({ id, tone, at, answer });

describe('toast dock choice', () => {
  it('shows the most severe toast, newest among equals', () => {
    expect(dockTop([t(1, 'info', 0), t(2, 'bad', 0), t(3, 'warn', 0)], 100).id).toBe(2);
    expect(dockTop([t(1, 'warn', 0), t(2, 'warn', 5)], 100).id).toBe(2);
  });
  it('lets the answer to the player\'s action outrank a severe toast for a few seconds', () => {
    const live = [t(1, 'bad', 0), t(2, 'warn', 10, true)];
    expect(dockTop(live, 500).id).toBe(2);
    expect(dockTop(live, 10 + 4001).id).toBe(1);
  });
  it('does not promote a severe toast that merely landed near a click', () => {
    const live = [t(1, 'warn', 0, true), t(2, 'bad', 300, false)];
    expect(dockTop(live, 400).id).toBe(1);
  });
});
