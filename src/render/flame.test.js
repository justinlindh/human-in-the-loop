import { describe, expect, it } from 'vitest';
import { createFlame } from './flame.js';

describe('createFlame', () => {
  it('builds tongues that stand on the floor and flicker', () => {
    const f = createFlame({ height: 1.2, tongues: 3, low: true });
    expect(f.children.length).toBe(3);
    expect(f.userData.light).toBeNull();
    const outer = f.children[0].children[1];
    f.userData.update(0);
    const a = outer.scale.y;
    f.userData.update(0.37);
    expect(outer.scale.y).not.toBe(a);
    expect(Math.abs(outer.scale.y / 1.2 - 1)).toBeLessThan(0.15);
    f.userData.dispose();
  });
});
