// @vitest-environment happy-dom
import { it, expect, vi, afterAll } from 'vitest';
import { createMomentCaptions } from './moments.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

it('updates the active Y2K caption by beat and keeps Skip operable', () => {
  const layer = document.createElement('div');
  document.body.append(layer);
  let spot = { key: 'y2k-1', kind: 'y2k_rollover' };
  const endSpotlight = vi.fn(() => { spot = null; });
  const captions = createMomentCaptions(layer, { getRenderer: () => ({ spotlight: () => spot, endSpotlight }) });
  captions.update();
  window.dispatchEvent(new CustomEvent('hitl:moment', { detail: { phase: 'beat', id: 'y2k-1', key: 'y2k_rollover', caption: '23:59:59 · 1…' } }));
  expect(captions.shown).toBe('23:59:59 · 1…');
  window.dispatchEvent(new CustomEvent('hitl:moment', { detail: { phase: 'beat', id: 'other', key: 'printer_jam', caption: 'Unrelated' } }));
  expect(captions.shown).toBe('23:59:59 · 1…');
  layer.querySelector('.mcap-skip').click();
  expect(endSpotlight).toHaveBeenCalledOnce();
  captions.update(); expect(captions.shown).toBeNull();
  layer.remove();
});
