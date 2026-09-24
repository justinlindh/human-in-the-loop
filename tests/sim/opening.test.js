import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick } from '../../src/sim/index.js';
import { EVENTS } from '../../src/data/events.js';

describe('first product beats', () => {
  it('the first build has a prototype, a user test decision, and a late aside, once each', () => {
    const s = createGame({ seed: 4 });
    const pid = dispatch(s, { type: 'startProject', kind: 'new', name: 'Jotter', category: 'notes', angle: 'freemium', size: 'small' }).projectId;
    for (const p of s.staff) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: pid } });
    const seen = [];
    while (!s.products.length && s.week < 40) {
      if (s.pendingDecision) {
        seen.push(`decision:${s.pendingDecision.eventId}`);
        dispatch(s, { type: 'resolveDecision', choice: 0 });
      }
      for (const e of tick(s)) {
        if (e.type === 'toast' && /Jotter/.test(e.text) && !/launched|Started/.test(e.text)) seen.push('beat');
        if (e.type === 'say') {
          expect(e).toMatchObject({ staffId: expect.any(String), text: expect.any(String), toId: null, replyTo: null });
          seen.push('say');
        }
      }
    }
    expect(s.products.length).toBe(1);
    expect(seen.filter((x) => x === 'beat')).toHaveLength(2);
    expect(seen.filter((x) => x === 'say')).toHaveLength(2);
    expect(seen).toContain('decision:first_user_test');
    expect(EVENTS.first_user_test.random).toBe(false);
    // A second product gets no beats.
    dispatch(s, { type: 'startProject', kind: 'new', name: 'Jotter 2', category: 'email', angle: 'web', size: 'small' });
    s.cash = 1e6;
    let beats = 0;
    for (let w = 0; w < 30; w++) {
      for (let c = 0; c < 4 && s.pendingDecision; c++) dispatch(s, { type: 'resolveDecision', choice: c });
      for (const e of tick(s)) if (e.type === 'say' || e.type === 'decision' && s.pendingDecision?.eventId === 'first_user_test') beats++;
    }
    expect(beats).toBe(0);
  });
});
