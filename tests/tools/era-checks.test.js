import { describe, it, expect } from 'vitest';
import { exteriorOverlaps } from '../../blender/checks/intersect.js';

const rect = (x0, x1, z0, z1, extra = {}) => ({ x0, x1, z0, z1, ...extra });
const scene = (exterior) => ({ exterior: () => exterior });

describe('exteriorOverlaps', () => {
  it('finds nothing in a renderer without the hook or before the scenery is built', () => {
    expect(exteriorOverlaps({})).toEqual([]);
    expect(exteriorOverlaps(scene(null))).toEqual([]);
  });

  it('is clean for scenery that only touches or keeps apart', () => {
    const e = { feet: [{ id: 'a', ...rect(0, 2, 0, 2) }, { id: 'b', ...rect(2, 4, 0, 2) }, { id: 'c', ...rect(10, 12, 10, 12) }], lanes: [rect(-5, 20, 5, 6, { bike: false })], cars: [] };
    expect(exteriorOverlaps(scene(e))).toEqual([]);
  });

  it('reports two standing things that overlap, by the shorter side', () => {
    const e = { feet: [{ id: 'house', ...rect(0, 3, 0, 3) }, { id: 'datacentre', ...rect(2, 6, 1, 4) }], lanes: [], cars: [] };
    expect(exteriorOverlaps(scene(e))).toEqual([{ kind: 'standing', a: 'house', b: 'datacentre', depth: 1 }]);
  });

  it('reports a standing thing across a lane, and two vehicles on top of each other', () => {
    const e = {
      feet: [{ id: 'billboard', ...rect(0, 2, 4, 7) }],
      lanes: [rect(-5, 20, 5, 6, { bike: true })],
      cars: [rect(0, 4, 0, 2, { bike: false }), rect(3, 6, 1, 3, { bike: true })],
    };
    expect(exteriorOverlaps(scene(e))).toEqual([
      { kind: 'lane', a: 'billboard', b: 'bike lane 0', depth: 1 },
      { kind: 'vehicles', a: 'car', b: 'bike', depth: 1 },
    ]);
  });

  it('ignores an overlap under the tolerance', () => {
    const e = { feet: [{ id: 'a', ...rect(0, 2, 0, 2) }, { id: 'b', ...rect(1.99, 4, 0, 2) }], lanes: [], cars: [] };
    expect(exteriorOverlaps(scene(e))).toEqual([]);
    expect(exteriorOverlaps(scene(e), { tol: 0.005 })).toHaveLength(1);
  });
});
