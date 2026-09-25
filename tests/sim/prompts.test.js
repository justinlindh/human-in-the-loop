import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { promptsSystem } from '../../src/sim/prompts.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { PROMPTS } from '../../src/data/prompts.js';
import { eraAllowsText } from '../../src/sim/eras.js';
import { EVENTS } from '../../src/data/events.js';
import { fireEvent, resolveSubjects } from '../../src/sim/events.js';
import { game, addStaff, addDesks, addProduct } from './helpers.js';

const TRIGGERS = ['strain', 'incident', 'launch', 'rival', 'late', 'agents', 'newhire', 'coasting', 'support', 'lowcash', 'crowded', 'junior'];

// A settled company where only one thing is going on: someone is worn out.
function strained(seed = 1) {
  const s = game(seed);
  s.week = 40;
  addDesks(s, 6);
  for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
  for (const p of s.staff) { p.mood = 'ok'; p.strain = 0; p.meaning = 60; }
  s.staff.find((p) => !p.founder).strain = 80;
  s.flags.lastPromptWeek = undefined;
  return s;
}
const weekOf = (s) => { const ctx = makeCtx(s); promptsSystem(ctx); return ctx.events; };
// Runs the prompts system until one opens (the open roll is a chance each week).
function openOne(s) {
  for (let i = 0; i < 40; i++) {
    const ev = weekOf(s);
    if (ev.some((e) => e.type === 'chatPrompt')) return ev;
    s.week++;
  }
  throw new Error('no prompt opened');
}

