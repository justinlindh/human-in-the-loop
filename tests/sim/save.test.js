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

  it('reports an incompatible version', () => {
    const store = fakeStorage();
    store.setItem(SAVE_KEY, JSON.stringify({ ...game(), version: 999 }));
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
