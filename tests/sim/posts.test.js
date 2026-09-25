import { describe, it, expect } from 'vitest';
import { dispatch, postOptions } from '../../src/sim/index.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { B } from '../../src/sim/balance.js';
import { POSTS, POST_IDS } from '../../src/data/posts.js';
import { postsSystem } from '../../src/sim/posts.js';
import { makeCtx } from '../../src/sim/registry.js';
import { eraAllowsText } from '../../src/sim/eras.js';
import { game, addStaff, addDesks, addProduct } from './helpers.js';

const IDS = ['pep_talk', 'who_broke_prod', 'meme', 'pizza', 'announcement'];

function office(seed = 1) {
  const s = game(seed);
  s.week = 60;
  s.cash = 1e6;
  addDesks(s, 6);
  for (const role of ['engineer', 'designer', 'marketer', 'support']) addStaff(s, role, 'mid', { hiredWeek: 0 });
  for (const p of s.staff) { p.mood = 'ok'; p.meaning = 60; p.stamina = 50; p.remote = false; }
  addProduct(s, { name: 'Inboxer', launchedWeek: 10 });
  for (const g of Object.values(s.goals)) g.week = g.week ?? null;
  return s;
}
const post = (s, id) => dispatch(s, { type: 'postMessage', id });
// Runs the weeks after a post and returns the replies that land.
function repliesOver(s, weeks) {
  const out = [];
  for (let i = 0; i < weeks; i++) { s.week++; const ctx = makeCtx(s); postsSystem(ctx); out.push(...ctx.events.filter((e) => e.type === 'chat')); }
  return out;
}
const avgMeaning = (s) => s.staff.reduce((a, p) => a + p.meaning, 0) / s.staff.length;

