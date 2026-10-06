// @vitest-environment happy-dom
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createTitle } from './title.js';
import { createGame } from '../sim/state.js';
import { ERA_STARTS, CAREER_MODES } from '../data/era-modes.js';
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

// Opens a title screen and starts New Game, which lands on the era step.
function open(controls = {}) {
  vi.useFakeTimers();
  const layer = document.createElement('div');
  document.body.append(layer);
  const title = createTitle({ layer, controls, sfx: () => {}, toast: () => {}, onStart: () => {}, openSettings: () => {} });
  title.show();
  click('New Game');
  return layer;
}

// From the era step to Funding, picking the first two founders on the way.
function toFunding() {
  click('Next: company');
  click('Next: founders');
  if (document.querySelectorAll('.fcard.on').length < 2) {
    document.querySelectorAll('.fcard')[0].click();
    document.querySelectorAll('.fcard')[1].click();
  }
  click('Next: funding');
}

it('picks the era first, shows the kit and combined score, preserves the choice on Back, and passes it to the sim', () => {
  let started;
  open({ newGame: (opts) => { started = createGame(opts); } });
  expect(document.querySelector('.fstep.on').textContent).toContain('Era');
  expect(document.querySelectorAll('.era-start')).toHaveLength(Object.keys(ERA_STARTS).length);
  expect(document.querySelector('[data-era="classic"]').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('[data-era="agents"]').textContent).toContain(`${Math.round(B.eraStarts.agents.scoreShare * 100)}% of Classic score`);
  document.querySelector('[data-era="agents"]').click();
  toFunding();
  document.querySelectorAll('.fund')[1].click();
  expect(document.querySelector('.era-line').textContent).toContain(ERA_STARTS.agents.name);
  expect(document.querySelector('.era-start-summary').textContent).toContain('$390K');
  expect(document.querySelector('.era-start-summary').textContent).toContain(`${Math.round(B.eraStarts.agents.scoreShare * 100)}% of Classic`);
  expect(document.body.textContent).toContain('Skipped without rewards');
  click('Back'); click('Back'); click('Back');
  expect(document.querySelector('.fstep.on').textContent).toContain('Era');
  expect(document.querySelector('[data-era="agents"]').getAttribute('aria-pressed')).toBe('true');
  toFunding();
  expect(document.querySelector('.era-line').textContent).toContain(ERA_STARTS.agents.name);
  expect(document.querySelectorAll('.fund')[1].getAttribute('aria-pressed')).toBe('true');
  click('Start the company');
  expect(started.era.id).toBe('agents');
  expect(started.cash).toBe(390000);
  expect(started.founding.funding).toBe('family');
  expect(started.week).toBe(0);
});

it('starts Classic by default with the picker on, the same game as a start with no era', () => {
  let options;
  open({ newGame: (opts) => { options = opts; } });
  expect(document.querySelector('[data-era="classic"]').getAttribute('aria-pressed')).toBe('true');
  toFunding();
  // Funding shows the pick in one line, with a way back to change it.
  expect(document.querySelector('.era-line').textContent).toContain('Classic SaaS');
  expect(document.querySelector('.era-start')).toBeNull();
  click('Start the company');
  expect(options.startEra).toBe('classic');
  const withEra = createGame(options);
  const { startEra, ...plain } = options;
  const without = createGame(plain);
  expect(withEra.era.id).toBe('classic');
  expect(withEra.cash).toBe(without.cash);
  expect(withEra.week).toBe(without.week);
  expect(withEra.staff.length).toBe(without.staff.length);
});

it('keeps the era dialog, cards and focus while picking each era in place', () => {
  open();
  const dialog = document.querySelector('.founding');
  const buttons = [...dialog.querySelectorAll('.era-start')];
  for (const button of [...buttons, buttons.find((b) => b.dataset.era === 'classic')]) {
    button.focus();
    button.click();
    expect(document.querySelector('.founding')).toBe(dialog);
    expect([...dialog.querySelectorAll('.era-start')]).toEqual(buttons);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect([...dialog.querySelectorAll('.era-start.on')]).toEqual([button]);
    expect(dialog.querySelectorAll('.era-start[aria-pressed="true"]')).toHaveLength(1);
    const route = Object.values(CAREER_MODES).find((m) => m.startEra === button.dataset.era);
    expect(button.textContent.includes(`Route: ${route?.name}`)).toBe(!!route);
  }
});

it('shows the kit, score and notes for each era on the funding step', () => {
  for (const id of Object.keys(ERA_STARTS)) {
    const kit = B.eraStarts[id];
    open();
    document.querySelector(`[data-era="${id}"]`).click();
    toFunding();
    const dialog = document.querySelector('.founding');
    const funds = [...dialog.querySelectorAll('.fund')];
    funds[1].click();
    for (const [i, funding] of ['bootstrapped', 'family', 'preseed'].entries()) {
      expect(funds[i].querySelector('.fcash').textContent).toBe(fmtMoney(B.funding[funding].cash + kit.cash));
      expect(funds[i].textContent.includes('plus the era kit')).toBe(id !== 'classic');
      expect(funds[i].textContent.includes('Includes')).toBe(kit.cash > 0);
    }
    const summary = dialog.querySelector('.era-start-summary').textContent;
    expect(summary).toContain(ERA_STARTS[id].name);
    const route = Object.values(CAREER_MODES).find((m) => m.startEra === id);
    expect(summary.includes(`(${route?.name})`)).toBe(!!route);
    expect(summary).toContain(fmtMoney(B.funding.family.cash + kit.cash));
    expect(summary).toContain(kit.scoreShare >= 1 ? 'the same as Classic' : `${Math.round(kit.scoreShare * 100)}% of Classic`);
    expect(summary).toContain(`funding factor x${B.funding.family.scoreMult}`);
    expect(dialog.textContent.includes('Skipped without rewards')).toBe(ERA_STARTS[id].skippedGoals.length > 0);
    expect(dialog.textContent.includes('Already open')).toBe(ERA_STARTS[id].unlocks.length > 0);
    document.body.replaceChildren();
  }
});
