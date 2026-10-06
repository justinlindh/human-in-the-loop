import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { EVENTS } from '../../src/data/events.js';
import { openEventPrompt, promptsSystem } from '../../src/sim/prompts.js';
import { openEventMail, mailSystem } from '../../src/sim/mail.js';
import { runBot } from '../../src/sim/bots.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { game, addStaff, addDesks, addProduct, expectFail } from './helpers.js';

function company(seed = 1) {
  const s = game(seed);
  s.week = 60;
  addDesks(s, 6);
  for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
  addProduct(s, { name: 'Ledgerly', customers: 300, mrr: 6000 });
  s.chatPrompts = [];
  s.mail = [];
  return s;
}
const prompt = (s) => { openEventPrompt(makeCtx(s), EVENTS.pet_request, s.staff[1].id); return s.chatPrompts.at(-1); };
const letter = (s) => { openEventMail(makeCtx(s), EVENTS.vendor_new_version, null); return s.mail[0]; };
const week = (s, n = 1) => { for (let i = 0; i < n; i++) { s.week++; promptsSystem(makeCtx(s)); mailSystem(makeCtx(s)); } };

let keep;
beforeEach(() => { keep = { ...B.pacing }; });
afterEach(() => { Object.assign(B.pacing, keep); });

describe('contract #1687: shown prompts and letters', () => {
  it('lands on, with openExpiry at 120 seconds', () => {
    expect(B.pacing.shownExpiry).toBe(true);
    expect(B.attention.openExpiry).toBe(120);
  });

  it('new prompts and letters start unshown; promptShown and readMail mark them shown once', () => {
    const s = company();
    const p = prompt(s);
    const m = letter(s);
    expect(p.shownWeek).toBeNull();
    expect(m.shownWeek).toBeNull();
    s.paused = true;
    expect(dispatch(s, { type: 'promptShown', promptId: p.id }).ok).toBe(true);
    expect(p.shownWeek).toBe(s.week);
    s.week += 2;
    dispatch(s, { type: 'promptShown', promptId: p.id });
    expect(p.shownWeek).toBe(s.week - 2);
    expectFail(expect, dispatch, s, { type: 'promptShown', promptId: 'nope' }, 'No such prompt');
    dispatch(s, { type: 'readMail', mailId: m.id });
    expect(m.shownWeek).toBe(s.week);
  });

  it('on, a shown prompt or letter never expires by weeks; an unshown one does, as today', () => {
    B.pacing.shownExpiry = true;
    const s = company();
    const shown = prompt(s);
    const unshown = prompt(s);
    const read = letter(s);
    dispatch(s, { type: 'promptShown', promptId: shown.id });
    dispatch(s, { type: 'readMail', mailId: read.id });
    week(s, Math.max(B.chatPromptExpiryWeeks, B.mail.expiryWeeks) + 1);
    expect(unshown.resolved).not.toBeNull();
    expect(shown.resolved).toBeNull();
    expect(read.resolved).toBeNull();
  });

  it('off, a shown prompt still expires by weeks', () => {
    B.pacing.shownExpiry = false;
    const s = company();
    const p = prompt(s);
    dispatch(s, { type: 'promptShown', promptId: p.id });
    week(s, B.chatPromptExpiryWeeks + 1);
    expect(p.resolved).not.toBeNull();
  });

  it('expireOpen applies the ignore outcome to a prompt or letter, and refuses as the contract says', () => {
    const s = company();
    const p = prompt(s);
    const m = letter(s);
    B.pacing.shownExpiry = false;
    expectFail(expect, dispatch, s, { type: 'expireOpen', kind: 'prompt', id: p.id }, 'Expiry is off');
    B.pacing.shownExpiry = true;
    expectFail(expect, dispatch, s, { type: 'expireOpen', kind: 'prompt', id: 'nope' }, 'No such prompt');
    expectFail(expect, dispatch, s, { type: 'expireOpen', kind: 'letter', id: 'nope' }, 'No such letter');
    const r = dispatch(s, { type: 'expireOpen', kind: 'prompt', id: p.id });
    expect(r.ok).toBe(true);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'chatPromptResolved', promptId: p.id, choice: null }));
    expect(p.resolved).toMatchObject({ choice: null });
    expectFail(expect, dispatch, s, { type: 'expireOpen', kind: 'prompt', id: p.id }, 'Already answered');
    expect(dispatch(s, { type: 'expireOpen', kind: 'letter', id: m.id }).ok).toBe(true);
    expect(m.resolved).not.toBeNull();
    expectFail(expect, dispatch, s, { type: 'expireOpen', kind: 'letter', id: m.id }, 'Already answered');
  });

  it('saves keep shownWeek, and old saves load it as null', () => {
    const s = company();
    const p = prompt(s);
    const m = letter(s);
    dispatch(s, { type: 'promptShown', promptId: p.id });
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    saveGame(s, storage);
    const back = loadGame(storage).state;
    expect(back.chatPrompts.find((x) => x.id === p.id).shownWeek).toBe(s.week);
    delete p.shownWeek;
    delete m.shownWeek;
    saveGame(s, storage);
    const old = loadGame(storage).state;
    expect(old.chatPrompts.find((x) => x.id === p.id).shownWeek).toBeNull();
    expect(old.mail.find((x) => x.id === m.id).shownWeek).toBeNull();
  });

  it('a bot game is the same with shownExpiry on or off, since bots never dispatch promptShown', () => {
    const play = (on) => { B.pacing.shownExpiry = on; return JSON.stringify(runBot('balanced', 4, 300).state); };
    expect(play(true)).toBe(play(false));
  });
});
