// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { h } from './dom.js';
import { createToasts } from './toasts.js';
import { pTick, pReset } from './pclock.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

let listeners;
beforeEach(() => {
  pReset();
  vi.useFakeTimers();
  listeners = vi.spyOn(globalThis, 'addEventListener');
});
afterEach(() => {
  for (const args of listeners.mock.calls) removeEventListener(...args);
  delete globalThis.__hitlHooks;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('does nothing without the hooks', () => {
  const clicked = vi.fn();
  const b = h('button', { onclick: clicked });
  b.click();
  expect(clicked).toHaveBeenCalledTimes(1);
  const root = document.createElement('div');
  document.body.append(root);
  createToasts(root).push('Hello', 'info');
  pTick(1);
  const n = root.querySelector('.toast');
  expect(n.dataset.toastId).toBeTruthy();
  expect(n.dataset.toastTag).toBeUndefined();
});

it('lets a tool see each element and wrap each handler', () => {
  const created = vi.fn();
  const seen = [];
  globalThis.__hitlHooks = { created, listener: (fn) => (...a) => { seen.push('wrapped'); return fn(...a); } };
  const clicked = vi.fn();
  const b = h('button', { onclick: clicked });
  expect(created).toHaveBeenCalledWith(b);
  b.click();
  expect(seen).toEqual(['wrapped']);
  expect(clicked).toHaveBeenCalledTimes(1);
});

it('tags a toast with who caused it when it is pushed, through the queue and the hold', () => {
  let who = 'game';
  globalThis.__hitlHooks = { origin: () => who };
  const root = document.createElement('div');
  document.body.append(root);
  let visible = true;
  const toasts = createToasts(root);
  toasts.push('First', 'info');
  pTick(1);
  who = 'player';
  toasts.push('Second', 'info');
  who = 'game';
  pTick(1000);
  const tags = () => [...root.querySelectorAll('.toast:not(.out)')].map((n) => `${n.querySelector('.tt').textContent}:${n.dataset.toastTag}`);
  expect(tags()).toEqual(['First:game', 'Second:player']);
  // A toast held while the phone view is hidden keeps its tag when it comes back.
  toasts.setHidden(true);
  toasts.setHidden(false);
  expect(tags().sort()).toEqual(['First:game', 'Second:player']);
  expect(visible).toBe(true);
});
