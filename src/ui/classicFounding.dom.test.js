// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createTitle } from './title.js';
import { createGame } from '../sim/state.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

const click = (text) => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith(text));
  expect(button, text).toBeTruthy();
  button.click();
};

it.each(['bootstrapped', 'family', 'preseed'])('keeps the default founding flow and complete state for %s', (funding) => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  const layer = document.createElement('div');
  document.body.append(layer);
  const newGame = vi.fn();
  const title = createTitle({ layer, controls: { newGame }, sfx: () => {}, toast: () => {}, onStart: () => {}, openSettings: () => {} });
  title.show();
  const flow = [];
  const record = () => flow.push({
    text: layer.textContent,
    inputs: [...layer.querySelectorAll('input')].map((el) => ({ value: el.value, placeholder: el.placeholder })),
    buttons: [...layer.querySelectorAll('button')].map((el) => ({ text: el.textContent, disabled: el.disabled, selected: el.classList.contains('on') })),
  });
  click('New Game');
  record();
  click('Next: founders');
  document.querySelectorAll('.fcard')[0].click();
  document.querySelectorAll('.fcard')[1].click();
  record();
  click('Next: funding');
  expect(document.querySelector('.era-starts')).toBeNull();
  expect(document.querySelector('.era-start-summary')).toBeNull();
  document.querySelectorAll('.fund')[['bootstrapped', 'family', 'preseed'].indexOf(funding)].click();
  record();
  click('Back');
  click('Next: funding');
  record();
  click('Start the company');
  const options = newGame.mock.calls[0][0];
  expect(options).not.toHaveProperty('startEra');
  expect({ flow, options }).toMatchSnapshot();
  // Hash every serialized field, including RNG, candidates, goals and furniture.
  expect(createHash('sha256').update(JSON.stringify(createGame(options))).digest('hex')).toMatchSnapshot('state');
});