describe('issue #16: Yak reply prompts', () => {
  it('templates have 2 or 3 options with hints, replies and answers, a known trigger, and fit their eras', () => {
    const classic = { era: { id: 'classic' } };
    for (const t of PROMPTS) {
      expect(TRIGGERS, t.id).toContain(t.on);
      expect(t.options.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.options.length, t.id).toBeLessThanOrEqual(3);
      expect(t.text.length, t.id).toBeGreaterThanOrEqual(2);
      for (const o of t.options) {
        expect(o.hint && o.reply.length && o.answer.length, `${t.id}: ${o.label}`).toBeTruthy();
        expect(o.effects || o.productEffects, `${t.id}: ${o.label}`).toBeTruthy();
      }
      expect(t.ignored.line.length, t.id).toBeGreaterThanOrEqual(1);
      const all = [...t.text, ...t.options.flatMap((o) => [o.label, o.hint, ...o.reply, ...o.answer]), ...t.ignored.line];
      for (const line of all) {
        expect(line, t.id).not.toMatch(/startup/i);
        expect(line.replace(/\{(product|project|rival)\}/g, ''), t.id).not.toMatch(/[{}]/);
      }
      if (!t.eras) for (const line of all) expect(eraAllowsText(classic, line), `${t.id}: ${line}`).toBe(true);
    }
  });

  it('a worn-out teammate posts a prompt with the contract shape, one at a time', () => {
    const s = strained(1);
    const ev = openOne(s);
    const chat = ev.find((e) => e.type === 'chat');
    const opened = ev.find((e) => e.type === 'chatPrompt');
    expect(ev.indexOf(chat)).toBeLessThan(ev.indexOf(opened));
    const p = s.chatPrompts[0];
    expect(p).toMatchObject({ id: expect.stringMatching(/^cp\d+$/), kind: 'strain_vent', chatId: chat.id, channel: 'general', fromId: chat.fromId, week: s.week,
      expiresWeek: s.week + B.chatPromptExpiryWeeks, resolved: null });
    expect(opened).toEqual({ type: 'chatPrompt', promptId: p.id, chatId: chat.id });
    expect(s.chatLog.some((m) => m.id === p.chatId)).toBe(true);
    for (const o of p.options) expect(o).toEqual({ label: expect.any(String), hint: expect.any(String), available: true, reason: null });
    for (let i = 0; i < 10; i++) { s.week++; weekOf(s); }
    expect(s.chatPrompts.filter((x) => !x.resolved).length).toBeLessThanOrEqual(B.chatPromptsOpen);
    expect(JSON.parse(JSON.stringify(s.chatPrompts))).toEqual(s.chatPrompts);
  });

  it('answering applies the reply\'s effects, and the founder and the poster reply in the thread', () => {
    const s = strained(2);
    openOne(s);
    const p = s.chatPrompts[0];
    const poster = s.staff.find((x) => x.id === p.fromId);
    const res = dispatch(s, { type: 'answerPrompt', promptId: p.id, choice: 0 });
    expect(res.ok).toBe(true);
    expect(poster.strain).toBe(80 - B.prompts.restStrain);
    expect(p.resolved).toEqual({ choice: 0, week: s.week, replyId: expect.any(String) });
    const thread = res.events.filter((e) => e.type === 'chat' && e.replyTo === p.chatId);
    const founder = thread.find((e) => e.id === p.resolved.replyId);
    expect(s.staff.find((x) => x.id === founder.fromId).founder).toBe(true);
    expect(thread.some((e) => e.fromId === poster.id)).toBe(true);
    expect(res.events.find((e) => e.type === 'chatPromptResolved')).toEqual({ type: 'chatPromptResolved', promptId: p.id, choice: 0 });
    expect(dispatch(s, { type: 'answerPrompt', promptId: p.id, choice: 1 }).reason).toBe('Already answered');
    expect(dispatch(s, { type: 'answerPrompt', promptId: 'cp999', choice: 0 }).reason).toBe('No such prompt');
  });

  it('never draws from the game\'s random stream, so prompts cannot reshuffle a seeded game', () => {
    const s = strained(8);
    for (let i = 0; i < 40 && !s.chatPrompts.length; i++) {
      const rng = s.rng.s;
      weekOf(s);
      expect(s.rng.s).toBe(rng);
      s.week++;
    }
    const p = s.chatPrompts[0];
    const rng = s.rng.s;
    dispatch(s, { type: 'answerPrompt', promptId: p.id, choice: 1 });
    expect(s.rng.s).toBe(rng);
  });

  it('the prompted post carries the prompt\'s chatId as its chat event id', () => {
    const s = strained(11);
    const ev = openOne(s);
    const p = s.chatPrompts[0];
    const post = ev.find((e) => e.type === 'chat' && e.id === p.chatId);
    expect(post).toBeTruthy();
    expect(post.fromId).toBe(p.fromId);
    expect(post.channel).toBe(p.channel);
  });

  it('answering, even while the game is paused, returns the resolution and the founder\'s reply from the dispatch itself', () => {
    const s = strained(9);
    openOne(s);
    const p = s.chatPrompts[0];
    const res = dispatch(s, { type: 'answerPrompt', promptId: p.id, choice: 0 });
    const types = res.events.map((e) => e.type);
    expect(types).toContain('chatPromptResolved');
    expect(res.events.some((e) => e.type === 'chat' && e.id === p.resolved.replyId && e.replyTo === p.chatId)).toBe(true);
  });

  it('switched off, prompts never open', () => {
    const s = strained(10);
    B.chatPromptsEnabled = false;
    try {
      for (let i = 0; i < 30; i++) { weekOf(s); s.week++; }
    } finally {
      B.chatPromptsEnabled = true;
    }
    expect(s.chatPrompts).toEqual([]);
  });

  it('rejects an invalid choice without resolving', () => {
    const s = strained(3);
    openOne(s);
    const p = s.chatPrompts[0];
    for (const choice of [-1, 5, 0.5, '0', null]) expect(dispatch(s, { type: 'answerPrompt', promptId: p.id, choice }).reason).toBe('Invalid choice');
    expect(p.resolved).toBe(null);
  });

  it('an unanswered prompt goes quiet at expiresWeek with its ignored consequence, then leaves after a few weeks', () => {
    const s = strained(4);
    openOne(s);
    const p = s.chatPrompts[0];
    const poster = s.staff.find((x) => x.id === p.fromId);
    const meaning = poster.meaning;
    s.week = p.expiresWeek - 1;
    expect(weekOf(s).some((e) => e.type === 'chatPromptResolved')).toBe(false);
    s.week = p.expiresWeek;
    const ev = weekOf(s);
    expect(ev.find((e) => e.type === 'chatPromptResolved')).toEqual({ type: 'chatPromptResolved', promptId: p.id, choice: null });
    expect(p.resolved).toEqual({ choice: null, week: p.expiresWeek, replyId: null });
    expect(poster.meaning).toBeLessThan(meaning);
    expect(dispatch(s, { type: 'answerPrompt', promptId: p.id, choice: 0 }).reason).toBe('That has gone quiet');
    s.week = p.expiresWeek + B.chatPromptsKept;
    weekOf(s);
    expect(s.chatPrompts.some((x) => x.id === p.id)).toBe(false);
  });

  it('a launch prompt names the product, and its hype reply lands on that product', () => {
    const s = strained(5);
    for (const p of s.staff) p.strain = 0;
    addStaff(s, 'marketer', 'mid', { hiredWeek: 0 });
    const product = addProduct(s, { name: 'Inboxer' });
    let ev = [];
    for (let i = 0; i < 40 && !s.chatPrompts.length; i++) {
      const ctx = makeCtx(s);
      ctx.events.push({ type: 'launch', productId: product.id });
      promptsSystem(ctx);
      ev = ctx.events;
      s.week++;
    }
    const p = s.chatPrompts[0];
    expect(p.kind).toBe('launch_hype');
    expect(ev.find((e) => e.type === 'chat').text).toContain('Inboxer');
    const hype = product.hype;
    dispatch(s, { type: 'answerPrompt', promptId: p.id, choice: 0 });
    expect(product.hype).toBe(Math.min(100, hype + B.prompts.launchHype));
  });

  it('prompts survive a save and load; saves without them load with none', () => {
    const s = strained(6);
    openOne(s);
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    saveGame(s, storage);
    expect(loadGame(storage).state.chatPrompts).toEqual(s.chatPrompts);
    const old = strained(7);
    delete old.chatPrompts;
    saveGame(old, storage);
    expect(loadGame(storage).state.chatPrompts).toEqual([]);
  });

  it('a long run opens prompts every few weeks, never more than one at a time', () => {
    let opened = 0;
    let worst = 0;
    const r = runBot('balanced', 3, 520, { onWeek: (s, ev) => {
      opened += ev.filter((e) => e.type === 'chatPrompt').length;
      worst = Math.max(worst, s.chatPrompts.filter((p) => !p.resolved).length);
    } });
    expect(worst).toBeLessThanOrEqual(B.chatPromptsOpen);
    expect(r.weeks / opened).toBeLessThan(5);
    expect(r.weeks / opened).toBeGreaterThan(1);
  });
});

