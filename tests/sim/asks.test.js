import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { raiseDecision, fireEvent } from '../../src/sim/events.js';
import { defaultChoiceOf } from '../../src/sim/asks.js';
import { botAsks, runBot } from '../../src/sim/bots.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { game, addStaff, addDesks, addProduct, expectFail } from './helpers.js';

function company(seed = 1) {
  const s = game(seed);
  s.week = 60;
  addDesks(s, 6);
  for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
  for (const p of s.staff) { p.mood = 'ok'; p.strain = 0; p.meaning = 60; }
  addProduct(s, { name: 'Ledgerly', customers: 300, mrr: 6000 });
  return s;
}
const raise = (s, id, subjectId = null) => { const ctx = makeCtx(s); const ok = raiseDecision(ctx, id, subjectId); return { ok, events: ctx.events }; };
const fire = (s, id, subjectId = null) => { const ctx = makeCtx(s); const ok = fireEvent(ctx, EVENTS[id], subjectId); return { ok, events: ctx.events }; };

let keep;
beforeEach(() => { keep = { ...B.pacing }; });
afterEach(() => { Object.assign(B.pacing, keep); });

describe('issue #1646: the ask queue', () => {
  it('lands off, with every other pacing switch on and the attention clock in real seconds', () => {
    expect(B.pacing.askQueue).toBe(false);
    expect(B.pacing.askExpiry).toBe(false);
    for (const k of ['askRealTime', 'momentCap', 'askRates', 'letterMail', 'quietEvents', 'quietToasts', 'oneLaunchCard', 'unlockPips', 'advisorGlow', 'quietYak', 'mailArchive', 'deskBubbles']) expect(B.pacing[k], k).toBe(true);
    expect(B.attention).toMatchObject({ gapSeconds: 90, quietSeconds: 45, expirySeconds: 180, momentWindowSeconds: 300, momentCapSeconds: 25 });
  });

  it('off: a decision opens as it always has and the queue stays empty', () => {
    const s = company();
    expect(raise(s, 'acquisition_offer').ok).toBe(true);
    expect(s.pendingDecision.eventId).toBe('acquisition_offer');
    expect(s.asks).toEqual([]);
  });

  it('off: a whole bot game never touches the queue', () => {
    const r = runBot('balanced', 3, 300, { onWeek: (s, events) => { expect(events.some((e) => e.type === 'askQueued')).toBe(false); } });
    expect(r.state.asks).toEqual([]);
  });

  it('on: a decision waits as a candidate, an incident as an emergency ahead of it, and presentAsk opens them in that order', () => {
    B.pacing.askQueue = true;
    const s = company();
    const a = raise(s, 'acquisition_offer');
    expect(a.ok).toBe(true);
    expect(s.pendingDecision).toBeNull();
    expect(a.events).toContainEqual({ type: 'askQueued', askId: s.asks[0].id, kind: 'decision', priority: 'normal' });
    raise(s, 'agent_db_wipe');
    expect(s.asks.map((x) => [x.kind, x.priority])).toEqual([['decision', 'normal'], ['decision', 'emergency']]);
    for (const x of s.asks) expect(Object.keys(x).sort()).toEqual(['defaultChoice', 'expiresWeek', 'id', 'kind', 'priority', 'ref', 'week']);
    expect(dispatch(s, { type: 'presentAsk' }).ok).toBe(true);
    expect(s.pendingDecision.eventId).toBe('agent_db_wipe');
    expectFail(expect, dispatch, s, { type: 'presentAsk' }, 'Finish the open decision first');
    expectFail(expect, dispatch, s, { type: 'presentAsk', askId: 'nope' }, 'No such ask');
    s.pendingDecision = null;
    dispatch(s, { type: 'presentAsk' });
    expect(s.pendingDecision.eventId).toBe('acquisition_offer');
    s.pendingDecision = null;
    expectFail(expect, dispatch, s, { type: 'presentAsk' }, 'No asks waiting');
  });

  it('on: a Yak event and a letter event wait as low-priority candidates and open as a prompt and a mail', () => {
    B.pacing.askQueue = true;
    const s = company();
    s.chatPrompts = [{ id: 'x', resolved: null }];
    s.mail = [{ id: 'm', options: [{}], resolved: null }, { id: 'n', options: [{}], resolved: null }];
    expect(fire(s, 'pet_request').ok).toBe(true);
    expect(fire(s, 'vendor_new_version').ok).toBe(true);
    expect(s.asks.map((x) => [x.kind, x.priority, x.defaultChoice])).toEqual([['prompt', 'low', 1], ['letter', 'low', 1]]);
    s.chatPrompts = [];
    s.mail = [];
    dispatch(s, { type: 'presentAsk' });
    expect(s.chatPrompts.at(-1).kind).toBe('pet_request');
    dispatch(s, { type: 'presentAsk' });
    expect(s.mail[0].kind).toBe('vendor_new_version');
  });

  it('expireAsk applies the default and posts one Yak line; an emergency never expires', () => {
    B.pacing.askQueue = true;
    const s = company();
    raise(s, 'senior_grumble', s.staff[1].id);
    raise(s, 'agent_db_wipe');
    const [normal, emergency] = s.asks;
    expect(normal.defaultChoice).toBe(defaultChoiceOf(EVENTS.senior_grumble));
    const chat = s.chatLog.length;
    const res = dispatch(s, { type: 'expireAsk', askId: normal.id });
    expect(res.ok).toBe(true);
    expect(res.events).toContainEqual({ type: 'askExpired', askId: normal.id, kind: 'decision' });
    expect(s.chatLog.length).toBe(chat + 1);
    expect(s.asks.map((x) => x.id)).toEqual([emergency.id]);
    expectFail(expect, dispatch, s, { type: 'expireAsk', askId: emergency.id }, 'Emergencies never expire');
    expectFail(expect, dispatch, s, { type: 'expireAsk', askId: 'nope' }, 'No such ask');
  });

  it('a candidate left past its expiresWeek is dropped silently, with no default; an emergency never goes stale', () => {
    B.pacing.askQueue = true;
    const s = company();
    raise(s, 'senior_grumble', s.staff[1].id);
    raise(s, 'agent_db_wipe');
    expect(s.asks.map((x) => x.expiresWeek)).toEqual([s.week + B.attention.staleWeeks, null]);
    const meaning = s.staff[1].meaning, chat = s.chatLog.length;
    s.week += B.attention.staleWeeks;
    dispatch(s, { type: 'presentAsk' });
    expect(s.pendingDecision.eventId).toBe('agent_db_wipe');
    expect(s.asks).toEqual([]);
    expect(s.staff[1].meaning).toBe(meaning);
    expect(s.chatLog.slice(chat).some((m) => /sorted itself|default|left on read/.test(m.text))).toBe(false);
  });

  it('a default is the event\'s own, else its no-effect choice, else its last', () => {
    expect(defaultChoiceOf({ choices: [{ effects: { cash: 1 } }, { effects: {} }] })).toBe(1);
    expect(defaultChoiceOf({ defaultChoice: 0, choices: [{ effects: { cash: 1 } }, { effects: {} }] })).toBe(0);
    expect(defaultChoiceOf({ choices: [{ effects: { cash: 1 } }, { effects: { cash: 2 } }] })).toBe(1);
  });

  it('bots present an emergency at once and anything else after botGapWeeks, and let low asks expire with askExpiry on', () => {
    B.pacing.askQueue = true;
    B.pacing.askExpiry = true;
    const s = company();
    s.flags.lastAskWeek = s.week;
    raise(s, 'acquisition_offer');
    botAsks(s);
    expect(s.pendingDecision).toBeNull();
    raise(s, 'agent_db_wipe');
    botAsks(s);
    expect(s.pendingDecision.eventId).toBe('agent_db_wipe');
    s.pendingDecision = null;
    s.week += B.attention.botGapWeeks;
    botAsks(s);
    expect(s.pendingDecision.eventId).toBe('acquisition_offer');
    s.pendingDecision = null;
    fire(s, 'pet_request');
    s.week += B.attention.botExpiryWeeks;
    botAsks(s);
    expect(s.asks).toEqual([]);
  });

  it('status-news toasts carry a known topic and a subject id or null; money, staff changes and goals carry none', () => {
    const TOPICS = ['progress', 'timeoff', 'back', 'mood', 'trend', 'blocked', 'reward', 'pet', 'rival', 'incident'];
    const seen = new Set();
    const toasts = [];
    for (const bot of ['balanced', 'allHumans']) {
      runBot(bot, 5, 400, { onWeek: (s, events) => { for (const e of events) if (e.type === 'toast') toasts.push(e); } });
    }
    for (const t of toasts) {
      if (t.topic === undefined) continue;
      expect(TOPICS).toContain(t.topic);
      expect(t.subjectId === null || typeof t.subjectId === 'string').toBe(true);
      seen.add(t.topic);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(toasts.some((t) => /resigned|has left|launched|payroll/.test(t.text) && t.topic !== undefined)).toBe(false);
  });

  it('asks survive a save, and an old save without them loads with an empty queue', () => {
    B.pacing.askQueue = true;
    const s = company();
    raise(s, 'acquisition_offer');
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    saveGame(s, storage);
    expect(loadGame(storage).state.asks).toEqual(s.asks);
    delete s.asks;
    saveGame(s, storage);
    expect(loadGame(storage).state.asks).toEqual([]);
  });
});
