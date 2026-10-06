// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPopups, launchToastCarded, LAUNCH_GAP_MS } from './popups.js';
import { shippedDetail } from './ambient.js';
import { pReset, pTick } from './pclock.js';
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

  it('on: paused time does not count toward the gap', () => {
    B.pacing = { oneLaunchCard: true };
    const { layer, p } = setup();
    const s = state();
    p.queueLaunch(1);
    p.update(s);
    layer.querySelector('.btn.go').click();
    p.queueLaunch(2);
    speed = 0;
    pTick(200000);
    p.update(s);
    expect(heading(layer)).toBeUndefined();
    speed = 2;
    pTick(LAUNCH_GAP_MS - 1000);
    p.update(s);
    expect(heading(layer)).toBeUndefined();
    pTick(1500);
    p.update(s);
    expect(heading(layer)).toBe('Beta launched!');
  });

  it('on: a launch inside 90 s of the last card closing waits and shows after the gap', () => {
    B.pacing = { oneLaunchCard: true };
    const { layer, p } = setup();
    const s = state();
    p.queueLaunch(1);
    p.update(s);
    layer.querySelector('.btn.go').click();
    p.queueLaunch(2);
    pTick(LAUNCH_GAP_MS - 1000);
    p.update(s);
    expect(heading(layer)).toBeUndefined();
    pTick(1500);
    p.update(s);
    expect(heading(layer)).toBe('Beta launched!');
  });

  it('on with the attention clock: the gap is the clock\'s play seconds, not the UI\'s own total', () => {
    B.pacing = { oneLaunchCard: true };
    const clock = { playSeconds: 500, config: { gap: 90 } };
    const layer = document.createElement('div');
    document.body.append(layer);
    const ctx = { controls: { getSpeed: () => speed, setSpeed: (n) => { speed = n; }, attention: clock }, sfx: vi.fn(), act: vi.fn(() => ({ ok: true })), getState: state };
    const p = createPopups({ layer, ctx, toasts: { setDock: vi.fn() }, restoreDock: vi.fn() });
    const s = state();
    p.queueLaunch(1);
    p.update(s);
    layer.querySelector('.btn.go').click();
    p.queueLaunch(2);
    // Plenty of UI-clock time passes, but the attention clock has only run 89 s.
    pTick(LAUNCH_GAP_MS * 3);
    clock.playSeconds = 589;
    p.update(s);
    expect(heading(layer)).toBeUndefined();
    clock.playSeconds = 590;
    p.update(s);
    expect(heading(layer)).toBe('Beta launched!');
  });

  it('on with the attention clock: a restarted clock forgets the last close', () => {
    B.pacing = { oneLaunchCard: true };
    const clock = { playSeconds: 900, config: { gap: 90 } };
    const layer = document.createElement('div');
    document.body.append(layer);
    const ctx = { controls: { getSpeed: () => speed, setSpeed: (n) => { speed = n; }, attention: clock }, sfx: vi.fn(), act: vi.fn(() => ({ ok: true })), getState: state };
    const p = createPopups({ layer, ctx, toasts: { setDock: vi.fn() }, restoreDock: vi.fn() });
    const s = state();
    p.queueLaunch(1);
    p.update(s);
    layer.querySelector('.btn.go').click();
    clock.playSeconds = 5;
    p.queueLaunch(2);
    p.update(s);
    expect(heading(layer)).toBe('Beta launched!');
  });

  it('describes an update as a shipped bubble, warn when the score fell', () => {
    const p = { id: 7, name: 'Alpha', version: 3, score: 8.44 };
    expect(shippedDetail(p, 7)).toMatchObject({ topic: 'shipped', subjectId: 7, subjectKind: 'product', text: 'v3: 8.4', tone: 'good' });
    expect(shippedDetail(p, 9).tone).toBe('warn');
    expect(shippedDetail(p, 8.9).tone).toBe('good');
    expect(shippedDetail(p, undefined).tone).toBe('good');
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
