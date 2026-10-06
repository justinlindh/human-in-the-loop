// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createChat } from './chat.js';
import { B } from '../sim/balance.js';

// The icon manifest is a network asset; the real icon code can use its built-in glyphs.
vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

let listeners;
const real = B.pacing;
beforeEach(() => {
  B.pacing = {}; // the ordinary three levels unless a case turns quietYak on
  vi.useFakeTimers();
  localStorage.clear();
  listeners = vi.spyOn(window, 'addEventListener');
});

afterEach(() => {
  for (const args of listeners.mock.calls) window.removeEventListener(...args);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  B.pacing = real;
  document.body.replaceChildren();
});

it('counts a priority reply in the collapsed Yak badge at Important and clears it when opened', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const chat = createChat(root);
  const level = root.querySelector('.ylevel');
  expect(level.dataset.level).toBe('all');
  level.click();
  expect(level.dataset.level).toBe('important');

  const head = root.querySelector('.chat-head');
  head.click();
  expect(chat.el.classList.contains('collapsed')).toBe(true);
  const badge = head.querySelector('.count');
  const channelBadge = root.querySelector('.ctab.on .cbadge');
  const message = { type: 'chat', channel: 'general', from: 'Sam', text: 'Lunch?' };
  chat.add({ ...message, id: 'post' }, 1);
  chat.add({ ...message, id: 'ordinary-reply', replyTo: 'post', text: 'Soon.' }, 1);
  expect(badge.textContent).toBe('');
  expect(badge.classList.contains('show')).toBe(false);
  expect(channelBadge.textContent).toBe('');

  chat.add({ ...message, id: 'priority-reply', replyTo: 'post', priority: true, text: 'On my way.' }, 1);
  expect(root.querySelector('.msg.reply[data-id="priority-reply"] .mtext')?.textContent).toBe('On my way.');
  expect(badge.textContent).toBe('1');
  expect(badge.classList.contains('show')).toBe(true);
  expect(channelBadge.textContent).toBe('1');
  expect(channelBadge.classList.contains('show')).toBe(true);

  head.click();
  expect(chat.el.classList.contains('collapsed')).toBe(false);
  expect(badge.textContent).toBe('');
  expect(badge.classList.contains('show')).toBe(false);
  expect(channelBadge.textContent).toBe('');
  head.click();
  expect(badge.classList.contains('show')).toBe(false);
});

it.each([[true, ''], [false, '1']])('quietYak %s: flavour at the All level leaves the collapsed badge as "%s"', (on, shown) => {
  B.pacing = { quietYak: on };
  const root = document.createElement('div');
  document.body.append(root);
  const chat = createChat(root);
  const head = root.querySelector('.chat-head');
  head.click();
  expect(chat.el.classList.contains('collapsed')).toBe(true);
  chat.add({ type: 'chat', channel: 'general', from: 'Sam', text: 'Lunch?', id: 'a' }, 1);
  expect(head.querySelector('.count').textContent).toBe(shown);
  chat.add({ type: 'chat', channel: 'incidents', from: '@oncall', text: 'Paged.', id: 'b' }, 1);
  expect(head.querySelector('.count').textContent).toBe(on ? '1' : '2');
  delete B.pacing;
});
