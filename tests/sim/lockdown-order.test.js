import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';

// Issue #1906: the lockdown card comes before the lockdown itself. Over bot games with the game's own
// pacing (the ask queue on), nobody is remote or on a call, and no lockdown exists, until the
// lockdown_start card has opened.
describe('issue #1906: the lockdown decision comes before its scene', () => {
  it('no call, remote worker or lockdown before the lockdown card opens', () => {
    let games = 0;
    for (const bot of ['balanced', 'sensible']) {
      for (let seed = 1; seed <= 6; seed++) {
        const r = { s: null, opened: false, early: [] };
        const look = () => {
          const s = r.s;
          if (s.pendingDecision?.eventId === 'lockdown_start') r.opened = true;
          if (r.opened) return;
          if (s.lockdown) r.early.push(`week ${s.week}: lockdown set`);
          if (s.staff.some((p) => p.call)) r.early.push(`week ${s.week}: a call`);
          if (s.staff.some((p) => p.remote) && s.workPolicy === null) r.early.push(`week ${s.week}: remote`);
        };
        runBot(bot, seed, null, {
          setup: (s) => { r.s = s; },
          onEvents: look,
          onWeek: look,
          stopWhen: (s) => r.opened || (s.flags.lockdownWeek !== undefined && s.week > s.flags.lockdownWeek + 30),
        });
        if (r.s.flags.lockdownWeek === undefined) continue;
        games++;
        expect(r.opened, `${bot} seed ${seed}: the card never opened`).toBe(true);
        expect(r.early, `${bot} seed ${seed}`).toEqual([]);
      }
    }
    expect(games).toBeGreaterThan(8);
  });
});
