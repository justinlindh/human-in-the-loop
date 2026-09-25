import { describe, it, expect } from 'vitest';
import { chatSystem } from '../../src/sim/chat.js';
import { makeCtx } from '../../src/sim/registry.js';
import { game, addStaff, addProduct, addDesks } from './helpers.js';

function company(seed, rival) {
  const s = game(seed);
  s.cash = 1e7;
  s.week = 330;
  s.officeStage = 1;
  s.office.stage = 1;
  addDesks(s, 8);
  for (const role of ['engineer', 'designer', 'marketer', 'support', 'sales', 'engineer']) addStaff(s, role, 'mid', { meaning: 75 });
  addProduct(s, { name: 'Inboxer' });
  s.rival = rival;
  return s;
}

describe('issue #163: the team ribs the rival', () => {
  it('jabs name the rival while it is around, and stop once it is gone', () => {
    const rival = { name: 'Syncopate', founderName: 'Pat Vance', logoColor: '#fff', categoryId: 'email', strength: 40, status: 'rising' };
    const lines = [];
    for (const seed of [1, 2, 3]) {
      const s = company(seed, { ...rival });
      for (let w = 0; w < 200; w++) {
        const c = makeCtx(s);
        chatSystem(c);
        for (const e of c.events) if ((e.type === 'chat' || e.type === 'say') && e.text.includes('Syncopate')) lines.push(e.text);
        s.week++;
      }
    }
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(l).not.toMatch(/[{}]/);
    const gone = company(4, { ...rival, status: 'dead' });
    let after = 0;
    for (let w = 0; w < 200; w++) {
      const c = makeCtx(gone);
      chatSystem(c);
      after += c.events.filter((e) => /Days since|countdown timer|drone shots/.test(e.text ?? '')).length;
      gone.week++;
    }
    expect(after).toBe(0);
  });
});
