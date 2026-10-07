// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFirstPerson } from './firstPerson.js';

let layer, fpApi, ctx, ui, frames;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (f) => { frames.push(f); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  layer = document.createElement('div');
  layer.className = 'hitl';
  document.body.append(layer);
  let m = 'off';
  fpApi = {
    seeAs: vi.fn(() => { m = 'seeAs'; return true; }),
    walk: vi.fn(() => { m = 'walk'; return true; }),
    exit: vi.fn(() => { m = 'off'; }),
    mode: () => m,
    input: vi.fn(),
  };
  ctx = { closeAll: vi.fn(), toast: vi.fn() };
  ui = createFirstPerson({ layer, controls: { renderer: { firstPerson: fpApi } }, ctx, sfx: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

const step = () => { const f = frames.shift(); f?.(); };

it('walks: closes panels, hides the HUD, feeds held keys to the renderer and Esc leaves', () => {
  expect(ui.walk()).toBe(true);
  expect(ctx.closeAll).toHaveBeenCalled();
  expect(layer.classList.contains('fp-on')).toBe(true);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  step();
  expect(fpApi.input).toHaveBeenLastCalledWith({ moveX: 0, moveZ: 1, yaw: 0, pitch: 0 });
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  step();
  expect(fpApi.input).toHaveBeenLastCalledWith({ moveX: 0, moveZ: 0, yaw: 0, pitch: 0 });
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  expect(fpApi.exit).toHaveBeenCalled();
  expect(layer.classList.contains('fp-on')).toBe(false);
  expect(ui.active).toBe(false);
});

it('see as: no movement input, an Exit button leaves, and a refused view says why', () => {
  expect(ui.seeAs('s1', 'Ada')).toBe(true);
  expect(layer.querySelector('.fp-who').textContent).toBe('Seeing as Ada');
  step();
  expect(fpApi.input).not.toHaveBeenCalled();
  layer.querySelector('.fp-exit').click();
  expect(fpApi.exit).toHaveBeenCalled();
  fpApi.seeAs.mockReturnValueOnce(false);
  expect(ui.seeAs('gone')).toBe(false);
  expect(ctx.toast).toHaveBeenCalledWith(expect.stringMatching(/not around/), 'warn');
  expect(ui.active).toBe(false);
});

it('drops its controls when the renderer ends the mode by itself', () => {
  ui.walk();
  fpApi.exit();
  step();
  expect(ui.active).toBe(false);
});

it('offers Walk only when the renderer has the views and nothing covers the scene', () => {
  ui.update(false);
  expect(layer.querySelector('.fp-walk').hidden).toBe(false);
  ui.update(true);
  expect(layer.querySelector('.fp-walk').hidden).toBe(true);
  const bare = createFirstPerson({ layer: document.createElement('div'), controls: { renderer: {} }, ctx, sfx: vi.fn() });
  expect(bare.available()).toBe(false);
  expect(bare.walk()).toBe(false);
});
