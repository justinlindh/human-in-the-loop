// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createToasts } from './toasts.js';

// The icon manifest is a network asset; the real icon code can use its built-in glyphs.
vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

let listeners;
beforeEach(() => {
  vi.useFakeTimers();
  listeners = vi.spyOn(globalThis, 'addEventListener');
});

afterEach(() => {
  for (const args of listeners.mock.calls) removeEventListener(...args);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('keeps a player refusal on top of a severe toast until its dock priority window ends', () => {
  const root = document.createElement('div');
  const dock = document.createElement('div');
  document.body.append(root);
  root.append(dock);
  const toasts = createToasts(root);
  toasts.setDock(dock);

  const refusal = 'Not enough cash to hire';
  const incident = 'Production is down';
  toasts.push(refusal, 'warn', { player: true });
  expect(dock.querySelector('.dtoast.warn .tt')?.textContent).toBe(refusal);

  vi.advanceTimersByTime(2000);
  toasts.push(incident, 'bad');
  expect(dock.querySelector('.tt')?.textContent).toBe(refusal);
  expect(dock.querySelector('.more')?.textContent).toBe('+1');

  // A week refresh re-evaluates the dock while both toasts are still alive.
  vi.advanceTimersByTime(1999);
  toasts.setWeek(1);
  expect(dock.querySelector('.tt')?.textContent).toBe(refusal);

  vi.advanceTimersByTime(1);
  toasts.setWeek(2);
  expect(dock.querySelector('.dtoast.bad .tt')?.textContent).toBe(incident);
  expect(dock.querySelector('.more')?.textContent).toBe('+1');

  vi.advanceTimersByTime(7000);
  expect(dock.querySelector('.dtoast')).toBeNull();
  expect(dock.querySelector('.dockidle')).not.toBeNull();
});
