import { describe, it, expect } from 'vitest';
import { tick, dispatch } from '../../src/sim/index.js';
import { saveGame, loadGame, hasSave, clearSave, SAVE_KEY } from '../../src/save/save.js';
import { game, advance } from './helpers.js';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

describe('save and load', () => {
  it('round trips a game exactly, and it keeps playing identically', () => {
    const store = fakeStorage();
    const s = advance(game(4), 40, tick, dispatch);
    expect(hasSave(store)).toBe(false);
    saveGame(s, store);
    expect(hasSave(store)).toBe(true);
    const res = loadGame(store);
    expect(res.ok).toBe(true);
    expect(res.state).toEqual(s);
    advance(s, 20, tick, dispatch);
    advance(res.state, 20, tick, dispatch);
    expect(JSON.stringify(res.state)).toBe(JSON.stringify(s));
  });

  it('reports a missing save', () => {
    expect(loadGame(fakeStorage())).toEqual({ ok: false, reason: 'No save found' });
  });

  it('reports corrupt JSON and missing keys', () => {
    const store = fakeStorage();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadGame(store)).toEqual({ ok: false, reason: 'Save is corrupted' });
    const s = game();
    delete s.products;
    store.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame(store)).toEqual({ ok: false, reason: 'Save is corrupted' });
    store.setItem(SAVE_KEY, 'null');
    expect(loadGame(store)).toEqual({ ok: false, reason: 'Save is corrupted' });
  });

  it('reports malformed shapes as corrupted instead of throwing', () => {
    const store = fakeStorage();
    const shapes = [
      (s) => { s.candidates = null; }, (s) => { s.projects = null; }, (s) => { s.projects = {}; }, (s) => { s.staff = [null]; },
      (s) => { s.products = [3]; }, (s) => { s.campaigns = 'x'; }, (s) => { s.incidentLog = {}; }, (s) => { s.office = null; }, (s) => { s.office.placed = 'x'; },
      (s) => { s.modifiers = {}; }, (s) => { s.scheduled = 5; }, (s) => { s.staff[0].assignment = null; }, (s) => { s.history = [1]; },
    ];
    for (const [i, mutate] of shapes.entries()) {
      const s = game();
      mutate(s);
      store.setItem(SAVE_KEY, JSON.stringify(s));
      let res;
      expect(() => { res = loadGame(store); }, `shape ${i}`).not.toThrow();
      expect(res, `shape ${i}`).toEqual({ ok: false, reason: 'Save is corrupted' });
    }
  });

  it('reports an incompatible version', () => {
    const store = fakeStorage();
    store.setItem(SAVE_KEY, JSON.stringify({ ...game(), version: 999 }));
    expect(loadGame(store)).toEqual({ ok: false, reason: 'Save is from an incompatible version' });
    store.setItem(SAVE_KEY, JSON.stringify({ ...game(), version: 1 }));
    expect(loadGame(store)).toEqual({ ok: false, reason: 'Save is from an incompatible version' });
  });

  it('fills missing staff defaults on load', () => {
    const store = fakeStorage();
    const s = game();
    delete s.staff[0].record;
    delete s.staff[0].path;
    store.setItem(SAVE_KEY, JSON.stringify(s));
    const res = loadGame(store);
    expect(res.ok).toBe(true);
    expect(res.state.staff[0].record).toEqual({ mentorWeeks: 0, catches: 0, hardProblemWeeks: 0 });
    expect(res.state.staff[0].path).toBe(null);
  });

  it('drops a pending decision whose event no longer exists and says so', () => {
    const store = fakeStorage();
    const s = game();
    s.pendingDecision = { eventId: 'gone_event', title: 't', text: 't', subjectId: null, choices: [] };
    store.setItem(SAVE_KEY, JSON.stringify(s));
    const res = loadGame(store);
    expect(res.ok).toBe(true);
    expect(res.state.pendingDecision).toBe(null);
    expect(res.notice).toMatch(/decision/i);
  });

  it('clearSave removes it, and a throwing storage never crashes', () => {
    const store = fakeStorage();
    saveGame(game(), store);
    clearSave(store);
    expect(hasSave(store)).toBe(false);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('nope'); } };
    expect(loadGame(broken)).toEqual({ ok: false, reason: 'No save found' });
    expect(hasSave(broken)).toBe(false);
    expect(saveGame(game(), broken)).toBe(false);
    expect(() => clearSave(broken)).not.toThrow();
  });
});

