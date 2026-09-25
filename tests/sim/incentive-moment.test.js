import { describe, it, expect } from 'vitest';
import { tick } from '../../src/sim/index.js';
import { stageIncentive } from '../../src/sim/incentives.js';
import { game, addStaff, addDesks } from './helpers.js';

describe('issue #627: the incentive ceremony lines belong to its moment', () => {
  it('every spoken line in a staged waffle party carries moment: waffle_party', () => {
    const s = game(1);
    addDesks(s, 6);
    for (let i = 0; i < 5; i++) addStaff(s, 'engineer', 'mid');
    for (const p of s.staff) { p.mood = 'ok'; p.remote = false; }
    s.pendingDecision = null;
    const winner = stageIncentive(s, 'waffle_party');
    expect(winner).toBeTruthy();
    let lines = [];
    for (let i = 0; i < 4 && !lines.length; i++) {
      const ev = tick(s);
      s.pendingDecision = null;
      const party = ev.find((e) => e.type === 'incentive');
      if (party) lines = ev.filter((e) => e.type === 'say' && e.moment === party.reward);
    }
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(l.moment).toBe('waffle_party');
  });
});
