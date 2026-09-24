import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { standupSystem } from '../../src/sim/standup.js';
import { outputMult } from '../../src/sim/staff.js';
import { institutionalKnowledge } from '../../src/sim/knowledge.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { STANDUP } from '../../src/data/standup.js';
import { POLICIES } from '../../src/data/policies.js';
import { game, addStaff, addProduct } from './helpers.js';

const EM_DASH = String.fromCharCode(0x2014);
const run = (s) => { const c = makeCtx(s); standupSystem(c); return c.events; };

function office(seed = 1) {
  const s = game(seed);
  s.cash = 1e6;
  const pid = dispatch(s, { type: 'startProject', kind: 'new', name: 'Loopo', category: 'notes', angle: 'copilot', model: 'chatgbt', size: 'small' }).projectId;
  for (const p of s.staff) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: pid } });
  addStaff(s, 'support', 'mid', { assignment: { type: 'support', targetId: null } });
  addStaff(s, 'engineer', 'mid', { assignment: { type: 'maintenance', targetId: null } });
  addProduct(s, { name: 'Jotly' });
  return s;
}

describe('standup content', () => {
  it('has 40+ lines in the game voice', () => {
    const all = Object.values(STANDUP).flat();
    expect(all.length).toBeGreaterThanOrEqual(40);
    for (const l of all) {
      expect(l.includes(EM_DASH)).toBe(false);
      expect(l).not.toMatch(/startup/i);
      expect(l.length).toBeLessThan(90);
    }
    expect(STANDUP.coasting.length).toBeGreaterThanOrEqual(5);
  });
});

describe('standup policies', () => {
  it('both exist, unlock at once, and are mutually exclusive', () => {
    const s = game();
    s.staff = s.staff.slice(0, 4);
    expect(POLICIES.daily_standups.unlock(s)).toBe(false);
    for (let i = s.staff.length; i < 5; i++) addStaff(s, 'engineer', 'mid');
    expect(POLICIES.daily_standups.unlock(s)).toBe(true);
    expect(POLICIES.async_standups.unlock(s)).toBe(true);
    dispatch(s, { type: 'setPolicy', id: 'daily_standups', on: true });
    dispatch(s, { type: 'setPolicy', id: 'async_standups', on: true });
    expect(s.policies.async_standups).toBe(true);
    expect(s.policies.daily_standups).toBeUndefined();
    dispatch(s, { type: 'setPolicy', id: 'daily_standups', on: true });
    expect(s.policies.async_standups).toBeUndefined();
  });

  it('no standup without a policy', () => {
    const s = office();
    expect(run(s)).toEqual([]);
  });
});

describe('a daily standup', () => {
  it('has 3 to 5 lines from present staff that reference real work', () => {
    const s = office(3);
    s.policies.daily_standups = true;
    let sawProject = false;
    for (let w = 0; w < 30; w++) {
      const ev = run(s);
      const st = ev.find((e) => e.type === 'standup');
      expect(st.mode).toBe('daily');
      expect(st.lines.length).toBeGreaterThanOrEqual(3);
      expect(st.lines.length).toBeLessThanOrEqual(5);
      for (const l of st.lines) {
        const p = s.staff.find((x) => x.id === l.staffId);
        expect(p.mood).not.toBe('away');
        expect(l.text).not.toMatch(/[{}]/);
        if (p.assignment.type === 'project' && /Loopo/.test(l.text)) sawProject = true;
      }
      expect(ev.some((e) => e.type === 'chat')).toBe(false);
      s.week++;
    }
    expect(sawProject).toBe(true);
  });

  it('burnt-out people say nothing and coasting people give flat answers', () => {
    const s = office(2);
    s.policies.daily_standups = true;
    for (const p of s.staff) { p.mood = 'burnout'; p.meaning = 5; }
    for (const l of run(s).find((e) => e.type === 'standup').lines) expect(l.text).toBe('');
    for (const p of s.staff) { p.mood = 'coasting'; p.meaning = 25; }
    for (const l of run(s).find((e) => e.type === 'standup').lines) expect(STANDUP.coasting).toContain(l.text);
  });

  it('costs a little output, lifts attendees meaning, and helps knowledge sharing', () => {
    const s = office();
    const p = s.staff[0];
    const base = outputMult(s, p);
    const ik = institutionalKnowledge(s);
    s.policies.daily_standups = true;
    expect(outputMult(s, p) / base).toBeCloseTo(1 + B.standupDailyOutput);
    expect(institutionalKnowledge(s)).toBeGreaterThan(ik);
    const meanings = s.staff.map((x) => x.meaning);
    const spoke = new Set(run(s).find((e) => e.type === 'standup').lines.map((l) => l.staffId));
    s.staff.forEach((x, i) => expect(x.meaning).toBeCloseTo(spoke.has(x.id) ? Math.min(100, meanings[i] + B.standupDailyMeaning) : meanings[i]));
  });
});

describe('an async standup', () => {
  it('posts non-empty lines to #standup, costs no output, and helps knowledge less', () => {
    const s = office(4);
    const p = s.staff[0];
    const base = outputMult(s, p);
    const ik0 = institutionalKnowledge(s);
    s.policies.daily_standups = true;
    const ikDaily = institutionalKnowledge(s);
    delete s.policies.daily_standups;
    s.policies.async_standups = true;
    expect(outputMult(s, p)).toBeCloseTo(base);
    const ikAsync = institutionalKnowledge(s);
    expect(ikAsync).toBeGreaterThan(ik0);
    expect(ikAsync - ik0).toBeCloseTo((ikDaily - ik0) / 2);
    s.staff[2].mood = 'burnout';
    const meanings = s.staff.map((x) => x.meaning);
    const ev = run(s);
    const st = ev.find((e) => e.type === 'standup');
    expect(st.mode).toBe('async');
    const chats = ev.filter((e) => e.type === 'chat');
    expect(chats.every((c) => c.channel === 'standup' && c.fromId)).toBe(true);
    // About a third of the speakers bother to post; every post is one of their lines.
    expect(chats.length).toBeLessThanOrEqual(st.lines.filter((l) => l.text).length);
    for (const c of chats) expect(st.lines.some((l) => l.text === c.text && l.staffId === c.fromId)).toBe(true);
    s.staff.forEach((x, i) => expect(x.meaning).toBe(meanings[i]));
  });
});

describe('standup variety', () => {
  it('async updates almost never repeat a line within 30 posts over a long run', async () => {
    const { runBot } = await import('../../src/sim/bots.js');
    for (const seed of [1, 2]) {
      const posts = [];
      runBot('sensible', seed, 400, { onWeek: (s, ev) => { for (const e of ev) if (e.type === 'chat' && e.channel === 'standup') posts.push(e.text); } });
      expect(posts.length).toBeGreaterThan(50);
      const repeats = posts.filter((t, i) => posts.slice(Math.max(0, i - 30), i).includes(t));
      expect(repeats.length / posts.length, `seed ${seed}: ${repeats.length} of ${posts.length}`).toBeLessThanOrEqual(0.12);
    }
  }, 120000);
});
