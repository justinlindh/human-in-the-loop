import { describe, it, expect } from 'vitest';
import { createGame, dispatch } from '../../src/sim/index.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { placementCheck, findSpot } from '../../src/sim/office.js';
import { B } from '../../src/sim/balance.js';
import { GOALS } from '../../src/data/goals.js';

const desks = (s) => s.office.placed.filter((p) => p.itemId === 'desk');

describe('founders start at their own desks (#975)', () => {
  it('a new game has one free desk per founder in the garage, each founder seated', () => {
    for (const funding of ['bootstrapped', 'family', 'preseed']) {
      const s = createGame({ seed: 3, companyName: 'Desks', funding });
      expect(desks(s).length).toBe(2);
      expect(s.cash).toBe(B.funding[s.founding.funding].cash);
      const ids = new Set(desks(s).map((d) => d.id));
      for (const f of s.staff) expect(ids.has(f.deskId)).toBe(true);
      expect(new Set(s.staff.map((f) => f.deskId)).size).toBe(2);
      for (const d of desks(s)) {
        const others = s.office.placed.filter((p) => p.id !== d.id);
        expect(placementCheck({ ...s, office: { ...s.office, placed: others } }, { itemId: 'desk', x: d.x, y: d.y, rot: d.rot }).ok).toBe(true);
      }
    }
  });

  it('the first hire needs just one more desk', () => {
    const s = createGame({ seed: 5, companyName: 'Hire' });
    s.cash = 1e6;
    const c = s.candidates[0];
    expect(dispatch(s, { type: 'hire', candidateId: c.id }).reason).toBe('No free desk');
    const spot = findSpot(0, s.office.placed, 'desk');
    expect(dispatch(s, { type: 'placeItem', itemId: 'desk', ...spot }).ok).toBe(true);
    expect(dispatch(s, { type: 'hire', candidateId: c.id }).ok).toBe(true);
  });

  it('the first goal asks for the desk the first hire needs', () => {
    const g = GOALS.find((x) => x.id === 'place_desks');
    const s = createGame({ seed: 1, companyName: 'Goal' });
    expect(g.done(s, { desks: desks(s).length })).toBe(false);
    expect(g.done(s, { desks: desks(s).length + 1 })).toBe(true);
  });

  it('an old save with no desks loads without any', () => {
    const m = new Map();
    const store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    const s = createGame({ seed: 2, companyName: 'Old' });
    s.office.placed = [];
    for (const f of s.staff) f.deskId = null;
    saveGame(s, store);
    const res = loadGame(store, s.flags.saveSlot);
    expect(res.ok).toBe(true);
    expect(desks(res.state).length).toBe(0);
  });
});
