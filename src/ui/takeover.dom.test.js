// @vitest-environment happy-dom
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createTitle } from './title.js';
import * as sim from '../sim/state.js';
import { fmtMoney } from './dom.js';
import { B } from '../sim/balance.js';
vi.mock('./eraPreview.js', () => ({ erasPreview: true }));
vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function click(text) {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().endsWith(text));
  expect(b, text).toBeTruthy();
  b.click();
}

function founding(seedText = '1') {
  vi.useFakeTimers();
  const layer = document.createElement('div');
  document.body.append(layer);
  const newGame = vi.fn();
  const onStart = vi.fn();
  const title = createTitle({ layer, controls: { newGame }, onStart, sfx: () => {}, toast: () => {}, openSettings: () => {} });
  title.show();
  click('New Game');
  const seed = document.querySelector('.seed');
  seed.value = seedText;
  seed.dispatchEvent(new Event('input'));
  click('Next: founders');
  document.querySelectorAll('.fcard')[0].click();
  document.querySelectorAll('.fcard')[1].click();
  click('Next: funding');
  return { layer, newGame, onStart };
}

it('defaults to founding in every era and resets takeover when moving to an earlier era', () => {
  founding();
  const choices = document.querySelector('.takeover-choices');
  expect(choices.hidden).toBe(true);
  for (const era of ['chatgbt', 'agents']) {
    document.querySelector(`[data-era="${era}"]`).click();
    expect(choices.hidden).toBe(false);
    expect(choices.querySelector('[data-start-mode="garage"]').getAttribute('aria-pressed')).toBe('true');
  }
  choices.querySelector('[data-start-mode="takeover"]').click();
  expect(document.querySelector('.era-start-summary').textContent).toContain('No era kit');
  document.querySelector('[data-era="web2"]').click();
  expect(choices.hidden).toBe(true);
  document.querySelector('[data-era="agents"]').click();
  expect(choices.querySelector('[data-start-mode="garage"]').getAttribute('aria-pressed')).toBe('true');
});

it('keeps a randomly chosen seed from review through play', async () => {
  const { newGame } = founding('');
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
  try {
    document.querySelector('[data-era="chatgbt"]').click();
    document.querySelector('[data-start-mode="takeover"]').click();
    click('Review the company');
    await vi.runAllTimersAsync();
    expect(document.querySelector('.takeover').textContent).toContain('seed 250000000');
    random.mockReturnValue(0.8);
    click('Take over and play');
    await vi.runAllTimersAsync();
    expect(newGame.mock.calls[0][0].seed).toBe(250000000);
  } finally { random.mockRestore(); }
});

it('shows a failed predecessor reason without starting play and allows another choice', async () => {
  const { layer, newGame, onStart } = founding();
  document.querySelector('[data-era="agents"]').click();
  document.querySelector('[data-start-mode="takeover"]').click();
  const build = vi.spyOn(sim, 'createGame').mockImplementationOnce(() => { throw new Error('This company did not reach Agents.'); });
  try {
    click('Review the company');
    await vi.runAllTimersAsync();
    expect(layer.querySelector('[role="alert"]').textContent).toBe('This company did not reach Agents.');
    expect(newGame).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(layer.querySelector('[data-start-mode="garage"]').disabled).toBe(false);
  } finally { build.mockRestore(); }
});

it.each(['chatgbt', 'agents'])('previews the exact %s company before starting and preserves Back choices', async (era) => {
  const { layer, newGame, onStart } = founding();
  document.querySelector(`[data-era="${era}"]`).click();
  const build = vi.spyOn(sim, 'createGame');
  document.querySelector('[data-start-mode="takeover"]').click();
  const share = `${Math.round(B.takeover.scoreShare[era] * 100)}% of Classic`;
  expect(layer.textContent).toContain(`Expected score ${share}`);
  expect(layer.textContent).not.toContain('Takeover score x');
  const eraCard = document.querySelector(`[data-era="${era}"]`);
  expect(eraCard.lastElementChild.textContent).toBe(`Existing company · ${share} score`);
  expect(eraCard.children[1].textContent).toContain('built from Classic');
  expect(eraCard.textContent).not.toContain('milder incidents');
  document.querySelector('[data-start-mode="garage"]').click();
  expect(eraCard.lastElementChild.textContent).toContain('Garage');
  expect(eraCard.children[1].textContent).not.toContain('built from Classic');
  expect(eraCard.lastElementChild.textContent).toContain(`${Math.round(B.eraStarts[era].scoreShare * 100)}% of Classic score`);
  document.querySelector('[data-start-mode="takeover"]').click();
  expect(eraCard.lastElementChild.textContent).toBe(`Existing company · ${share} score`);
  document.querySelectorAll('.fund')[2].click();
  expect(document.querySelector('.fund.on .fcash').textContent).toBe('$300K');
  click('Review the company');
  expect(document.querySelector('.founding').getAttribute('aria-busy')).toBe('true');
  expect(document.querySelector('[role="status"]').textContent).toBe('Reading the books...');
  expect(build).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(newGame).not.toHaveBeenCalled();
  expect(onStart).not.toHaveBeenCalled();
  const summary = document.querySelector('.takeover').textContent;
  expect(summary).toContain(`Expected score ${share}`);
  expect(summary).toContain(`funding x${B.funding.preseed.scoreMult}`);
  expect(summary).not.toContain('takeover x');
  expect(summary).not.toContain('Combined x');
  for (const label of ['People', 'Live products', 'Cash', 'Weekly burn', 'Office', 'Entering']) expect(summary).toContain(label);
  expect(document.querySelectorAll('details summary')).toHaveLength(2);
  for (const list of document.querySelectorAll('details ul')) expect(list.tabIndex).toBe(0);
  click('Back');
  expect(document.querySelector('[data-start-mode="takeover"]').getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelectorAll('.fund')[2].getAttribute('aria-pressed')).toBe('true');
  click('Review the company');
  await vi.runAllTimersAsync();
  expect(document.querySelector('.takeover').textContent).toBe(summary);
  click('Take over and play');
  await vi.runAllTimersAsync();
  const options = newGame.mock.calls[0][0];
  expect(options).toMatchObject({ seed: 1, startMode: 'takeover', startEra: era, funding: 'preseed' });
  expect(build.mock.calls.filter(([options]) => options.startMode === 'takeover')).toHaveLength(1);
  const s = newGame.mock.calls[0][1];
  expect(s).toBe(build.mock.results[0].value);
  build.mockRestore();
  expect(summary).toContain(fmtMoney(s.cash));
  expect(summary).toContain(`People${s.staff.length}`);
  expect(summary).toContain(`${s.week} weeks`);
  expect(onStart).toHaveBeenCalledWith({ fresh: true });
  expect(layer.textContent).toContain(s.staff[0].name);
});

it('rebuilds the reviewed company after funding changes', async () => {
  const { newGame } = founding();
  document.querySelector('[data-era="agents"]').click();
  document.querySelector('[data-start-mode="takeover"]').click();
  const build = vi.spyOn(sim, 'createGame');
  click('Review the company');
  await vi.runAllTimersAsync();
  const first = build.mock.results[0].value;
  click('Back');
  document.querySelectorAll('.fund')[2].click();
  click('Review the company');
  await vi.runAllTimersAsync();
  click('Take over and play');
  expect(build.mock.calls.filter(([options]) => options.startMode === 'takeover')).toHaveLength(2);
  expect(newGame.mock.calls[0][1]).not.toBe(first);
  expect(newGame.mock.calls[0][1].founding.funding).toBe('preseed');
});
