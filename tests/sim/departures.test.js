import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision } from '../../src/sim/events.js';
import { EVENTS } from '../../src/data/events.js';
import { game, addStaff } from './helpers.js';

describe('resign events say why someone left', () => {
  it('fired, poached, and burnout each carry their reason', () => {
    const s = game(3);
    const a = addStaff(s, 'engineer', 'mid');
    const fired = dispatch(s, { type: 'fire', staffId: a.id }).events.find((e) => e.type === 'resign');
    expect(fired).toMatchObject({ staffId: a.id, fired: true, reason: 'fired' });

    const b = addStaff(s, 'engineer', 'senior');
    raiseDecision(makeCtx(s), 'poached_by_bigco', b.id);
    const i = EVENTS.poached_by_bigco.choices.findIndex((c) => c.label === 'Wish them well');
    const poached = dispatch(s, { type: 'resolveDecision', choice: i }).events.find((e) => e.type === 'resign');
    expect(poached).toMatchObject({ staffId: b.id, fired: false, reason: 'poached' });

    const c = addStaff(s, 'engineer', 'mid');
    delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek;
    raiseDecision(makeCtx(s), 'resignation_letter', c.id);
    const j = EVENTS.resignation_letter.choices.findIndex((x) => x.effects.resign);
    const quit = dispatch(s, { type: 'resolveDecision', choice: j }).events.find((e) => e.type === 'resign');
    expect(quit).toMatchObject({ staffId: c.id, fired: false, reason: 'burnout' });
  });
});
