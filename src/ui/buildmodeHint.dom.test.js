// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createGame } from '../sim/state.js';
import { createBuildMode } from './buildmode.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterEach(() => { document.body.replaceChildren(); });

function card(hint) {
  const state = createGame({ seed: 11 });
  const placed = { id: 'p1', itemId: 'plant', x: 3, y: 3, rot: 0, level: 1 };
  state.office.placed.push(placed);
  let body = null;
  const ctx = { getState: () => state, act: vi.fn(() => ({ ok: true })), toast: vi.fn(), sfx: vi.fn(), openModal: vi.fn((o) => { body = o.body; return () => {}; }), open: vi.fn() };
  const playHint = vi.fn(() => hint);
  const layer = document.createElement('div');
  document.body.append(layer);
  const bm = createBuildMode({ layer, ctx, controls: { renderer: { playHint } } });
  bm.openItemCard(placed.id);
  return { body, playHint, placed };
}

it('the item card says why a placed table gets no games, and says nothing otherwise', () => {
  const blocked = card({ code: 'sides', self: true, ids: ['x'] });
  expect(blocked.playHint).toHaveBeenCalledWith({ placedId: blocked.placed.id });
  expect(blocked.body.textContent).toContain('Needs room on both long sides');
  expect(card(null).body.textContent).not.toContain('long sides');
});
