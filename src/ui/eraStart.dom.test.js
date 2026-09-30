// @vitest-environment happy-dom
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createTitle } from './title.js';
import { createGame } from '../sim/state.js';
import { ERA_STARTS } from '../data/era-modes.js';
import { B } from '../sim/balance.js';
import { fmtMoney } from './dom.js';
vi.mock('./eraPreview.js', () => ({ erasPreview: true }));

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
  expect(document.querySelector('.era-start-summary').textContent).toContain(`${Math.round(B.eraStarts.agents.scoreShare * 100)}% of Classic`);
  expect(document.querySelector('[data-era="agents"]').textContent).toContain(`${Math.round(B.eraStarts.agents.scoreShare * 100)}% of Classic score`);
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

it('keeps the funding dialog, buttons, focus and scroll while refreshing each era in place', () => {
  vi.useFakeTimers();
  const layer = document.createElement('div');
  document.body.append(layer);
  const title = createTitle({ layer, controls: {}, sfx: () => {}, toast: () => {}, onStart: () => {}, openSettings: () => {} });
  title.show();
  click('New Game');
  click('Next: founders');
  document.querySelectorAll('.fcard')[0].click();
  document.querySelectorAll('.fcard')[1].click();
  click('Next: funding');
  const dialog = document.querySelector('.founding');
  const form = dialog.querySelector('.tl-form');
  const funds = [...dialog.querySelectorAll('.fund')];
  funds[1].click();
  form.scrollTop = 120;
  const buttons = [...dialog.querySelectorAll('.era-start')];
  for (const button of [...buttons, buttons.find((b) => b.dataset.era === 'classic')]) {
    const id = button.dataset.era;
    const kit = B.eraStarts[id];
    button.focus();
    button.click();
    expect(document.querySelector('.founding')).toBe(dialog);
    expect([...dialog.querySelectorAll('.era-start')]).toEqual(buttons);
    expect([...dialog.querySelectorAll('.fund')]).toEqual(funds);
    expect(document.activeElement).toBe(button);
    expect(form.scrollTop).toBe(120);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect([...dialog.querySelectorAll('.era-start.on')]).toEqual([button]);
    expect(dialog.querySelectorAll('.era-start[aria-pressed="true"]')).toHaveLength(1);
    expect(funds[1].getAttribute('aria-pressed')).toBe('true');
    for (const [i, funding] of ['bootstrapped', 'family', 'preseed'].entries()) {
      expect(funds[i].querySelector('.fcash').textContent).toBe(fmtMoney(B.funding[funding].cash + kit.cash));
      expect(funds[i].textContent.includes('plus the era kit')).toBe(id !== 'classic');
      expect(funds[i].textContent.includes('Includes')).toBe(kit.cash > 0);
    }
    const summary = dialog.querySelector('.era-start-summary').textContent;
    expect(summary).toContain(ERA_STARTS[id].name);
    expect(summary).toContain(fmtMoney(B.funding.family.cash + kit.cash));
    expect(summary).toContain(kit.scoreShare >= 1 ? 'the same as Classic' : `${Math.round(kit.scoreShare * 100)}% of Classic`);
    expect(summary).toContain(`funding factor x${B.funding.family.scoreMult}`);
    expect(layer.textContent.includes('Skipped without rewards')).toBe(ERA_STARTS[id].skippedGoals.length > 0);
    expect(layer.textContent.includes('Already open')).toBe(ERA_STARTS[id].unlocks.length > 0);
  }
});
