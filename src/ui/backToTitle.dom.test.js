// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettings } from './settings.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

let calls;
let saved;
const setup = ({ titleMode = false, save = () => { calls.push('save'); return saved; } } = {}) => {
  const layer = document.createElement('div');
  if (titleMode) layer.classList.add('title-mode');
  document.body.append(layer);
  const controls = {
    save,
    newGame: (o) => { calls.push(o === undefined ? 'newGame()' : 'newGame(opts)'); },
    exportSave: () => 'x',
    setVolume() {}, setBusVolume() {}, setMuted() {}, setQuality() {}, setTiltShift() {}, setAutoPause() {}, setPauseOnBlur() {},
    getQuality: () => 'auto', autoQuality: 'high',
  };
  const toast = vi.fn();
  const s = createSettings({ layer, controls, sfx: vi.fn(), getState: () => ({ companyName: 'Loopworks', flags: {} }), toast });
  s.open();
  return { layer, s, toast };
};
const byText = (layer, sel, text) => [...layer.querySelectorAll(sel)].find((e) => e.textContent.includes(text));

beforeEach(() => { calls = []; saved = true; });
afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('Settings: Back to title', () => {
  it('asks first, saying the game is saved, then saves and shows the title', () => {
    const { layer, s } = setup();
    const ask = byText(layer, 'button', 'Back to title');
    expect(ask).toBeTruthy();
    const confirm = layer.querySelector('.backconfirm');
    expect(confirm.style.display).toBe('none');
    ask.click();
    expect(confirm.style.display).toBe('');
    expect(confirm.textContent).toContain('saved');
    expect(calls).toEqual([]);
    byText(layer, 'button', 'Save and go').click();
    expect(calls).toEqual(['save', 'newGame()']);
    expect(s.isOpen).toBe(false);
  });

  it('Stay closes the confirm without saving or leaving', () => {
    const { layer, s } = setup();
    byText(layer, 'button', 'Back to title').click();
    byText(layer, 'button', 'Stay').click();
    expect(layer.querySelector('.backconfirm').style.display).toBe('none');
    expect(calls).toEqual([]);
    expect(s.isOpen).toBe(true);
  });

  it('scrolls the confirm into view when it opens', () => {
    const { layer } = setup();
    const confirm = layer.querySelector('.backconfirm');
    confirm.scrollIntoView = vi.fn();
    byText(layer, 'button', 'Back to title').click();
    expect(confirm.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    byText(layer, 'button', 'Stay').click();
    expect(confirm.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('stays in the game and says why when the save fails', () => {
    saved = false;
    const { layer, s, toast } = setup();
    byText(layer, 'button', 'Back to title').click();
    byText(layer, 'button', 'Save and go').click();
    expect(calls).toEqual(['save']);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Could not save'), 'warn');
    expect(s.isOpen).toBe(true);
  });

  it('is not offered on the title screen', () => {
    const { layer } = setup({ titleMode: true });
    expect(byText(layer, 'button', 'Back to title')).toBeUndefined();
  });
});
