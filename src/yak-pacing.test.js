import { it, expect } from 'vitest';
import { createYakPacer } from './yak-pacing.js';
const msg = (id, extra = {}) => ({ type: 'chat', id, text: 'A short message', fromId: 'a', channel: 'general', ...extra });
it('paces a burst by reading time and stops the clock while paused', () => {
  const p = createYakPacer(); p.enqueue([msg('a'), msg('b')]);
  expect(p.step(0, true).map(e => e.id)).toEqual(['a']);
  expect(p.step(100, false)).toEqual([]);
  expect(p.step(5, true)).toEqual([]);
  expect(p.step(1, true).map(e => e.id)).toEqual(['b']);
});
it('keeps important messages ahead of ambient backlog and retains their parents', () => {
  const p = createYakPacer(); p.enqueue([msg('a'), msg('root'), msg('reply', { replyTo: 'root', important: true })]);
  expect(p.step(0, true)[0].id).toBe('root');
  expect(p.step(6, true)[0].id).toBe('reply');
});
it('does not delay a prompt or player reply while paused', () => {
  const p = createYakPacer(); p.enqueue([msg('a')]);
  expect(p.enqueue([msg('prompt')], { urgentIds: new Set(['prompt']) }).map(e => e.id)).toEqual(['prompt']);
  expect(p.step(0, true)).toEqual([]);
});
it('bounds ordinary backlog, drops stale threads and resets between companies', () => {
  const p = createYakPacer(); p.enqueue(Array.from({length: 100}, (_, i) => msg(String(i))));
  expect(p.queued).toBeLessThanOrEqual(40);
  expect(p.step(31, true)).toEqual([]);
  p.enqueue([msg('end', { important: true })]); p.reset();
  expect(p.queued).toBe(0);
});
