// @vitest-environment happy-dom
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createTitle } from './title.js';
import { createGame } from '../sim/state.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); });

const click = (text) => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith(text));
  expect(button, text).toBeTruthy();
  button.click();
};

it('shows the kit and combined score, preserves the choice on Back, and passes it to the sim', () => {
  vi.useFakeTimers();
  const layer = document.createElement('div');
  document.body.append(layer);
  let started;
  const title = createTitle({ layer, controls: { newGame: (opts) => { started = createGame(opts); } }, sfx: () => {}, toast: () => {}, onStart: () => {}, openSettings: () => {} });
  title.show();
  click('New Game');
  click('Next: founders');
  document.querySelectorAll('.fcard')[0].click();
  document.querySelectorAll('.fcard')[1].click();
  click('Next: funding');
  expect(document.querySelector('[data-era="classic"]').getAttribute('aria-pressed')).toBe('true');
  document.querySelector('[data-era="agents"]').click();
  document.querySelectorAll('.fund')[1].click();
  expect(document.querySelector('.era-start-summary').textContent).toContain('$390K');
  expect(document.querySelector('.era-start-summary').textContent).toContain('x0.582');
  expect(layer.textContent).toContain('Skipped without rewards');
  click('Back');
  click('Next: funding');
  expect(document.querySelector('[data-era="agents"]').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelectorAll('.fund')[1].getAttribute('aria-pressed')).toBe('true');
  click('Start the company');
  expect(started.era.id).toBe('agents');
  expect(started.cash).toBe(390000);
  expect(started.founding.funding).toBe('family');
  expect(started.week).toBe(0);
});
