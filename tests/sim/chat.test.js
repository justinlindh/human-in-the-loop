import { describe, it, expect } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { chatSystem, fillChat, reactionsFor } from '../../src/sim/chat.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { THREADS, THREAD_WHO, THREAD_CONTEXTS } from '../../src/data/threads.js';
import { CHAT_CHANNELS } from '../../src/contract/events.js';
import { game, addStaff, addProduct, advance, placeAction } from './helpers.js';

function team(seed = 1, meaning = 70) {
  const s = game(seed);
  s.cash = 1e7;
  s.week = 120;
  addStaff(s, 'engineer', 'senior');
  const j = addStaff(s, 'engineer', 'junior');
  s.staff.find((p) => p.seniority === 'senior' && !p.founder).assignment = { type: 'mentor', targetId: j.id };
  addStaff(s, 'marketer', 'mid');
  addStaff(s, 'support', 'mid');
  addStaff(s, 'sales', 'mid');
  addStaff(s, 'security', 'mid');
  addStaff(s, 'engineer', 'mid', { assignment: { type: 'oversight', targetId: null } });
  for (const p of s.staff) { p.meaning = meaning; p.mood = meaning < 15 ? 'burnout' : meaning < 35 ? 'coasting' : 'ok'; }
  addProduct(s, { name: 'Inboxer', customers: 3000 });
  s.automation.engineering.level = 0.5;
  return s;
}

const chatWeek = (s, prior = []) => { const c = makeCtx(s); c.events.push(...prior); chatSystem(c); s.week++; return c.events.filter((e) => e.type === 'chat' && !prior.includes(e)); };

describe('thread data', () => {
  it('has 30+ threads with known roles, contexts, and channels', () => {
    expect(THREADS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(THREADS.map((t) => t.id)).size).toBe(THREADS.length);
    for (const t of THREADS) {
      expect(CHAT_CHANNELS).toContain(t.channel);
      expect(THREAD_WHO).toContain(t.post.who);
      expect(t.post.who).not.toBe('poster');
      if (t.context) expect(THREAD_CONTEXTS).toContain(t.context);
      expect(t.replies.length).toBeGreaterThanOrEqual(1);
      for (const r of t.replies) expect(THREAD_WHO).toContain(r.who);
    }
  });
});

