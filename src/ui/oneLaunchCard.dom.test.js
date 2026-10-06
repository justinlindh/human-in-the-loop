// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPopups, launchToastCarded } from './popups.js';
import { pReset } from './pclock.js';
import { B } from '../sim/balance.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

const product = (id, name) => ({ id, name, version: 1, score: 7, reviews: [{ outlet: 'techpress', score: 7, quote: 'Fine.' }], killed: false });
const state = () => ({ week: 3, gameOver: false, pendingDecision: null, products: [product(1, 'Alpha'), product(2, 'Beta')], projects: [], campaigns: [], staff: [] });

let speed;
const setup = () => {
  const layer = document.createElement('div');
  document.body.append(layer);
  const ctx = { controls: { getSpeed: () => speed, setSpeed: (n) => { speed = n; } }, sfx: vi.fn(), act: vi.fn(() => ({ ok: true })), getState: state };
  const toasts = { setDock: vi.fn() };
  const p = createPopups({ layer, ctx, toasts, restoreDock: vi.fn() });
  return { layer, p };
};
const heading = (layer) => layer.querySelector('.modal h2')?.textContent;

beforeEach(() => { pReset(); speed = 2; });
afterEach(() => { delete B.pacing; document.body.replaceChildren(); });

describe('oneLaunchCard', () => {
  it('drops the sim launch toast only when on and a card covers that product', () => {
    const text = 'Alpha launched! Reviews average 7.';
    B.pacing = { oneLaunchCard: true };
    expect(launchToastCarded(['Alpha'], text)).toBe(true);
    expect(launchToastCarded(['Beta'], text)).toBe(false);
    expect(launchToastCarded([], text)).toBe(false);
    B.pacing = { oneLaunchCard: false };
    expect(launchToastCarded(['Alpha'], text)).toBe(false);
    delete B.pacing;
    expect(launchToastCarded(['Alpha'], text)).toBe(false);
  });

  it('on: a launch that lands while a card is open joins it, and the game resumes at the old speed', () => {
    B.pacing = { oneLaunchCard: true };
    const { layer, p } = setup();
    const s = state();
    p.queueLaunch(1);
    p.update(s);
    expect(heading(layer)).toBe('Alpha launched!');
    p.queueLaunch(2);
    p.update(s);
    expect(heading(layer)).toBe('2 launches');
    expect(layer.querySelectorAll('.lbrow')).toHaveLength(2);
    layer.querySelector('.btn.go').click();
    expect(speed).toBe(2);
  });

  it('off: the open card stays alone and the next launch waits for its own card', () => {
    B.pacing = { oneLaunchCard: false };
    const { layer, p } = setup();
    const s = state();
    p.queueLaunch(1);
    p.update(s);
    p.queueLaunch(2);
    p.update(s);
    expect(heading(layer)).toBe('Alpha launched!');
    layer.querySelector('.btn.go').click();
    p.update(s);
    expect(heading(layer)).toBe('Beta launched!');
  });
});
