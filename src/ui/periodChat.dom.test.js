// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createChat } from './chat.js';
import { createGame } from '../sim/state.js';
import { companyKey } from './saveKey.js';
import { REACTION_GLYPH } from './tools/glyphs.js';
import { createPostBar } from './yakPosts.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());
let listeners;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); listeners = vi.spyOn(window, 'addEventListener'); });
afterEach(() => {
  for (const args of listeners.mock.calls) window.removeEventListener(...args);
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  localStorage.clear(); document.body.replaceChildren();
});

it.each([['preinternet', 'desknet', 'DeskNet'], ['dotcom', 'awayim', 'AwayIM'], ['web2', 'hipcheck', 'HipCheck'], ['classic', 'yak', 'Yak'], ['chatgbt', 'yak', 'Yak'], ['agents', 'yak', 'Yak']])(
  'skins %s without changing saved messages, reply actions or browser keys', (startEra, app, name) => {
    const s = createGame({ seed: 11, startEra });
    s.flags.saveSlot = 'slot1';
    const root = document.createElement('div'); root.className = 'hitl'; document.body.append(root);
    s.chatLog = [{ id: 'old-root', type: 'chat', channel: 'general', from: 'Sam', text: 'Lunch?', week: 0, reactions: Object.fromEntries(Object.keys(REACTION_GLYPH).map((k) => [k, 2])) },
      { id: 'old-reply', type: 'chat', channel: 'general', from: 'Lee', text: 'Soon.', replyTo: 'old-root', week: 0 }];
    s.chatPrompts = [{ id: 'saved-prompt', chatId: 'old-root', channel: 'general', expiresWeek: 4,
      options: [{ label: 'After the build', hint: 'Make some time.' }, { label: 'Later', available: false, reason: 'Already busy' }] }];
    const before = JSON.stringify(s);
    const onAnswer = vi.fn();
    const chat = createChat(root, { getState: () => s, onAnswer });
    chat.reset(s); chat.update(s);
    expect(chat.el.dataset.chatApp).toBe(app);
    expect(root.querySelector('.sbrand').textContent).toBe(name);
    expect(root.querySelector('.slogo [data-icon]').dataset.icon).toBe(`brand.${app}`);
    if (app !== 'yak') {
      expect(root.querySelector('.slogo svg').getAttribute('viewBox')).toBe('0 0 24 24');
      expect(root.querySelector('.slogo svg path')).not.toBeNull();
      expect(root.querySelector('.reacts').textContent).not.toMatch(/no_at_channel|\p{Extended_Pictographic}/u);
    }
    expect(root.querySelector('.react[aria-label="No broadcasts: 2"]')).not.toBeNull();
    expect(root.querySelector('.ymax').getAttribute('aria-label')).toBe(`Maximize ${name}`);
    const opts = root.querySelectorAll('.yp-opt');
    opts[0].focus(); expect(document.activeElement).toBe(opts[0]); opts[0].click();
    expect(onAnswer).toHaveBeenCalledWith('saved-prompt', 0);
    expect(opts[1].disabled).toBe(true);
    expect(opts[1].getAttribute('aria-label')).toContain('Already busy');
    expect([...root.querySelectorAll('.msg')].map((n) => n.dataset.id)).toEqual(['old-root', 'old-reply']);
    expect(root.querySelector('.msg.reply').dataset.root).toBe('old-root');
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(`hitl.yak.shown.${companyKey(s)}`))).toEqual(['old-root', 'old-reply']);
    expect(JSON.stringify(s)).toBe(before);
    chat.setMax(true); expect(chat.el.dataset.chatApp).toBe(app);
    s.era = { id: 'classic', since: 0 }; chat.update(s);
    expect(chat.el.dataset.chatApp).toBe('yak');
    expect(root.querySelectorAll('.msg').length).toBe(2);
    expect(root.querySelector('.yp-opt').textContent).toContain('After the build');
  });

it('refreshes an open post picker when the era changes', () => {
  const state = createGame({ seed: 11, startEra: 'dotcom' });
  const root = document.createElement('div'); root.className = 'hitl'; document.body.append(root);
  const posts = createPostBar({ layer: root, getState: () => state, onPost: () => ({ ok: true }) });
  root.append(posts.bar);
  posts.update(state);
  root.querySelector('.ypost-btn').click();
  expect(root.querySelector('.ypost-pick').dataset.chatApp).toBe('awayim');
  expect(root.querySelector('.ypost-pick').textContent).toContain('Forward a joke');
  state.era = { id: 'web2', since: 0 };
  posts.update(state);
  expect(root.querySelector('.ypost-pick').dataset.chatApp).toBe('hipcheck');
  state.era = { id: 'classic', since: 0 };
  posts.update(state);
  expect(root.querySelector('.ypost-pick').dataset.chatApp).toBe('yak');
  expect(root.querySelector('.ypost-pick').textContent).toContain('Share a meme');
  posts.close();
});

it('shows the AwayIM away line once, in the status bar', () => {
  const s = createGame({ seed: 11, startEra: 'dotcom' });
  s.flags.saveSlot = 'slot1';
  const root = document.createElement('div'); root.className = 'hitl'; document.body.append(root);
  s.chatLog = [{ id: 'away', type: 'chat', channel: 'general', from: 'Sam', text: 'Away message: building the future. Back after lunch.', week: 0 },
    { id: 'other', type: 'chat', channel: 'general', from: 'Lee', text: 'The website has a visitor counter.', week: 0 }];
  const chat = createChat(root, { getState: () => s, onAnswer: vi.fn() });
  chat.reset(s); chat.update(s);
  expect(root.querySelector('.period-away').textContent).toBe('Away: building the future. Back after lunch.');
  expect([...root.querySelectorAll('.msg')].map((n) => n.dataset.id)).toEqual(['other']);
});

it.each([['dotcom', 'Office Chat'], ['web2', 'Lobby'], ['classic', '#general']])(
  'the quiet banner names the first tab in %s', (startEra, label) => {
    const s = createGame({ seed: 11, startEra });
    s.flags.saveSlot = 'slot1';
    const root = document.createElement('div'); root.className = 'hitl'; document.body.append(root);
    s.chatLog = [{ id: 'm1', type: 'chat', channel: 'general', from: 'Sam', text: 'Lunch?', week: 0 }];
    const chat = createChat(root, { getState: () => s, onAnswer: vi.fn() });
    chat.reset(s);
    s.week = 10;
    chat.update(s);
    expect(root.querySelector('.chat-quiet.banner').textContent).toBe(`It's been quiet in ${label} for 10 weeks.`);
  });
