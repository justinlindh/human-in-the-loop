import { describe, expect, it } from 'vitest';
import { createNav } from './layout.js';

// A closed ring of furniture with an empty pocket inside it, like a sitter boxed in by desks.
const L = { W: 10, D: 10 };
const ring = [
  { x0: -1.4, x1: 1.4, z0: -1.4, z1: -0.6 },
  { x0: -1.4, x1: 1.4, z0: 0.6, z1: 1.4 },
  { x0: -1.4, x1: -0.6, z0: -0.6, z1: 0.6 },
  { x0: 0.6, x1: 1.4, z0: -0.6, z1: 0.6 },
];

// Whether any sampled point strictly inside a leg lies in a blocked cell.
function crosses(nav, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
  for (let i = 1; i < n; i++) if (nav.isBlocked(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return true;
  return false;
}

describe('nav.path', () => {
  it('leaves furniture by the region that reaches the goal instead of a straight line through it', () => {
    const nav = createNav(L, ring);
    // Inside the ring's right wall, nearer the pocket than the open floor.
    const from = { x: 0.75, z: 0 }, to = { x: 4, z: 4 };
    const pts = nav.path(from, to);
    expect(pts.length).toBeGreaterThan(2);
    // Past the first step out of the wall, no leg crosses furniture.
    for (let i = 2; i < pts.length; i++) expect(crosses(nav, pts[i - 1], pts[i])).toBe(false);
    expect(pts.at(-1)).toEqual(to);
  });

  it('stops at the nearest reachable point when the goal is sealed inside furniture', () => {
    const nav = createNav(L, ring);
    const pts = nav.path({ x: 4, z: 4 }, { x: 0, z: 0 });
    for (let i = 1; i < pts.length; i++) expect(crosses(nav, pts[i - 1], pts[i])).toBe(false);
    const end = pts.at(-1);
    expect(nav.isBlocked(end.x, end.z)).toBe(false);
    expect(Math.hypot(end.x, end.z)).toBeGreaterThan(1.4);
  });

  it('still walks the plain way when nothing is in between', () => {
    const nav = createNav(L, []);
    const pts = nav.path({ x: -3, z: 0 }, { x: 3, z: 0 });
    expect(pts[0]).toEqual({ x: -3, z: 0 });
    expect(pts.at(-1)).toEqual({ x: 3, z: 0 });
  });
});
