import { describe, expect, it } from 'vitest';
import { panDir } from './camera.js';

describe('panDir', () => {
  it('pans with WASD the same way as the arrows', () => {
    expect(panDir(['w'])).toEqual(panDir(['arrowup']));
    expect(panDir(['a'])).toEqual(panDir(['arrowleft']));
    expect(panDir(['s'])).toEqual(panDir(['arrowdown']));
    expect(panDir(['d'])).toEqual(panDir(['arrowright']));
  });

  it('counts a letter and its arrow once, and opposite keys cancel', () => {
    expect(panDir(['w', 'arrowup'])).toEqual(panDir(['w']));
    expect(panDir(['a', 'arrowright'])).toEqual([0, 0]);
  });

  it('ignores Q, E and other keys', () => {
    expect(panDir(['q', 'e', 'x'])).toEqual([0, 0]);
  });
});
