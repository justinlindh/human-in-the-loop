// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createChat } from './chat.js';
import { createGame } from '../sim/state.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());
let listeners;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); listeners = vi.spyOn(window, 'addEventListener'); });
afterEach(() => {
  for (const args of listeners.mock.calls) window.removeEventListener(...args);
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  localStorage.clear(); document.body.replaceChildren();
});

const game = () => {
  const s = createGame({ seed: 11 });
  s.chatLog = [{ id: 'root', type: 'chat', channel: 'random', from: 'Sam', text: 'Lunch?', week: 0 }];
  s.chatPrompts = [{ id: 'p1', chatId: 'root', channel: 'random', expiresWeek: 9, options: [{ label: 'Sure', hint: 'Go.' }] }];
  return s;
};

it('reports a prompt as shown once, only when it is in the open channel with Yak expanded', () => {
  const s = game();
  const root = document.createElement('div');
  document.body.append(root);
  const onShown = vi.fn();
  const chat = createChat(root, { getState: () => s, onShown });
  chat.reset(s);
  chat.update(s);
  // Queued in another channel: not shown.
  expect(onShown).not.toHaveBeenCalled();
  // Collapsed Yak, even with the channel selected: not shown.
  root.querySelector('.chat-head').click();
  chat.revealPrompt('p1');
  chat.update(s);
  expect(onShown).toHaveBeenCalledTimes(1);
  expect(onShown).toHaveBeenCalledWith('p1');
  chat.update(s);
  chat.update(s);
  expect(onShown).toHaveBeenCalledTimes(1);
});

it('does not report a prompt while Yak is collapsed on its channel', () => {
  const s = game();
  const root = document.createElement('div');
  document.body.append(root);
  const onShown = vi.fn();
  const chat = createChat(root, { getState: () => s, onShown });
  chat.reset(s);
  [...root.querySelectorAll('.ctab')].find((t) => t.textContent.includes('random')).click();
  root.querySelector('.chat-head').click();
  chat.update(s);
  expect(chat.el.classList.contains('collapsed')).toBe(true);
  expect(onShown).not.toHaveBeenCalled();
});

it('an open prompt puts a Reply dot on its channel tab while Yak is open on another channel, until it resolves', () => {
  const s = game();
  const root = document.createElement('div');
  document.body.append(root);
  const chat = createChat(root, { getState: () => s });
  chat.reset(s);
  chat.update(s);
  expect(chat.el.classList.contains('collapsed')).toBe(false);
  expect(root.querySelector('.ctab.on').textContent).toContain('general');
  const tabs = [...root.querySelectorAll('.ctab')];
  expect(tabs.filter((t) => t.classList.contains('prompt')).map((t) => t.textContent)).toEqual([expect.stringContaining('random')]);
  s.chatPrompts[0].resolved = { choice: 0, week: s.week };
  chat.update(s);
  expect(root.querySelectorAll('.ctab.prompt')).toHaveLength(0);
});

it('a presented prompt expands a collapsed Yak and selects its channel', () => {
  const s = game();
  const root = document.createElement('div');
  document.body.append(root);
  const chat = createChat(root, { getState: () => s });
  chat.reset(s);
  chat.update(s);
  root.querySelector('.chat-head').click();
  expect(chat.el.classList.contains('collapsed')).toBe(true);
  expect(root.querySelector('.ctab.on').textContent).toContain('general');

  chat.revealPrompt('p1');
  chat.update(s);
  expect(chat.el.classList.contains('collapsed')).toBe(false);
  expect(root.querySelector('.ctab.on').textContent).toContain('random');
  expect(root.querySelector('.yprompt[data-prompt="p1"]')).not.toBeNull();
});

it('does nothing until a prompt is open, and only once', () => {
  const s = game();
  const root = document.createElement('div');
  document.body.append(root);
  const chat = createChat(root, { getState: () => s });
  chat.reset(game());
  const none = { ...s, chatPrompts: [] };
  chat.update(none);
  root.querySelector('.chat-head').click();
  chat.revealPrompt('p1');
  chat.update(none);
  expect(chat.el.classList.contains('collapsed')).toBe(true);
  chat.update(s);
  expect(chat.el.classList.contains('collapsed')).toBe(false);
  root.querySelector('.chat-head').click();
  chat.update(s);
  expect(chat.el.classList.contains('collapsed')).toBe(true);
});