describe('per-id maps are backfilled on load', () => {
  it('a save missing a model, a category, or a goal gets default entries', async () => {
    const { createGame } = await import('../../src/sim/index.js');
    const { modelCostPerCustomer } = await import('../../src/sim/economy.js');
    const mem = {};
    const store = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
    const s = createGame({ seed: 3 });
    delete s.models.mistrale;
    delete s.market.categories.legal;
    delete s.goals.hq;
    store.setItem(SAVE_KEY, JSON.stringify(s));
    const res = loadGame(store);
    expect(res.ok).toBe(true);
    expect(res.state.models.mistrale).toMatchObject({ costMult: 1, available: false });
    expect(Number.isFinite(modelCostPerCustomer(res.state, 'mistrale'))).toBe(true);
    expect(res.state.market.categories.legal.clones).toBe(0);
    expect(res.state.goals.hq).toEqual({ done: false, week: null });
  });
});

describe('seat backfill', () => {
  it('a save without deskIds seats staff in their current order', async () => {
    const { createGame } = await import('../../src/sim/index.js');
    const { addDesks } = await import('./helpers.js');
    const mem = {};
    const store = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
    const s = addDesks(createGame({ seed: 3 }), 3);
    for (const p of s.staff) delete p.deskId;
    store.setItem(SAVE_KEY, JSON.stringify(s));
    const res = loadGame(store);
    expect(res.state.staff.map((p) => p.deskId)).toEqual(s.office.placed.slice(0, 2).map((d) => d.id));
  });
});

describe('save slots', () => {
  const memStore = () => { const mem = {}; return { mem, getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } }; };

  it('each company keeps its own slot with metadata for the title screen', async () => {
    const { createGame } = await import('../../src/sim/index.js');
    const { listSaves, deleteSave } = await import('../../src/save/save.js');
    const store = memStore();
    const a = createGame({ seed: 1, companyName: 'Alpha', logoColor: '#ff0000' });
    const b = createGame({ seed: 2, companyName: 'Beta' });
    expect(saveGame(a, store)).toBe(true);
    expect(saveGame(b, store)).toBe(true);
    expect(a.flags.saveSlot).not.toBe(b.flags.saveSlot);
    a.week = 60;
    expect(saveGame(a, store)).toBe(true);
    const list = listSaves(store);
    expect(list.map((m) => m.companyName).sort()).toEqual(['Alpha', 'Beta']);
    const meta = list.find((m) => m.companyName === 'Alpha');
    expect(meta).toMatchObject({ id: a.flags.saveSlot, logoColor: '#ff0000', week: 60, year: 2020, eraId: 'classic', over: false });
    expect(loadGame(store).state.companyName).toBe('Alpha');
    const res = loadGame(store, b.flags.saveSlot);
    expect(res).toMatchObject({ ok: true, id: b.flags.saveSlot });
    expect(res.state.companyName).toBe('Beta');
    deleteSave(store, a.flags.saveSlot);
    expect(listSaves(store).map((m) => m.companyName)).toEqual(['Beta']);
    expect(loadGame(store).state.companyName).toBe('Beta');
    expect(loadGame(store, 'nope')).toEqual({ ok: false, reason: 'No save found' });
  });

  it('when every slot is taken, a new company reuses the oldest', async () => {
    const { createGame } = await import('../../src/sim/index.js');
    const { listSaves, MAX_SLOTS } = await import('../../src/save/save.js');
    const store = memStore();
    const games = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const g = createGame({ seed: i + 1, companyName: `Co ${i}` });
      saveGame(g, store);
      games.push(g);
      const idx = JSON.parse(store.mem['hitl.saves.v2']);
      idx.slots[g.flags.saveSlot].savedAt = i;
      store.setItem('hitl.saves.v2', JSON.stringify(idx));
    }
    const extra = createGame({ seed: 99, companyName: 'Newcomer' });
    saveGame(extra, store);
    expect(extra.flags.saveSlot).toBe(games[0].flags.saveSlot);
    const names = listSaves(store).map((m) => m.companyName);
    expect(names).toHaveLength(MAX_SLOTS);
    expect(names).toContain('Newcomer');
    expect(names).not.toContain('Co 0');
  });

  it('a broken index or storage never crashes', async () => {
    const { listSaves } = await import('../../src/save/save.js');
    const store = memStore();
    store.setItem('hitl.saves.v2', '{nope');
    expect(listSaves(store)).toEqual([]);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(listSaves(broken)).toEqual([]);
    expect(saveGame({ flags: {}, week: 0 }, broken)).toBe(false);
  });
});

describe('voice backfill', () => {
  it('a save without voices gets the same voices a new person would', async () => {
    const { createGame } = await import('../../src/sim/index.js');
    const mem = {};
    const store = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
    const s = createGame({ seed: 4 });
    const voices = s.staff.map((p) => p.voice);
    for (const p of [...s.staff, ...s.candidates]) delete p.voice;
    store.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame(store).state.staff.map((p) => p.voice)).toEqual(voices);
  });
});
