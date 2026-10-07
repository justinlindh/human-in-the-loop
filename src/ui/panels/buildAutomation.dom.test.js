// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createGame } from '../../sim/state.js';
import { buildPanel } from './build.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterEach(() => { document.body.replaceChildren(); });

function open(level) {
  const state = createGame({ seed: 11 });
  state.automation.engineering.level = level;
  state.cash = 500000;
  const m = state.market;
  const ctx = { getState: () => state, act: vi.fn(() => ({ ok: true })), toast: vi.fn(), sfx: vi.fn(), open: vi.fn() };
  const panel = buildPanel(ctx, { preset: { category: m.unlockedCategories[0], angle: m.unlockedAngles[0] } });
  document.body.append(panel.el);
  panel.update(state, true);
  document.querySelectorAll('.buildside .picker .on, .buildside .picker input:checked').forEach((x) => x.click());
  panel.update(state, true);
  return { state, panel };
}
const summary = () => document.querySelector('.summary');

it('asks for a person, loudly, when nothing automates the build', () => {
  open(0);
  expect(summary().querySelector('.blockwhy').textContent).toMatch(/Pick at least one person/);
  expect(summary().querySelector('.go').disabled).toBe(true);
});

it('lets an empty team start when engineering automation is on, and says who builds it', () => {
  open(1);
  expect(summary().querySelector('.blockwhy').textContent).toMatch(/will build this/);
  expect(summary().querySelector('.go').disabled).toBe(false);
});
