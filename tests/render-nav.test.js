import { describe, it, expect } from 'vitest';
import { createNav } from '../src/render/layout.js';

const room = { W: 9, D: 7 };
const corner = { x0: -1.335, x1: 0.335, z0: 1.56, z1: 2.19 };

function minClearance(path, box) {
  let gap = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.01));
    for (let j = 0; j <= n; j++) {
      const x = a.x + (b.x - a.x) * j / n, z = a.z + (b.z - a.z) * j / n;
      gap = Math.min(gap, Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.z0 - z, 0, z - box.z1)));
    }
  }
  return gap;
}

describe('walking clearance', () => {
  it('keeps a body clear of a counter on the last segment to an off-centre goal', () => {
    const start = { x: 0.7, z: 0.8 }, goal = { x: 0.437, z: 2.809 };
    const path = createNav(room, [corner]).path(start, goal);
    expect(path[0]).toEqual(start);
    expect(path.at(-1)).toEqual(goal);
    expect(minClearance(path, corner)).toBeGreaterThanOrEqual(0.23);
  });

  it('keeps the same clearance when leaving the off-centre point', () => {
    const path = createNav(room, [corner]).path({ x: 0.437, z: 2.809 }, { x: 0.7, z: 0.8 });
    expect(minClearance(path, corner)).toBeGreaterThanOrEqual(0.23);
  });

  it('does not return a straight walk through an impassable wall', () => {
    const start = { x: -2, z: 0 }, goal = { x: 2, z: 0 };
    const nav = createNav(room, [{ x0: -0.2, x1: 0.2, z0: -3.5, z1: 3.5 }]);
    expect(nav.path(start, goal)).toEqual([start]);
    expect(nav.path(start, goal, 0.5)).toBeNull();
  });

  it('moves an unsafe exact goal even when its cell centre is clear', () => {
    const nav = createNav(room, [corner]);
    const goal = { x: 0.52, z: 2 };
    expect(nav.isBlocked(goal.x, goal.z)).toBe(true);
    const free = nav.freePoint(goal.x, goal.z);
    expect(nav.isBlocked(free.x, free.z)).toBe(false);
  });
});
