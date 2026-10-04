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

it.each([['preinternet', 'The Long Career, complete'], ['dotcom', 'A career worth keeping']])('titles the %s anniversary screen', (startEra, title) => {
  vi.useFakeTimers();
  preview.erasPreview = true;
  const state = createGame({ seed: 11, startEra });
  const layer = document.createElement('div');
  document.body.append(layer);
  state.gameOver = { won: true, reason: 'anniversary', score: 1, epilogue: [] };
  createGameOver({ layer, controls: {}, sfx: () => {} }).update(state);
  expect(layer.querySelector('h1').textContent).toBe(title);
});

// Building a takeover company plays its predecessor, so both preview settings share one.
let takeoverState = null;
it.each([false, true])('gates takeover score labels behind the preview: %s', (enabled) => {
  vi.useFakeTimers();
  preview.erasPreview = enabled;
  const state = takeoverState ??= createGame({ seed: 1, startEra: 'agents', startMode: 'takeover' });
  const reports = reportsPanel({ getState: () => state });
  expect(reports.el.textContent.includes(`Agents takeover at company week ${state.founding.takeoverWeek}`)).toBe(enabled);
  expect(reports.el.textContent.includes(`score x${state.founding.eraScoreMult}`)).toBe(enabled);
  reports.destroy();
  const layer = document.createElement('div');
  document.body.append(layer);
  state.gameOver = { won: false, reason: 'runway', score: 0, epilogue: [] };
  createGameOver({ layer, controls: {}, sfx: () => {} }).update(state);
  expect(layer.textContent.includes('Agents takeover')).toBe(enabled);
});
