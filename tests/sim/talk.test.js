import { describe, it, expect } from 'vitest';
import { chatSystem } from '../../src/sim/chat.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { TALK, RUNNING_JOKES } from '../../src/data/talk.js';
import { game, addStaff, addProduct, addDesks } from './helpers.js';

// A busy company in the Agents era: ten people at desks, a few products, a mentor pair.
function busy(seed = 1) {
  const s = game(seed);
  s.cash = 1e7;
  s.week = 330;
  s.officeStage = 1;
  s.office.stage = 1;
  addDesks(s, 8);
  const senior = addStaff(s, 'engineer', 'senior');
  const junior = addStaff(s, 'engineer', 'junior');
  senior.assignment = { type: 'mentor', targetId: junior.id };
  for (const role of ['designer', 'marketer', 'support', 'sales', 'security', 'engineer']) addStaff(s, role, 'mid');
  for (const p of s.staff) { p.meaning = 72; p.mood = 'ok'; p.stamina = 80; }
  addProduct(s, { name: 'Inboxer' });
  addProduct(s, { name: 'Plannr', category: 'pm', angle: 'web', model: null });
  return s;
}

const week = (s, prior = []) => {
  const c = makeCtx(s);
  c.events.push(...prior);
  chatSystem(c);
  s.week++;
  return c.events.filter((e) => !prior.includes(e));
};

describe('office talk', () => {
  it('spoken lines have the say shape, come from people in the office, and never reach Yak', () => {
    const s = busy(2);
    s.staff[3].remote = true;
    const ids = new Set();
    let exchanges = 0;
    for (let w = 0; w < 200; w++) {
      for (const e of week(s)) {
        if (e.type !== 'say') continue;
        expect(e).toMatchObject({ id: expect.stringMatching(/^v\d+$/), week: expect.any(Number), staffId: expect.any(String), text: expect.any(String) });
        const who = s.staff.find((p) => p.id === e.staffId);
        expect(who.mood).not.toBe('away');
        expect(who.remote).toBe(false);
        if (e.replyTo) { expect(ids.has(e.replyTo)).toBe(true); exchanges++; }
        if (e.toId) expect(s.staff.some((p) => p.id === e.toId)).toBe(true);
        expect(e.text).not.toMatch(/[{}]/);
        ids.add(e.id);
      }
      s.staff[3].remote = w % 2 === 0;
    }
    expect(exchanges).toBeGreaterThan(20);
    expect(s.chatLog.some((m) => ids.has(m.id))).toBe(false);
  });

  it('keeps a modest rate: about one spoken line a week and less in Yak', () => {
    const s = busy(3);
    let say = 0;
    let chat = 0;
    let most = 0;
    const W = 300;
    for (let w = 0; w < W; w++) {
      const ev = week(s);
      const spoken = ev.filter((e) => e.type === 'say');
      say += spoken.length;
      chat += ev.filter((e) => e.type === 'chat' && e.fromId).length;
      const per = {};
      for (const e of spoken) per[e.staffId] = (per[e.staffId] ?? 0) + 1;
      most = Math.max(most, ...Object.values(per), 0);
    }
    expect(say / W).toBeGreaterThan(0.7);
    expect(say / W).toBeLessThan(2.2);
    expect(chat / W).toBeGreaterThan(0.2);
    expect(chat / W).toBeLessThan(1.3);
    expect(most).toBeLessThanOrEqual(3);
  });

  it('200 weeks of a busy company never repeat a line within 30 lines', () => {
    for (const seed of [1, 4]) {
      const s = busy(seed);
      const lines = [];
      for (let w = 0; w < 200; w++) {
        for (const e of week(s)) if ((e.type === 'say' || (e.type === 'chat' && e.fromId))) lines.push(e.text);
      }
      for (let i = 0; i < lines.length; i++) {
        expect(lines.slice(Math.max(0, i - 30), i), `seed ${seed}: ${lines[i]}`).not.toContain(lines[i]);
      }
      expect(lines.length).toBeGreaterThan(200);
    }
  });

  it('what happened this week comes first: a launch gets talked about', () => {
    let talked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = busy(seed);
      const p = s.products[0];
      week(s, [{ type: 'launch', productId: p.id }]);
      if (TALK.some((t) => t.on === 'launch' && s.flags.talk.cd[t.id] !== undefined)) talked++;
    }
    expect(talked).toBeGreaterThanOrEqual(12);
  });

  it('each run carries its own running jokes and rare exchanges, with the same cast every time', () => {
    const picks = new Set();
    const rare = new Set();
    for (let seed = 1; seed <= 8; seed++) {
      const s = busy(seed);
      week(s);
      picks.add(Object.keys(s.flags.talk.jokes).sort().join());
      rare.add(s.flags.talk.rareOff.sort().join());
      expect(Object.keys(s.flags.talk.jokes)).toHaveLength(B.runningJokesPerRun);
    }
    expect(picks.size).toBeGreaterThan(3);
    expect(rare.size).toBeGreaterThan(3);
    const s = busy(5);
    for (let w = 0; w < 300; w++) week(s);
    const played = Object.entries(s.flags.talk.jokes).filter(([, j]) => j.step > 1);
    expect(played.length).toBeGreaterThanOrEqual(1);
    for (const [id, j] of played) {
      const joke = RUNNING_JOKES.find((x) => x.id === id);
      expect(Object.keys(j.cast).sort()).toEqual(Object.keys(joke.cast).sort());
    }
  });

  it('a burnt-out team talks less', () => {
    const count = (meaning) => {
      const s = busy(6);
      for (const p of s.staff) { p.meaning = meaning; p.mood = meaning < 15 ? 'burnout' : meaning < 35 ? 'coasting' : 'ok'; }
      let n = 0;
      for (let w = 0; w < 100; w++) n += week(s).filter((e) => e.type === 'say' || (e.type === 'chat' && e.fromId)).length;
      return n;
    };
    expect(count(20)).toBeLessThan(count(85) * 0.8);
  });

  it('is deterministic', () => {
    const run = () => { const s = busy(9); const out = []; for (let w = 0; w < 80; w++) out.push(...week(s)); return JSON.stringify(out); };
    expect(run()).toBe(run());
  });
});

describe('the @channel running joke', () => {
  it('one over-notifier per run, a few times a run, with the no_at_channel reaction; warranted during an outage', () => {
    const s = busy(11);
    const pings = [];
    for (let w = 0; w < 600; w++) for (const e of week(s)) if (e.type === 'chat' && e.text.startsWith('@channel')) pings.push(e);
    expect(pings.length).toBeGreaterThanOrEqual(2);
    expect(pings.length).toBeLessThanOrEqual(12);
    expect(new Set(pings.map((e) => e.fromId)).size).toBe(1);
    for (const e of pings) expect(e.reactions.no_at_channel).toBeGreaterThanOrEqual(2);
    const t = busy(12);
    const p = t.products[0];
    t.outage = { productId: p.id, kind: 'ransomware', severity: 4, weeks: 0, unrecoverable: false };
    let warranted = null;
    for (let i = 0; i < 40 && !warranted; i++) {
      t.flags.talk && (t.flags.talk.atChannelNext = 0);
      t.outage.weeks = 0;
      warranted = week(t).find((e) => e.type === 'chat' && e.text.startsWith('@channel') && e.text.includes(p.name));
    }
    expect(warranted).toBeTruthy();
  });
});
