import { it, expect } from 'vitest';
import { simulatePacing } from '../scripts/pace.js';
import { createYakPacer, importantChat, MAX_TRACKED_POST_IDS } from './yak-pacing.js';
import { B } from './sim/balance.js';
import { createPacer } from './pacing.js';
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

it.each([1, 2, 4])('expires backlog in game time at %ix without shortening reading time', (speed) => {
  const p = createYakPacer();
  p.enqueue([msg('reading'), msg('waiting')]);
  expect(p.step(0, true)[0].id).toBe('reading');
  expect(p.step(5, true, { gameTime: 5 * speed })).toEqual([]);
  expect(p.step(1, true, { gameTime: 6 * speed })[0].id).toBe('waiting');
  p.enqueue([msg('stale'), msg('reply', { replyTo: 'stale' }), msg('win', { channel: 'wins' })], { gameTime: 6 * speed });
  const wait = B.yakMaxWaitSeconds / speed + 0.1;
  expect(p.step(wait, true, { gameTime: 6 * speed + wait * speed }).map(e => e.id)).toEqual(['win']);
  expect(p.queued).toBe(0);
});

it('accounts for speed changes while queued and keeps the real-time ceiling during a game hold', () => {
  const p = createYakPacer();
  p.enqueue([msg('reading', { text: 'word '.repeat(160) }), msg('stale')]);
  p.step(0, true);
  p.step(4, true, { gameTime: 4 });
  p.step(4, true, { gameTime: 12 });
  p.step(4, true, { gameTime: 28 });
  expect(p.queued).toBe(1);
  p.step(1, true, { gameTime: 32 });
  expect(p.queued).toBe(0);
  p.enqueue([msg('held')], { gameTime: 32 });
  p.step(B.yakMaxWaitSeconds + 1, true, { gameTime: 32 });
  expect(p.queued).toBe(0);
});

it.each([1, 2, 4])('drops only posts tied to the resolved outage at %ix, including delayed replies', (speed) => {
  const p = createYakPacer();
  const state = { outage: {}, flags: { outageSeq: 1, outageChat: { root: 1, reply: 1 } } };
  p.enqueue([msg('reading'), msg('root', { channel: 'incidents' })], { state });
  // Reserve reading time with a direct post, so even an incident thread has to wait.
  p.enqueue([msg('direct')], { urgentIds: new Set(['direct']) });
  p.step(1, true, { gameTime: speed, state });
  state.outage = null;
  expect(p.step(5, true, { gameTime: 6 * speed, state }).map(e => e.id)).toEqual(['reading']);
  // The weekly event pacer can deliver the reply after the outage has already ended.
  p.enqueue([msg('reply', { replyTo: 'root', channel: 'incidents' }), msg('report', { channel: 'incidents' })], { state, gameTime: 6 * speed });
  expect(p.step(6, true, { gameTime: 12 * speed, state }).map(e => e.id)).toEqual(['report']);
  expect(p.queued).toBe(0);
});

it('does not revive an old outage post when the same product fails again', () => {
  const p = createYakPacer();
  const state = { outage: { productId: 'p1' }, flags: { outageSeq: 1, outageChat: { old: 1 } } };
  p.enqueue([msg('old')], { state });
  state.flags.outageSeq = 2;
  expect(p.step(0, true, { state })).toEqual([]);
});

it('preserves important parents through expiry and resets both clocks', () => {
  const p = createYakPacer();
  p.enqueue([msg('root'), msg('reply', { replyTo: 'root', important: true })]);
  // Past the ordinary real-time limit, within the important game-time one.
  expect(p.step(40, true, { gameTime: 40 }).map(e => e.id)).toEqual(['root']);
  expect(p.step(6, true, { gameTime: 46 }).map(e => e.id)).toEqual(['reply']);
  p.reset();
  p.enqueue([msg('fresh')], { gameTime: 0 });
  expect(p.step(0, true, { gameTime: 0 })[0].id).toBe('fresh');
});

it.each([1, 2, 4])('uses the weekly pacer clock and freezes queue age on pause at %ix', (speed) => {
  const clock = createPacer(), p = createYakPacer();
  p.enqueue([msg('reading', { text: 'word '.repeat(160) }), msg('waiting')]);
  p.step(0, true);
  const advance = (seconds, running) => {
    for (let frame = 0; frame < seconds * 4; frame++) {
      clock.step(0.25, { speed, running });
      p.step(0.25, running, { gameTime: clock.gameT });
    }
  };
  advance(100, false);
  expect(p.queued).toBe(1);
  advance(B.yakMaxWaitGameSeconds / speed, true);
  expect(p.queued).toBe(1);
  advance(0.25, true);
  expect(p.queued).toBe(0);
});

