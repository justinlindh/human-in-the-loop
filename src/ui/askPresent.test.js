import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bringAsk } from './askPresent.js';
import { B } from '../sim/balance.js';

const real = B.pacing;
beforeEach(() => { B.pacing = { askQueue: true }; });
afterEach(() => { B.pacing = real; });

const act = () => ({ openMail: vi.fn(), revealPrompt: vi.fn() });

it('a presented letter opens Mail on it, falling back to the newest mail', () => {
  const a = act();
  expect(bringAsk({ type: 'askPresented', kind: 'letter', mailId: 'm7' }, { mail: [{ id: 'm9' }] }, a)).toBe(true);
  expect(a.openMail).toHaveBeenCalledWith({ mailId: 'm7' });
  bringAsk({ type: 'askPresented', kind: 'letter', mailId: null }, { mail: [{ id: 'm9' }] }, a);
  expect(a.openMail).toHaveBeenLastCalledWith({ mailId: 'm9' });
  expect(a.revealPrompt).not.toHaveBeenCalled();
});

it('a presented prompt reveals it in Yak', () => {
  const a = act();
  expect(bringAsk({ type: 'askPresented', kind: 'prompt', promptId: 'p1' }, {}, a)).toBe(true);
  expect(a.revealPrompt).toHaveBeenCalledWith('p1');
  expect(a.openMail).not.toHaveBeenCalled();
});

it('a decision, or the switch off, does nothing', () => {
  const a = act();
  expect(bringAsk({ type: 'askPresented', kind: 'decision' }, {}, a)).toBe(false);
  B.pacing = { askQueue: false };
  expect(bringAsk({ type: 'askPresented', kind: 'letter', mailId: 'm1' }, {}, a)).toBe(false);
  expect(bringAsk({ type: 'askPresented', kind: 'prompt', promptId: 'p1' }, {}, a)).toBe(false);
  expect(a.openMail).not.toHaveBeenCalled();
  expect(a.revealPrompt).not.toHaveBeenCalled();
});
