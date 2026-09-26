import { describe, it, expect } from 'vitest';
import { pickSpot, spotDebug, spotReasons, spotRing } from './spots.js';

describe('spot selection diagnostics', () => {
  it('records the failed constraint and retains the explicit all-rejected fallback', () => {
    const debug = spotDebug({});
    const candidates = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
    const fallback = { x: 4, z: 5 };
    expect(pickSpot(candidates[0], { candidates, needs: ['clear', 'inView'], checks: {
      clear: (q) => q.x !== 0 || 'desk footprint', inView: () => false,
    }, debug, moment: 'visitor', fallback })).toBe(fallback);
    expect(debug.spots.visitor.spot.candidates.map((q) => q.reasons)).toEqual([['desk footprint'], ['inView']]);
    expect(debug.spots.visitor.spot.fallback).toBe(true);
    expect(spotReasons(JSON.parse(JSON.stringify(debug.spots)))[0]).toContain('desk footprint: 1, inView: 1');
  });
  it('preserves first fit, object identity, and lazy enumeration', () => {
    const accepted = { x: 1, z: 2, rect: { x0: 0 } };
    function* candidates() { yield { x: 0, z: 0 }; yield accepted; throw new Error('unvisited candidate'); }
    expect(pickSpot({}, { candidates: candidates(), needs: ['clear'], checks: { clear: (q) => q.x > 0 } })).toBe(accepted);
  });
  it('ranks only valid candidates, preserves ties, and reports eligible losers', () => {
    const debug = spotDebug({});
    const candidates = [5, 2, 2, 0].map((x) => ({ x, z: 0 }));
    expect(pickSpot({}, { candidates, needs: ['clear'], checks: { clear: (q) => q.x > 0 }, score: (q) => q.x, debug, moment: 'printer' })).toBe(candidates[1]);
    expect(debug.spots.printer.spot.selectedIndex).toBe(1);
    expect(debug.spots.printer.spot.candidates.map((q) => q.reasons)).toEqual([['lower-ranked candidate'], [], ['lower-ranked candidate'], ['clear']]);
  });
  it('keeps searches separate and replaces repeated searches without leaking between offices', () => {
    const a = {}, b = {}, debug = spotDebug(a);
    for (let x = 0; x < 10; x++) pickSpot({}, { candidates: [{ x, z: 0 }], debug, moment: 'letter', search: 'side' });
    pickSpot({}, { candidates: [], debug, moment: 'letter', search: 'behind' });
    expect(Object.keys(debug.spots.letter)).toEqual(['side', 'behind']);
    expect(debug.spots.letter.side.candidates).toHaveLength(1);
    expect(debug.spots.letter.side.selected.x).toBe(9);
    expect(debug.spots.letter.behind.selected).toBe(null);
    expect(spotDebug(a)).toBe(debug);
    expect(Object.keys(spotDebug(b).spots)).toHaveLength(0);
  });
  it('uses named constraints including both views, rejecting unknown requirements', () => {
    const opts = { candidates: [{ x: 0, z: 0 }], needs: ['bothViews'] };
    expect(() => pickSpot({}, opts)).toThrow('Unknown spot requirement: bothViews');
    expect(pickSpot({}, { ...opts, checks: { bothViews: () => false } })).toBe(null);
  });
  it('enumerates concentric rings in order and keeps the center first when requested', () => {
    const c = { x: 2, z: 3 };
    const ring = { centerFirst: true, radii: [0.25, 0.5], count: () => 4 };
    const points = [...spotRing(c, ring)];
    expect(points).toHaveLength(9);
    expect(points[0]).toBe(c);
    expect(points[1]).toEqual({ x: 2.25, z: 3 });
    expect(points[5]).toEqual({ x: 2.5, z: 3 });
    expect(pickSpot(c, { ring, needs: ['clear'], checks: { clear: (q) => q.x > 2.3 } })).toEqual(points[5]);
  });
  it('retains pair diagnostics and rejects non-finite scores without claiming success', () => {
    const debug = spotDebug({}), partner = { x: 2, z: 3 };
    expect(pickSpot({}, { candidates: [{ x: 0, z: 0, partner }], score: () => Infinity, debug, moment: 'visitor' })).toBe(null);
    expect(debug.spots.visitor.spot.candidates[0]).toMatchObject({ partner, reasons: ['no finite score'], score: null });
  });
  it('stops a scored search at its declared best possible score', () => {
    function* candidates() { yield { x: 3, z: 0 }; yield { x: 0, z: 0 }; throw new Error('needless geometry work'); }
    expect(pickSpot({}, { candidates: candidates(), score: (q) => q.x, minScore: 0 })).toEqual({ x: 0, z: 0 });
  });

});