describe('chat content', () => {
  it('fills every placeholder, or skips lines it cannot fill', () => {
    const s = team();
    expect(fillChat(s, s.rng, 'I love {product}', { speaker: s.staff[0] })).toBe('I love Inboxer');
    const empty = game();
    expect(fillChat(empty, empty.rng, 'I love {product}', { speaker: empty.staff[0] })).toBe(null);
    for (let w = 0; w < 200; w++) for (const m of chatWeek(s)) expect(m.text, m.text).not.toMatch(/[{}]/);
  });

  it('every message has the contract shape and replies point at real earlier messages', () => {
    const s = team(3);
    const seen = new Set();
    let replies = 0;
    for (let w = 0; w < 200; w++) {
      for (const m of chatWeek(s)) {
        expect(m).toMatchObject({ type: 'chat' });
        expect(m.id).toMatch(/^m\d+$/);
        expect(CHAT_CHANNELS).toContain(m.channel);
        expect(typeof m.reactions).toBe('object');
        if (m.replyTo !== null) { expect(seen.has(m.replyTo)).toBe(true); replies++; }
        if (m.fromId) expect(typeof m.from).toBe('string');
        seen.add(m.id);
      }
    }
    expect(replies).toBeGreaterThan(10);
  });

  it('routes launches and promotions to #wins, incidents to #incidents, items to #random, mood to #general', () => {
    const s = team(2);
    const p = s.products[0];
    const launch = chatWeek(s, [{ type: 'launch', productId: p.id }]);
    expect(launch.some((m) => m.channel === 'wins')).toBe(true);
    const inc = chatWeek(s, [{ type: 'incident', kind: 'db_wipe', productId: p.id, caught: false, severity: 4 }]);
    expect(inc.some((m) => m.channel === 'incidents')).toBe(true);
    const buy = dispatch(s, placeAction(s, 'espresso'));
    expect(buy.events.some((e) => e.type === 'chat' && e.channel === 'random')).toBe(true);
    const general = [];
    for (let w = 0; w < 30; w++) general.push(...chatWeek(s));
    expect(general.some((m) => m.channel === 'general' && m.fromId)).toBe(true);
  });

  it('promotions post in #wins', () => {
    const s = team(4);
    const j = s.staff.find((x) => x.seniority === 'junior');
    j.level = 4; j.xp = 239;
    const ev = [];
    for (let w = 0; w < 2; w++) { const out = tick(s); ev.push(...out); if (s.pendingDecision) s.pendingDecision = null; }
    expect(j.seniority).toBe('mid');
    expect(ev.some((e) => e.type === 'chat' && e.channel === 'wins' && e.text.includes(j.name))).toBe(true);
  });

  it('everyday lines do not repeat within a few weeks', () => {
    const s = team(8);
    const recent = [];
    for (let w = 0; w < 80; w++) {
      const lines = chatWeek(s).filter((m) => m.fromId && m.replyTo === null && m.channel === 'general').map((m) => m.text);
      for (const t of lines) expect(recent.slice(-8), t).not.toContain(t);
      recent.push(...lines);
    }
  });

  it('never names a coworker who shares the speaker first name', () => {
    const s = team(2);
    s.staff[1].name = `${s.staff[0].name.split(' ')[0]} Other`;
    for (let i = 0; i < 100; i++) {
      const t = fillChat(s, s.rng, '{coworker} rocks', { speaker: s.staff[0] });
      expect(t.startsWith(s.staff[0].name.split(' ')[0])).toBe(false);
    }
  });

  it('many everyday lines get no reactions at all', () => {
    const s = team(7, 60);
    let none = 0;
    let total = 0;
    for (let w = 0; w < 60; w++) for (const m of chatWeek(s)) if (m.channel === 'general' && m.replyTo === null) { total++; if (!Object.keys(m.reactions).length) none++; }
    expect(none / total).toBeGreaterThan(0.25);
  });

  it('reactions grow with team meaning', () => {
    const total = (meaning) => {
      let n = 0;
      const s = team(5, meaning);
      for (let w = 0; w < 60; w++) for (const m of chatWeek(s)) n += Object.values(m.reactions).reduce((a, b) => a + b, 0);
      return n;
    };
    expect(total(90)).toBeGreaterThan(total(20) * 2);
    const s = team();
    expect(Object.keys(reactionsFor(s, s.rng, 'wins', 'win', 95)).length).toBeGreaterThan(0);
    const fw = reactionsFor(s, s.rng, 'general', 'farewell', 80);
    expect(Object.keys(fw).some((k) => k === '🫡')).toBe(true);
  });

  it('a burnt-out team goes quiet', () => {
    const count = (meaning) => {
      const s = team(6, meaning);
      let n = 0;
      for (let w = 0; w < 60; w++) n += chatWeek(s).filter((m) => m.fromId).length;
      return n;
    };
    expect(count(20)).toBeLessThan(count(85) * 0.6);
    const s = team(6, 100);
    for (let w = 0; w < 60; w++) expect(chatWeek(s).length).toBeLessThanOrEqual(B.chatMax + 4);
  });

  it('is deterministic', () => {
    const a = team(9);
    const b = team(9);
    const ra = [];
    const rb = [];
    for (let w = 0; w < 50; w++) { ra.push(...chatWeek(a)); rb.push(...chatWeek(b)); }
    expect(JSON.stringify(ra)).toBe(JSON.stringify(rb));
  });

  it('meaning no longer emits mood chatter itself', async () => {
    const { meaningSystem } = await import('../../src/sim/meaning.js');
    const s = team(1);
    for (let w = 0; w < 30; w++) {
      const c = makeCtx(s);
      meaningSystem(c);
      const resigned = c.events.some((e) => e.type === 'resign');
      if (!resigned) expect(c.events.filter((e) => e.type === 'chat')).toEqual([]);
      s.week++;
    }
  });
});
