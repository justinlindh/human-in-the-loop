import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { radioSystem, tasteFor } from '../../src/sim/radio.js';
import { itemBonus } from '../../src/sim/bonus.js';
import { suggestPlacement, purchaseProblem } from '../../src/sim/office.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { B } from '../../src/sim/balance.js';
import { createGame } from '../../src/sim/state.js';
import { ITEMS, boomboxItem } from '../../src/data/items.js';
import { STATIONS, STATION_IDS } from '../../src/data/stations.js';
import { game, addStaff, addDesks, expectFail } from './helpers.js';

function office(seed = 1) {
  const s = game(seed);
  s.week = 30;
  s.cash = 100000;
  addDesks(s, 6);
  for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
  for (const p of s.staff) { p.mood = 'ok'; p.taste = tasteFor(s, p.id); }
  return s;
}
function place(s) {
  const spot = suggestPlacement(s, 'boombox');
  const res = dispatch(s, { type: 'placeItem', itemId: 'boombox', ...spot });
  expect(res.ok).toBe(true);
  return res.id;
}
const weekOf = (s) => { const ctx = makeCtx(s); radioSystem(ctx); return ctx.events; };

let enabled;
beforeEach(() => { enabled = B.boombox.enabled; B.boombox.enabled = true; });
afterEach(() => { B.boombox.enabled = enabled; });

