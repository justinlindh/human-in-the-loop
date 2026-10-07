// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createGame } from '../sim/state.js';
import { createBuildMode } from './buildmode.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

function setup(hint) {
  const state = createGame({ seed: 11 });
  state.cash = 500000;
  const placed = { id: 'p1', itemId: 'plant', x: 3, y: 3, rot: 0, level: 1 };
  state.office.placed.push(placed);
  let body = null;
  const ctx = { getState: () => state, act: vi.fn(() => ({ ok: true })), close: vi.fn(), toast: vi.fn(), sfx: vi.fn(), openModal: vi.fn((o) => { body = o.body; return () => {}; }), open: vi.fn() };
  const playHint = vi.fn(() => hint);
  const renderer = { playHint, buildTarget: { x: 5, y: 5 }, pickTile: () => ({ x: 5, y: 5 }) };
  const layer = document.createElement('div');
  const scene = document.createElement('canvas');
  scene.id = 'scene';
  document.body.append(layer, scene);
  const bm = createBuildMode({ layer, ctx, controls: { renderer } });
  return { bm, placed, playHint, scene, layer, body: () => body };
}

it('the item card says why a placed table gets no games, and says nothing otherwise', () => {
  const a = setup({ code: 'sides', self: true, ids: ['x'] });
  a.bm.openItemCard('p1');
  expect(a.playHint).toHaveBeenCalledWith({ placedId: 'p1' });
  expect(a.body().textContent).toContain('Needs room on both long sides');
  const b = setup(null);
  b.bm.openItemCard('p1');
  expect(b.body().textContent).not.toContain('long sides');
});

it('the build bar warns, without refusing, when the item would block a table or is blocked itself', () => {
  vi.stubGlobal('requestAnimationFrame', (f) => { f(); return 1; });
  for (const [hint, words] of [[{ code: 'sides', self: false, ids: ['t'] }, 'Blocks a foosball table'], [{ code: 'sides', self: true, ids: [] }, 'Needs room on both long sides']]) {
    document.body.replaceChildren();
    const t = setup(hint);
    t.bm.enter('plant');
    t.scene.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }));
    const status = t.layer.querySelector('.bstatus');
    expect(status.textContent).toBe(words);
    expect(status.classList.contains('warn')).toBe(true);
    expect(status.classList.contains('bad')).toBe(false);
  }
});