it('paces Yak chats through the Yak pacer, as the game does', () => {
  const frame = 0.1;
  const { metrics, timeline } = simulatePacing({ seed: 3, minutes: 12, frame });
  const chats = timeline.filter((e) => e.kind === 'chat');
  const queued = chats.slice(1).filter((e) => !e.urgent);
  expect(queued.length).toBeGreaterThan(20);
  expect(chats.some((e) => e.urgent)).toBe(true);
  // A queued chat waits out the Yak pacer's reading gap after whatever line came before it.
  for (let i = 1; i < chats.length; i++) {
    if (!chats[i].urgent) expect(chats[i].t - chats[i - 1].t).toBeGreaterThanOrEqual(B.yakMinGapSeconds - frame);
  }
  expect(metrics.chat.omitted).toBeGreaterThanOrEqual(0);
});

it('counts a bot post as important only when the sim flags it', () => {
  const bot = { type: 'chat', id: 'b', fromId: null, from: '@launchbot', channel: 'general', text: 'Product 2 v7 is live.' };
  expect(importantChat(bot)).toBe(false);
  expect(importantChat({ ...bot, important: true })).toBe(true);
  expect(importantChat({ ...bot, channel: 'wins' })).toBe(true);
  expect(importantChat({ ...bot, channel: 'incidents' })).toBe(true);
});

it('keeps important posts from backing up at 4x-rate traffic, and never expires an incident alert', () => {
  // About 17 important posts a real minute at 4x, against roughly 8 a minute the reading gap lets through.
  const p = createYakPacer(), speed = 4, dt = 0.1, waits = [], enqueuedAt = new Map();
  let t = 0, n = 0, maxQueued = 0;
  const alerts = new Set(), shown = new Set();
  for (let step = 0; step < 6000; step++, t += dt) {
    if (step % 35 === 0) {
      const alert = n % 10 === 0;
      const e = alert
        ? { type: 'chat', id: `a${n}`, fromId: null, from: '@pagerbot', channel: 'incidents', text: 'SEV2 on Product 1: it ate the database.' }
        : { type: 'chat', id: `w${n}`, fromId: null, from: '@launchbot', channel: 'wins', text: 'Product 1 v2 is live.' };
      if (alert) alerts.add(e.id);
      enqueuedAt.set(e.id, t);
      p.enqueue([e], { gameTime: t * speed });
      n++;
    }
    for (const e of p.step(dt, true, { gameTime: (t + dt) * speed })) { shown.add(e.id); waits.push(t + dt - enqueuedAt.get(e.id)); }
    maxQueued = Math.max(maxQueued, p.queued);
  }
  expect(Math.max(...waits)).toBeLessThanOrEqual(B.yakImportantMaxWaitGameSeconds / speed + 2 * B.yakMinGapSeconds);
  expect(maxQueued).toBeLessThanOrEqual(10);
  for (const id of alerts) if (t - enqueuedAt.get(id) > 60) expect(shown.has(id)).toBe(true);
});

it('reports the longest important-post wait at 4x within the pacing target', () => {
  const { metrics } = simulatePacing({ seed: 3, speed: 4, weeks: 520, frame: 0.1 });
  expect(metrics.chat.important.longestWaitSeconds).toBeLessThanOrEqual(90);
  expect(metrics.chat.important.queuedAtEnd).toBeLessThanOrEqual(15);
});
it('keeps a bounded set of the player\'s own post ids and still lets a reply to a recent one jump the queue', () => {
  const p = createYakPacer();
  const n = MAX_TRACKED_POST_IDS * 3;
  for (let i = 0; i < n; i++) p.enqueue([msg(`mine-${i}`)], { urgentIds: new Set([`mine-${i}`]) });
  expect(p.trackedIds).toEqual({ answered: MAX_TRACKED_POST_IDS, mine: MAX_TRACKED_POST_IDS });
  p.enqueue([msg('ambient-1'), msg('ambient-2'), msg('reply', { replyTo: `mine-${n - 1}` })]);
  expect(p.step(6, true)[0].id).toBe('reply');
});
it('forgets the oldest post ids first, so a reply to a forgotten post queues like any other', () => {
  const p = createYakPacer();
  for (let i = 0; i <= MAX_TRACKED_POST_IDS; i++) p.enqueue([msg(`mine-${i}`)], { urgentIds: new Set([`mine-${i}`]) });
  p.enqueue([msg('ambient'), msg('late', { replyTo: 'mine-0' })]);
  expect(p.step(6, true)[0].id).toBe('ambient');
});
