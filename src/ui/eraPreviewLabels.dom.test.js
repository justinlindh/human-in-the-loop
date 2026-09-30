// @vitest-environment happy-dom
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { reportsPanel } from './panels/reports.js';
import { createGameOver } from './gameover.js';
import { createGame } from '../sim/state.js';
import { ERA_STARTS } from '../data/era-modes.js';

const preview = vi.hoisted(() => ({ erasPreview: false }));
vi.mock('./eraPreview.js', () => preview);
vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); });

it.each([false, true])('shows saved-era labels only in preview: %s', (enabled) => {
  vi.useFakeTimers();
  preview.erasPreview = enabled;
  for (const startEra of Object.keys(ERA_STARTS).filter((id) => id !== 'classic')) {
    const state = createGame({ seed: 11, startEra });
    const reports = reportsPanel({ getState: () => state });
    expect(reports.el.textContent.includes('era score')).toBe(enabled);
    if (state.flags.dotcom) expect(reports.el.textContent.includes('Dot-com chapter')).toBe(enabled);
    reports.destroy();
    const layer = document.createElement('div');
    document.body.append(layer);
    state.gameOver = { won: false, reason: 'runway', score: 0, epilogue: [] };
    createGameOver({ layer, controls: {}, sfx: () => {} }).update(state);
    expect(layer.textContent.includes(`${ERA_STARTS[startEra].name} start`)).toBe(enabled);
  }
});
