// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { yakLevels, yakLevel, normalizeYak } from './settings.js';
import { B } from '../sim/balance.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
const real = B.pacing;
beforeEach(() => { B.pacing = {}; localStorage.clear(); });
afterEach(() => { B.pacing = real; localStorage.clear(); });

const labels = () => yakLevels().map((l) => l.label);

it('keeps today\'s three levels with the switch off', () => {
  expect(labels()).toEqual(['All', 'Important', 'Off']);
  expect(normalizeYak('all')).toBe('all');
  expect(normalizeYak('important')).toBe('important');
  expect(normalizeYak('bogus')).toBe('all');
});

it('quietYak shows On and Off, and a stored All or Important reads as On', () => {
  B.pacing = { quietYak: true };
  expect(labels()).toEqual(['On', 'Off']);
  expect(yakLevels()[0].tip).toMatch(/chatter shows but never counts/);
  expect(normalizeYak('all')).toBe('important');
  expect(normalizeYak('important')).toBe('important');
  expect(normalizeYak('off')).toBe('off');
  localStorage.setItem('hitl.settings', JSON.stringify({ yakLevel: 'all' }));
  expect(yakLevel()).toBe('important');
});
