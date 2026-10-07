import { describe, it, expect } from 'vitest';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { ITEMS } from '../../src/data/items.js';
import { EVENTS } from '../../src/data/events.js';
import { MOMENT_CAPTIONS as MOMENTS } from '../../src/data/moments.js';
import { helpers } from '../../src/sim/events.js';
import { coolerShare } from '../../src/sim/cooler.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { seatTile, desksOf } from '../../src/sim/office.js';
import { game, addStaff, addDesks } from './helpers.js';

// A company with a few desks, everyone in the office with known knowledge, and a cooler placed next to the
// first desk's seat.
function office(knowledge = [80, 20, 40]) {
  const s = game(1);
  s.staff = [];
  s.office.placed = s.office.placed.filter((p) => p.itemId !== 'desk');
  addDesks(s, knowledge.length);
  const people = knowledge.map((k) => addStaff(s, 'engineer', 'mid', { knowledge: k, mood: 'ok', remote: false }));
  return { s, people };
}
const placeCooler = (s, near, id = 'wc1') => {
  const [x, y] = seatTile(desksOf(s.office.placed).find((d) => d.id === near.deskId));
  const cooler = { id, itemId: 'water_cooler', level: 1, x, y: y + 1, rot: 0 };
  s.office.placed.push(cooler);
  return cooler;
};
const week = (s) => { const ctx = makeCtx(s); coolerShare(ctx); return ctx; };

describe('issue #1640: the water cooler', () => {
  it('replaces the coffee corner in the shop: 2x1, outdoors too, at B.cooler.price', () => {
    expect(ITEMS.coffee_corner).toBeUndefined();
    const it = ITEMS.water_cooler;
    expect(it).toMatchObject({ name: 'Water Cooler', kind: 'furniture', footprint: { w: 2, h: 1 }, outdoor: true, costs: [B.cooler.price] });
    expect(B.cooler.price).toBe(1500);
    expect(it.desc).toBe("Where the team trades what the code actually does. People near it pick up each other's context.");
    expect(it.adjacency).toEqual({ radius: B.cooler.radius, key: 'knowledgeShare', value: B.cooler.share });
  });

  it('a crowd of two or more closes 2% of the gap to its most knowledgeable member each week', () => {
    const { s, people: [lead, junior, mid] } = office([80, 50, 60]);
    placeCooler(s, lead);
    week(s);
    expect(lead.knowledge).toBe(80);
    expect(junior.knowledge).toBeCloseTo(50 + B.cooler.share * 30);
    expect(mid.knowledge).toBeCloseTo(60 + B.cooler.share * 20);
  });

  it('the weekly gain is capped at B.cooler.maxGain', () => {
    const { s, people: [lead, junior] } = office([100, 0]);
    B.cooler.share = 0.5;
    try {
      placeCooler(s, lead);
      week(s);
    } finally { B.cooler.share = 0.02; }
    expect(junior.knowledge).toBe(B.cooler.maxGain);
  });

  it('nobody gains alone, and remote or away staff are not in the crowd', () => {
    const { s, people: [lead, junior] } = office([80, 20]);
    placeCooler(s, lead);
    lead.remote = true;
    week(s);
    expect(junior.knowledge).toBe(20);
    lead.remote = false;
    lead.mood = 'away';
    week(s);
    expect(junior.knowledge).toBe(20);
  });

  it('a desk near two coolers gains once a week', () => {
    const { s, people: [lead, junior] } = office([80, 50]);
    const c = placeCooler(s, lead);
    s.office.placed.push({ ...c, id: 'wc2', x: c.x, y: c.y + 1 });
    week(s);
    expect(junior.knowledge).toBeCloseTo(50 + B.cooler.share * 30);
  });

  it('a gain of B.cooler.notifyGain or more says "Context shared", once per cooler per B.cooler.notifyWeeks', () => {
    const { s, people: [lead, junior] } = office([100, 0]);
    placeCooler(s, lead);
    const toasts = (ctx) => ctx.events.filter((e) => e.type === 'toast' && e.topic === 'shared');
    const first = toasts(week(s));
    expect(first).toEqual([expect.objectContaining({ short: 'Context shared', tone: 'good', subjectId: junior.id })]);
    expect(first[0].text).toContain(junior.name);
    expect(first[0].text).toContain(lead.name);
    for (let i = 1; i < B.cooler.notifyWeeks; i++) { s.week++; expect(toasts(week(s))).toEqual([]); }
    s.week++;
    expect(toasts(week(s))).toHaveLength(1);
  });

  it('a tie for the largest gain goes to whoever comes first in state.staff', () => {
    const { s, people: [lead, a, b] } = office([100, 0, 0]);
    placeCooler(s, lead);
    const t = week(s).events.find((e) => e.topic === 'shared');
    expect(t.subjectId).toBe(s.staff.find((p) => p === a || p === b).id);
  });

  it('someone in reach of two coolers counts only in the crowd with the higher top', () => {
    const { s, people: [lead, junior] } = office([80, 50]);
    const c = placeCooler(s, lead);
    s.office.placed.push({ ...c, id: 'wc2', x: c.x, y: c.y + 1 });
    week(s);
    expect(junior.knowledge).toBeCloseTo(50 + B.cooler.share * 30);
    expect(lead.knowledge).toBe(80);
  });

  it('a save with a coffee corner loads it as a water cooler in the same spot', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const { s } = office();
    s.office.placed.push({ id: 'cc1', itemId: 'water_cooler', level: 1, x: 2, y: 3, rot: 2 });
    saveGame(s, storage);
    const key = [...store.keys()].find((k) => store.get(k).includes('"cc1"'));
    store.set(key, store.get(key).replace('"itemId":"water_cooler"', '"itemId":"coffee_corner"'));
    expect(store.get(key)).toContain('coffee_corner');
    const loaded = loadGame(storage).state;
    expect(loaded.office.placed.find((p) => p.id === 'cc1')).toMatchObject({ itemId: 'water_cooler', level: 1, x: 2, y: 3, rot: 2 });
    expect(JSON.stringify(loaded)).not.toContain('coffee_corner');
  });

  it('coffee_wanted comes up whenever there is no espresso machine, cooler or not', () => {
    const { s, people: [lead] } = office();
    s.week = 20;
    const h = () => helpers(s);
    expect(EVENTS.coffee_wanted.when(s, h())).toBe(true);
    placeCooler(s, lead);
    expect(EVENTS.coffee_wanted.when(s, h())).toBe(true);
    s.office.placed.push({ id: 'e1', itemId: 'espresso', level: 1, x: 0, y: 0, rot: 0 });
    expect(EVENTS.coffee_wanted.when(s, h())).toBe(false);
  });

  it('coffee_wanted_corner is the water-cooler crowd reviewing the coffee', () => {
    const { s, people: [lead] } = office();
    s.week = 20;
    expect(EVENTS.coffee_wanted_corner.when(s, helpers(s))).toBe(false);
    placeCooler(s, lead);
    expect(EVENTS.coffee_wanted_corner.when(s, helpers(s))).toBe(true);
    expect(EVENTS.coffee_wanted_corner.text).toMatch(/water cooler/i);
    expect(MOMENTS.coffee_wanted_corner).toBe('A one-star review of the office coffee is taped to the water cooler.');
  });
});
