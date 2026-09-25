import { describe, it, expect } from 'vitest';
import { doingText } from './common.js';

const state = {
  products: [{ id: 'p1', name: 'Inboxer', version: 2 }],
  projects: [
    { id: 'j1', kind: 'new', name: 'Legalese' }, { id: 'j2', kind: 'update', productId: 'p1' },
    { id: 'j3', kind: 'migration', productId: 'p1' }, { id: 'j4', kind: 'refactor', name: 'The Big Refactor' },
    { id: 'j5', kind: 'research', name: 'Eval Harness' }, { id: 'j6', kind: 'craft', name: 'Craft project' }, { id: 'j7', kind: 'craft', name: 'Pixel Clock' },
  ],
  staff: [], flags: {},
};
const on = (id) => ({ id: 'x', assignment: { type: 'project', targetId: id } });

describe('doingText', () => {
  // Names as the sim gives them: refactor and craft projects arrive as 'The Big Refactor' and 'Craft project'.
  it('puts a verb on project work', () => {
    expect(doingText(state, on('j1'))).toBe('Building Legalese');
    expect(doingText(state, on('j2'))).toBe('Updating Inboxer to v3');
    expect(doingText(state, on('j3'))).toBe('Migrating Inboxer');
    expect(doingText(state, on('j4'))).toBe('Refactoring the code');
    expect(doingText(state, on('j5'))).toBe('Researching Eval Harness');
    expect(doingText(state, on('j6'))).toBe('Crafting a side project');
    expect(doingText(state, on('j7'))).toBe('Crafting Pixel Clock');
  });
});
