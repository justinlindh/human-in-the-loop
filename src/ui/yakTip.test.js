import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { YAK_LEVELS } from './settings.js';
import { B } from '../sim/balance.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
const real = B.pacing;
beforeEach(() => { B.pacing = {}; });
afterEach(() => { B.pacing = real; });

const tip = () => YAK_LEVELS.find((l) => l.v === 'all').tip;

it('the All tip says what lights the dock under quietYak, and keeps today\'s words otherwise', () => {
  expect(tip()).toBe('Yak: every message counts as new');
  B.pacing = { quietYak: false };
  expect(tip()).toBe('Yak: every message counts as new');
  B.pacing = { quietYak: true };
  expect(tip()).toMatch(/only incidents, wins and replies count as new/);
});
