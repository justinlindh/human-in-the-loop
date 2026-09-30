// @vitest-environment happy-dom
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createTitle } from './title.js';
import { erasPreview } from './eraPreview.js';
import { createGame } from '../sim/state.js';
import { tick } from '../sim/tick.js';
import { ERA_STARTS } from '../data/era-modes.js';
import { saveGame, listSaves, loadGame } from '../save/save.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

it.each(Object.keys(ERA_STARTS).filter((id) => id !== 'classic'))('continues a saved %s company without the preview', (startEra) => {
  expect(erasPreview).toBe(false);
  const original = createGame({ seed: 11, startEra });
  expect(saveGame(original)).toBe(true);
  const layer = document.createElement('div');
  document.body.append(layer);
  let resumed;
  const onStart = vi.fn();
  const title = createTitle({ layer, controls: {
    listSaves,
    continueGame: (id) => { const result = loadGame(undefined, id); resumed = result.state; return result; },
  }, sfx: () => {}, toast: () => {}, onStart, openSettings: () => {} });
  title.show();
  layer.querySelector('.tl-slot').click();
  expect(onStart).toHaveBeenCalledWith({ fresh: false });
  expect(resumed.founding).toEqual(original.founding);
  expect(resumed.era).toEqual(original.era);
  expect(resumed.eraSchedule).toEqual(original.eraSchedule);
  tick(original);
  tick(resumed);
  expect(resumed).toEqual(original);
  expect(resumed.week).toBe(1);
});
