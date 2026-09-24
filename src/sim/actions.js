import { getAction, makeCtx } from './registry.js';
import './systems.js';
import { checkUnlocks } from './unlocks.js';
import { checkGoals } from './goals.js';

// Handlers validate first and return { ok: false, reason } before mutating anything.
export function dispatch(state, action) {
  const handler = action && typeof action.type === 'string' ? getAction(action.type) : null;
  if (!handler) return { ok: false, reason: 'Unknown action', events: [] };
  if (state.gameOver && action.type !== 'resolveDecision' && action.type !== 'keepPlaying') return { ok: false, reason: 'The run is over', events: [] };
  const ctx = makeCtx(state);
  const res = handler(ctx, action) ?? { ok: true };
  if (!res.ok) return { ok: false, reason: res.reason ?? 'Not allowed', events: [] };
  // Placing desks, hiring, and starting a product can open systems and finish goals right away.
  if (!state.gameOver) {
    checkUnlocks(ctx);
    checkGoals(ctx);
  }
  const { ok, reason, events, ...extra } = res;
  return { ...extra, ok: true, events: ctx.events };
}