describe('issue #16: the founders\' quick posts', () => {
  it('offers the five posts in a fixed order with the contract shape', () => {
    expect(POST_IDS).toEqual(IDS);
    const opts = postOptions(office(1));
    expect(opts.map((o) => o.id)).toEqual(IDS);
    for (const o of opts) expect(o).toEqual({ id: expect.any(String), label: expect.any(String), hint: expect.any(String), icon: expect.any(String), channel: expect.any(String), available: true, reason: null, readyWeek: null });
    expect(opts.find((o) => o.id === 'who_broke_prod').channel).toBe('incidents');
  });

  it('copy fits Classic and never says startup', () => {
    const classic = { era: { id: 'classic' } };
    for (const p of POSTS) {
      const all = [p.label, p.hint, ...p.text, ...(p.vague ?? []), ...Object.values(p.replies).flat()];
      for (const line of all) {
        expect(line).not.toMatch(/startup/i);
        expect(eraAllowsText(classic, line.replace('{news}', 'Inboxer is live')), line).toBe(true);
      }
    }
  });

  it('a pep talk lands: the post and posted come from the dispatch, and one to three replies follow over the next weeks', () => {
    const s = office(2);
    const before = avgMeaning(s);
    const res = post(s, 'pep_talk');
    expect(res).toEqual({ ok: true, outcome: 'landed', chatId: expect.any(String), events: expect.any(Array) });
    const head = res.events.find((e) => e.type === 'chat' && e.id === res.chatId);
    expect(s.staff.find((p) => p.id === head.fromId).founder).toBe(true);
    expect(Object.values(head.reactions).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(res.events.at(-1)).toEqual({ type: 'posted', id: 'pep_talk', chatId: res.chatId, outcome: 'landed' });
    expect(avgMeaning(s)).toBeCloseTo(before + B.posts.pepTalk, 5);
    const replies = repliesOver(s, B.posts.replyWeeks);
    expect(replies.length).toBeGreaterThanOrEqual(1);
    expect(replies.length).toBeLessThanOrEqual(3);
    for (const r of replies) {
      expect(r.replyTo).toBe(res.chatId);
      expect(s.staff.find((p) => p.id === r.fromId).founder).toBe(false);
    }
    expect(s.flags.posts.queue).toEqual([]);
  });

  it('timing decides the outcome: a meme or a pep talk during an outage backfires, "who broke prod?" helps', () => {
    const s = office(3);
    const product = s.products[0];
    s.outage = { productId: product.id, kind: 'bad_deploy', severity: 2, weeks: 0, unrecoverable: false };
    product.health = 50;
    const meme = post(s, 'meme');
    expect(meme.outcome).toBe('backfired');
    expect(meme.events.some((e) => e.type === 'toast' && e.tone === 'warn')).toBe(true);
    s.week += B.posts.cooldownWeeks;
    expect(post(s, 'who_broke_prod').outcome).toBe('landed');
    expect(product.health).toBe(50 + B.posts.fixHealth);
    s.week += B.posts.cooldownWeeks;
    expect(post(s, 'pep_talk').outcome).toBe('backfired');
    const calm = office(4);
    expect(post(calm, 'who_broke_prod').outcome).toBe('backfired');
  });

  it('an announcement lands only with news to share', () => {
    const quiet = office(5);
    for (const g of Object.values(quiet.goals)) if (g.week !== null) g.week = 0;
    expect(post(quiet, 'announcement').outcome).toBe('backfired');
    const s = office(6);
    addProduct(s, { name: 'Plannr', launchedWeek: s.week - 1 });
    const res = post(s, 'announcement');
    expect(res.outcome).toBe('landed');
    expect(res.events.find((e) => e.id === res.chatId).text).toContain('Plannr is live');
  });

  it('pizza costs a little per person and lifts stamina', () => {
    const s = office(7);
    const cash = s.cash;
    expect(post(s, 'pizza').outcome).toBe('landed');
    expect(s.cash).toBe(cash - B.posts.pizzaPerHead * s.staff.length);
    for (const p of s.staff) expect(p.stamina).toBe(50 + B.posts.pizzaStamina);
    const broke = office(8);
    broke.cash = 10;
    expect(postOptions(broke).find((o) => o.id === 'pizza')).toMatchObject({ available: false, reason: 'Not enough cash' });
    expect(post(broke, 'pizza').reason).toBe('Not enough cash');
  });

  it('a shared cooldown, and the same post again inside the repeat window falls flat with no effect', () => {
    const s = office(9);
    post(s, 'meme');
    expect(post(s, 'pep_talk').reason).toBe('Posted recently');
    expect(postOptions(s)[0]).toMatchObject({ available: false, reason: 'Posted recently', readyWeek: s.week + B.posts.cooldownWeeks });
    s.week += 1;
    expect(post(s, 'pep_talk').reason).toBe(B.posts.cooldownWeeks - 1 === 1 ? 'Ready in 1 week' : `Ready in ${B.posts.cooldownWeeks - 1} weeks`);
    s.week -= 1;
    s.week += B.posts.cooldownWeeks;
    const before = avgMeaning(s);
    const again = post(s, 'meme');
    expect(again.outcome).toBe('flat');
    expect(avgMeaning(s)).toBe(before);
    s.week += B.posts.repeatWeeks;
    expect(post(s, 'meme').outcome).toBe('landed');
  });

  it('rejects unknown posts, and the kill switch turns the feature off', () => {
    const s = office(10);
    expect(post(s, 'haiku').reason).toBe('Unknown message');
    B.postsEnabled = false;
    try {
      expect(postOptions(s)).toEqual([]);
      expect(post(s, 'meme').reason).toBe('Posts are off');
    } finally {
      B.postsEnabled = true;
    }
  });

  it('never draws from the game\'s random stream', () => {
    const s = office(11);
    const rng = s.rng.s;
    post(s, 'pizza');
    expect(s.rng.s).toBe(rng);
  });

  it('old saves without post memory load with every post available', () => {
    const s = office(12);
    post(s, 'meme');
    delete s.flags.posts;
    const m = new Map();
    const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    saveGame(s, store);
    const loaded = loadGame(store).state;
    expect(postOptions(loaded).every((o) => o.available)).toBe(true);
  });
});
