// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createGame } from '../../sim/state.js';
import { hireView } from './hire.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterEach(() => document.body.replaceChildren());

function view({ policy, watched = false, pending = false, ok = true }) {
  document.body.replaceChildren();
  const state = createGame({ seed: 11 });
  state.policies.ai_interviews = policy;
  state.candidates[0].watched = watched;
  if (pending) state.pendingDecision = { eventId: 'x', title: 'x', choices: [] };
  const ctx = { getState: () => state, act: vi.fn(() => (ok ? { ok: true } : { ok: false, reason: 'Not right now' })), sfx: vi.fn(), toast: vi.fn(), open: vi.fn(), closeAll: vi.fn(), close: vi.fn() };
  const v = hireView(ctx);
  document.body.append(v.el);
  v.update(state, true);
  return { ctx, state, buttons: () => [...document.querySelectorAll('.iv-watch')] };
}

it('shows no watch button unless the AI interview policy is on', () => {
  expect(view({ policy: false }).buttons()).toHaveLength(0);
});

it('a watch button per candidate dispatches watchInterview and clears the way for the card', () => {
  const t = view({ policy: true });
  const b = t.buttons();
  expect(b).toHaveLength(t.state.candidates.length);
  b[0].click();
  expect(t.ctx.act).toHaveBeenCalledWith({ type: 'watchInterview', candidateId: t.state.candidates[0].id });
  expect(t.ctx.close).toHaveBeenCalled();
});

it('a refused watch keeps the panel open', () => {
  const t = view({ policy: true, ok: false });
  t.buttons()[0].click();
  expect(t.ctx.close).not.toHaveBeenCalled();
});

it('is greyed for a watched candidate and while another decision is open', () => {
  expect(view({ policy: true, watched: true }).buttons()[0].disabled).toBe(true);
  expect(view({ policy: true, pending: true }).buttons()[0].disabled).toBe(true);
  expect(view({ policy: true }).buttons()[0].disabled).toBe(false);
});