describe('issue #139: the boombox', () => {
  it('stays out of the shop and the game while the flag is off', () => {
    B.boombox.enabled = false;
    const s = office();
    expect(s.radio).toEqual({ on: false, station: null });
    expect(weekOf(s)).toEqual([]);
    expectFail(expect, dispatch, s, { type: 'setRadio', on: true }, 'No boombox');
    expect(ITEMS.boombox.onlyEras).toEqual([]);
    expect(purchaseProblem(s, 'boombox')).toBe('Not available');
    expect(dispatch(s, { type: 'placeItem', itemId: 'boombox', ...suggestPlacement(s, 'plant') }).ok).toBe(false);
  });

  it.each(['garage', 'takeover'])('a new %s game gives every founder and starting hire a taste, so a save at week 0 round-trips', (startMode) => {
    const s = createGame({ seed: 9, startMode, startEra: 'chatgbt' });
    expect(s.staff.length).toBeGreaterThan(0);
    for (const p of s.staff) expect(p.taste).toBe(tasteFor(s, p.id));
  });

  it('a save with a placed boombox still loads and plays when the flag is off again', () => {
    const s = office();
    place(s);
    B.boombox.enabled = false;
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    saveGame(s, storage);
    const back = loadGame(storage).state;
    expect(() => { for (let i = 0; i < 4; i++) tick(back); }).not.toThrow();
    expect(() => itemBonus(back, 'meaningRecovery')).not.toThrow();
  });

  it('data: six stations with names and lines, and a unique 1x1 item that helps nearby desks recover', () => {
    expect(STATION_IDS).toEqual(['lofi', 'synth88', 'polka', 'bossa', 'elevator', 'funk']);
    for (const st of STATIONS) { expect(st.name).toBeTruthy(); expect(st.like.length).toBeGreaterThan(1); expect(st.dislike.length).toBeGreaterThan(1); }
    const it = boomboxItem();
    expect(it).toMatchObject({ kind: 'furniture', unique: true, footprint: { w: 1, h: 1 }, adjacency: { radius: B.boombox.radius, key: 'meaningRecovery', value: B.boombox.meaning } });
  });

  it('placing turns the radio on at lo-fi; selling switches it off and keeps the station for next time', () => {
    const s = office();
    const id = place(s);
    expect(s.radio).toEqual({ on: true, station: 'lofi' });
    expect(dispatch(s, { type: 'setRadio', station: 'polka' }).ok).toBe(true);
    dispatch(s, { type: 'sellItem', id });
    expect(s.radio).toEqual({ on: false, station: 'polka' });
    place(s);
    expect(s.radio).toEqual({ on: true, station: 'polka' });
  });

  it('setRadio switches stations and on/off, and refuses unknown stations', () => {
    const s = office();
    place(s);
    expectFail(expect, dispatch, s, { type: 'setRadio', station: 'dubstep' }, 'Unknown station');
    expectFail(expect, dispatch, s, { type: 'setRadio' }, 'Nothing to change');
    const same = dispatch(s, { type: 'setRadio', on: true, station: 'lofi' });
    expect(same.ok).toBe(true);
    expect(same.events.filter((e) => e.type === 'radio')).toEqual([]);
    expect(dispatch(s, { type: 'setRadio', on: false }).ok).toBe(true);
    expect(s.radio).toEqual({ on: false, station: 'lofi' });
    expect(dispatch(s, { type: 'setRadio', station: 'bossa' }).ok).toBe(true);
    expect(s.radio).toEqual({ on: false, station: 'bossa' });
    const id = s.office.placed.find((p) => p.itemId === 'boombox').id;
    const spot = suggestPlacement(s, 'plant');
    expect(dispatch(s, { type: 'moveItem', id, x: spot.x, y: spot.y, rot: 0 }).ok).toBe(true);
    expect(s.radio).toEqual({ on: false, station: 'bossa' });
    expect(dispatch(s, { type: 'setRadio', on: true, station: 'funk' }).ok).toBe(true);
    expect(s.radio).toEqual({ on: true, station: 'funk' });
  });

  it('pays its recovery bonus only while it plays, the same on every station', () => {
    const s = office();
    const before = itemBonus(s, 'meaningRecovery');
    place(s);
    const on = itemBonus(s, 'meaningRecovery');
    expect(on).toBeGreaterThan(before);
    dispatch(s, { type: 'setRadio', station: 'polka' });
    expect(itemBonus(s, 'meaningRecovery')).toBe(on);
    dispatch(s, { type: 'setRadio', on: false });
    expect(itemBonus(s, 'meaningRecovery')).toBe(before);
  });

  it('taste is fixed by seed and id, from a known station, and draws nothing from the main stream', () => {
    const s = office();
    const rng = { ...s.rng };
    const p = s.staff[2];
    expect(tasteFor(s, p.id)).toBe(tasteFor(s, p.id));
    expect(STATION_IDS).toContain(tasteFor(s, p.id));
    expect(s.rng).toEqual(rng);
    const tastes = new Set(Array.from({ length: 40 }, (_, i) => tasteFor(s, `s${i}`)));
    expect(tastes.size).toBeGreaterThan(3);
  });

  it('remarks come at most once per gap, verdict matches taste, cost nothing, and never touch the main stream', () => {
    const s = office();
    place(s);
    const rng = { ...s.rng };
    const meaning = s.staff.map((p) => p.meaning);
    const tastes = [];
    for (let i = 0; i < 120; i++) {
      for (const e of weekOf(s)) if (e.type === 'radioTaste') tastes.push({ ...e, week: s.week });
      s.week++;
    }
    expect(tastes.length).toBeGreaterThan(3);
    for (const e of tastes) {
      const who = s.staff.find((p) => p.id === e.staffId);
      expect(e.verdict).toBe(who.taste === e.station ? 'like' : 'dislike');
    }
    for (let i = 1; i < tastes.length; i++) expect(tastes[i].week - tastes[i - 1].week).toBeGreaterThanOrEqual(B.boombox.tasteGapWeeks);
    expect(s.staff.map((p) => p.meaning)).toEqual(meaning);
    expect(s.rng).toEqual(rng);
  });

  it('someone sometimes changes the station to theirs', () => {
    const s = office();
    place(s);
    const keep = B.boombox.swapChance;
    B.boombox.swapChance = 1;
    let ev;
    try { ev = weekOf(s); } finally { B.boombox.swapChance = keep; }
    const swap = ev.find((e) => e.type === 'radio');
    const who = s.staff.find((p) => p.id === swap.by);
    expect(swap.on).toBe(true);
    expect(s.radio.on).toBe(true);
    expect(who.founder).toBe(false);
    expect(swap.station).toBe(who.taste);
    expect(s.radio.station).toBe(who.taste);
  });

  it('saves and loads the radio; an old save loads with it off and derives tastes', () => {
    const s = office();
    place(s);
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    saveGame(s, storage);
    expect(loadGame(storage).state.radio).toEqual(s.radio);
    delete s.radio;
    for (const p of s.staff) delete p.taste;
    saveGame(s, storage);
    const old = loadGame(storage).state;
    expect(old.radio).toEqual({ on: false, station: null });
    for (const p of old.staff) expect(p.taste).toBe(tasteFor(old, p.id));
  });
});