describe('interruption cut 2: low-stakes events arrive as Yak prompts', () => {
  const YAK = ['coffee_wanted', 'coffee_wanted_corner', 'pet_request', 'vendor_new_version', 'senior_side_project', 'app_store_rejection'];

  it('the six are marked, with an ignore choice that exists', () => {
    const marked = Object.values(EVENTS).filter((e) => e.yak).map((e) => e.id).sort();
    expect(marked).toEqual([...YAK].sort());
    for (const id of YAK) {
      const { ignore } = EVENTS[id].yak;
      expect(ignore === null || (Number.isInteger(ignore) && ignore < EVENTS[id].choices.length), id).toBe(true);
    }
  });

  it('when the event roll picks one, it arrives as a prompt instead of a popup; with prompts off it is a popup again', () => {
    const s = strained(20);
    for (const p of s.staff) p.strain = 0;
    s.week = 200;
    const ctx = makeCtx(s);
    expect(fireEvent(ctx, EVENTS.vendor_new_version, null)).toBe(true);
    expect(s.pendingDecision).toBe(null);
    expect(s.chatPrompts).toHaveLength(1);
    expect(ctx.events.map((e) => e.type)).toContain('chatPrompt');
    // With a prompt already open, the event waits instead of stacking a second one.
    const cd = s.flags.cd_senior_side_project;
    expect(fireEvent(makeCtx(s), EVENTS.senior_side_project, s.staff.find((p) => !p.founder).id)).toBe(false);
    expect(s.flags.cd_senior_side_project).toBe(cd);
    const t = strained(20);
    B.chatPromptsEnabled = false;
    try {
      fireEvent(makeCtx(t), EVENTS.vendor_new_version, null);
    } finally {
      B.chatPromptsEnabled = true;
    }
    expect(t.pendingDecision?.eventId).toBe('vendor_new_version');
  });

  // Opens one specific event's prompt the way the weekly event roll would when it picks that event.
  function eventPrompt(s, id) {
    const ev = EVENTS[id];
    if (!s.products.some((p) => !p.killed)) addProduct(s, { name: 'Inboxer' });
    const subjects = resolveSubjects(s, ev);
    const ctx = makeCtx(s);
    expect(fireEvent(ctx, ev, subjects.length ? subjects[0].id : null), id).toBe(true);
    return ctx.events;
  }

  it('officebot posts the event; answering applies that choice, with the founder replying and the outcome in the thread', () => {
    const s = strained(21);
    for (const p of s.staff) p.strain = 0;
    s.cash = 50000;
    const ev = eventPrompt(s, 'vendor_new_version');
    const p = s.chatPrompts[0];
    expect(p).toMatchObject({ kind: 'vendor_new_version', fromId: null, channel: 'general' });
    expect(ev.find((e) => e.id === p.chatId)).toMatchObject({ from: '@officebot', fromId: null });
    expect(p.options.map((o) => o.label)).toEqual(EVENTS.vendor_new_version.choices.map((c) => c.label));
    const res = dispatch(s, { type: 'answerPrompt', promptId: p.id, choice: 0 });
    expect(res.ok).toBe(true);
    expect(s.cash).toBe(50000 + EVENTS.vendor_new_version.choices[0].effects.cash);
    const thread = res.events.filter((e) => e.type === 'chat' && e.replyTo === p.chatId);
    expect(s.staff.find((x) => x.id === thread[0].fromId).founder).toBe(true);
    expect(thread.at(-1)).toMatchObject({ from: '@officebot', text: EVENTS.vendor_new_version.choices[0].outcome });
  });

  it('left unanswered, the ignore choice happens, props and all', () => {
    const s = strained(22);
    for (const p of s.staff) p.strain = 0;
    s.week = 60;
    eventPrompt(s, 'coffee_wanted');
    const p = s.chatPrompts[0];
    s.week = p.expiresWeek;
    weekOf(s);
    expect(p.resolved).toEqual({ choice: null, week: p.expiresWeek, replyId: null });
    expect((s.office.props ?? []).some((x) => x.prop === 'french_press')).toBe(true);
  });

  it('a choice with a requirement shows why it is greyed out, and the pet request still brings a dog', () => {
    const s = strained(23);
    for (const p of s.staff) p.strain = 0;
    s.cash = 0;
    s.week = 60;
    eventPrompt(s, 'coffee_wanted');
    expect(s.chatPrompts[0].options[0]).toMatchObject({ available: false, reason: expect.any(String) });
    const t = strained(24);
    for (const p of t.staff) p.strain = 0;
    t.week = 60;
    eventPrompt(t, 'pet_request');
    const pets = (t.pets ?? []).length;
    dispatch(t, { type: 'answerPrompt', promptId: t.chatPrompts[0].id, choice: 0 });
    expect(t.pets.length).toBe(pets + 1);
  });

  it('a prompt from a staged event carries its stage while open; template prompts have none', () => {
    const s = strained(25);
    for (const p of s.staff) p.strain = 0;
    s.week = 60;
    eventPrompt(s, 'coffee_wanted');
    expect(s.chatPrompts[0].stage).toMatchObject({ prop: 'french_press', anchor: 'kitchen', x: expect.any(Number), y: expect.any(Number) });
    expect(s.chatPrompts[0].subjectId).toBe(null);
    const t = strained(26);
    openOne(t);
    expect(t.chatPrompts[0].stage).toBe(null);
    expect(t.chatPrompts[0].subjectId).toBe(null);
  });

  it('every default is the mildest choice: an unanswered dog request keeps the dog at home', () => {
    const s = strained(27);
    for (const p of s.staff) p.strain = 0;
    s.week = 60;
    eventPrompt(s, 'pet_request');
    const p = s.chatPrompts[0];
    expect(p.subjectId).toBe(s.flags.promptCtx[p.id].subjectId);
    expect(p.subjectId).toBeTruthy();
    const pets = (s.pets ?? []).length;
    s.week = p.expiresWeek;
    weekOf(s);
    expect(p.resolved.choice).toBe(null);
    expect((s.pets ?? []).length).toBe(pets);
    expect(EVENTS.pet_request.choices[EVENTS.pet_request.yak.ignore].label).toBe('Not in the office');
    // A prompt nobody saw never grants an item or a pet.
    for (const e of Object.values(EVENTS).filter((x) => x.yak && x.yak.ignore !== null)) {
      const c = e.choices[e.yak.ignore];
      expect(!c.grant && !c.effects?.adoptPet && !c.effects?.buyItem && !c.effects?.upgradeItem, e.id).toBe(true);
    }
  });
});
