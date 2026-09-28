import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { standupSystem, standupConversation } from '../../src/sim/standup.js';
import { outputMult } from '../../src/sim/staff.js';
import { institutionalKnowledge } from '../../src/sim/knowledge.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { STANDUP, STANDUP_EXCHANGES } from '../../src/data/standup.js';
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
  const daily = s => { s.week++; s.policies.daily_standups = true; return run(s).find(e => e.type === 'standup').lines; };
  it('uses different complete exchanges across successive meetings and save round trips', () => {
    const s = office(9), sequences = [];
    for (let i = 0; i < 12; i++) {
      const clone = JSON.parse(JSON.stringify(s));
      const lines = daily(s);
      expect(daily(clone)).toEqual(lines);
      expect(new Set(lines.map(l => l.staffId)).size).toBeGreaterThanOrEqual(3);
      const signature = lines.map(l => l.text).join('|');
      expect(sequences).not.toContain(signature);
      sequences.push(signature);
      expect(lines.every(l => l.text.length <= 70 && !/[{}]/.test(l.text))).toBe(true);
    }
    expect(s.flags.standupConversationRecent.length).toBeLessThanOrEqual(B.standupConversationMemory);
  });
  it('uses the assigned project and current outage, then drops resolved context immediately', () => {
    const s = office(2), speakers = s.staff;
    const fallback = speakers.map(p => ({ staffId: p.id, text: 'Update.' }));
    s.projects[0].progress = s.projects[0].pointsNeeded * 0.45;
    const project = standupConversation(s, speakers, fallback);
    expect(project.some(l => /Loopo.*45%/.test(l.text))).toBe(true);
    s.outage = { productId: s.products[0].id };
    const outage = standupConversation(s, speakers, fallback);
    expect(outage.some(l => /Jotly.*down/.test(l.text))).toBe(true);
    s.outage = null;
    s.products[0].killed = true;
    s.projects = [];
    for (let i = 0; i < 20; i++) {
      const lines = standupConversation(s, speakers, fallback);
      expect(lines.map(l => l.text).join(' ')).not.toMatch(/Jotly|Loopo|outage|still down/);
    }
  });
  it('does not invent launches, incidents, AI, furniture, or absent speakers in a new company', () => {
    const s = game(5);
    s.era = { id: 'classic', since: 0 };
    s.products = []; s.projects = []; s.office.placed = [];
    for (const p of s.staff) p.assignment = { type: 'idle', targetId: null };
    for (let i = 0; i < 20; i++) {
      const lines = daily(s);
      expect(lines.map(l => l.text).join(' ')).not.toMatch(/\b(customer|launch|outage|incident|agent|AI|whiteboard|shipped)\b/i);
    }
    const away = s.staff[0]; away.mood = 'away';
    expect(daily(s).some(l => l.staffId === away.id)).toBe(false);
  });
  it('preserves quiet moods and the selected attendees without drawing simulation randomness', () => {
    const s = office(2), speakers = s.staff;
    speakers[0].mood = 'burnout';
    speakers[1].mood = 'coasting';
    const fallback = speakers.map(p => ({ staffId: p.id, text: p.mood === 'burnout' ? '' : p.mood === 'coasting' ? 'Still on it.' : 'Update.' }));
    const rng = JSON.stringify(s.rng);
    const lines = standupConversation(s, speakers, fallback);
    expect(lines.find(l => l.staffId === speakers[0].id).text).toBe('');
    expect(lines.find(l => l.staffId === speakers[1].id).text).toBe('Still on it.');
    expect(new Set(lines.map(l => l.staffId))).toEqual(new Set(speakers.map(p => p.id)));
    expect(JSON.stringify(s.rng)).toBe(rng);
  });
  it('keeps the connected exchange with office attendees when others are remote or on sabbatical', () => {
    const s = office(2), speakers = s.staff;
    for (const p of speakers) p.assignment = { type: 'idle', targetId: null };
    speakers[0].remote = true;
    speakers[1].assignment = { type: 'sabbatical', targetId: null };
    const fallback = speakers.map(p => ({ staffId: p.id, text: `Update ${p.id}.` }));
    const lines = standupConversation(s, speakers, fallback);
    const inOffice = speakers.filter(p => !p.remote && p.assignment.type !== 'sabbatical');
    const turns = lines.length - 2;
    expect(lines.slice(0, turns).map(l => l.staffId)).toEqual(Array.from({ length: turns }, (_, i) => inOffice[i % inOffice.length].id));
    expect(lines.slice(turns)).toEqual(fallback.slice(0, 2));
    expect(lines.slice(0, turns).every(l => !l.text.startsWith('Update '))).toBe(true);
  });
  it('has unique exchange ids and complete short scripts with strict context topics', () => {
    expect(new Set(STANDUP_EXCHANGES.map(e => e.id)).size).toBe(STANDUP_EXCHANGES.length);
    for (const e of STANDUP_EXCHANGES) {
      expect(e.lines).toHaveLength(5);
      for (const line of e.lines) expect(line.replaceAll('{project}', 'A long project name').replaceAll('{product}', 'A long product name').replaceAll('{pct}', '100').length).toBeLessThanOrEqual(70);
    }
  });
  it('plays all five turns unless active colleagues are waiting; quiet ones never cut it short', () => {
    const s = office(2), speakers = s.staff;
    for (const p of speakers) { p.remote = false; p.mood = 'ok'; p.assignment = { type: 'idle', targetId: null }; }
    const two = speakers.slice(0, 2);
    const alone = standupConversation(s, two, two.map(p => ({ staffId: p.id, text: 'Still on it.' })));
    const script = () => STANDUP_EXCHANGES.find(e => e.id === s.flags.standupConversation.script);
    expect(alone.map(l => l.text)).toEqual(script().lines);
    expect(alone.map(l => l.staffId)).toEqual([two[0].id, two[1].id, two[0].id, two[1].id, two[0].id]);
    for (const p of speakers.slice(2)) p.mood = 'coasting';
    const updates = speakers.map(p => ({ staffId: p.id, text: 'Still on it.' }));
    const quiet = standupConversation(s, speakers, updates);
    expect(quiet.slice(0, 5).map(l => l.text)).toEqual(script().lines);
    expect(quiet.slice(5)).toEqual(updates.slice(2));
    for (const p of speakers) p.mood = 'ok';
    const busy = standupConversation(s, speakers, updates);
    const waiting = speakers.length - B.standupConversationCast;
    expect(busy).toHaveLength(B.standupMaxLines);
    expect(busy.slice(0, B.standupMaxLines - waiting).map(l => l.text)).toEqual(script().lines.slice(0, B.standupMaxLines - waiting));
  });

  it('picks exchanges at random within the most urgent topic, without touching the game RNG', () => {
    const openers = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const s = office(seed);
      for (const p of s.staff) { p.remote = false; p.mood = 'ok'; p.assignment = { type: 'idle', targetId: null }; }
      const rng = JSON.stringify(s.rng);
      standupConversation(s, s.staff, s.staff.map(p => ({ staffId: p.id, text: 'Update.' })));
      openers.add(s.flags.standupConversation.script);
      expect(JSON.stringify(s.rng)).toBe(rng);
    }
    expect(openers.size).toBeGreaterThan(3);
  });

  it('holds a conversation in some daily standups and plain updates in others', () => {
    const s = office(4);
    let talks = 0;
    for (let i = 0; i < 60; i++) { daily(s); if (s.flags.standupConversation) talks++; }
    expect(talks).toBeGreaterThan(10);
    expect(talks).toBeLessThan(50);
  });

  it('async updates almost never repeat a line within 30 posts over a long run', async () => {
    const { runBot } = await import('../../src/sim/bots.js');
    for (const seed of [1, 2]) {
      const posts = [];
      runBot('sensible', seed, 400, { onWeek: (s, ev) => { for (const e of ev) if (e.type === 'chat' && e.channel === 'standup') posts.push(e.text); } });
      expect(posts.length).toBeGreaterThan(50);
      const repeats = posts.filter((t, i) => posts.slice(Math.max(0, i - 30), i).includes(t));
      expect(repeats.length / posts.length, `seed ${seed}: ${repeats.length} of ${posts.length}`).toBeLessThanOrEqual(0.1);
    }
  }, 120000);
});
