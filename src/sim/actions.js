import { getAction, makeCtx } from './registry.js';

// Handlers validate first and return { ok: false, reason } before mutating anything.
export function dispatch(state, action) {
  const handler = action && typeof action.type === 'string' ? getAction(action.type) : null;
  if (!handler) return { ok: false, reason: 'Unknown action', events: [] };
  if (state.gameOver && action.type !== 'resolveDecision') return { ok: false, reason: 'The run is over', events: [] };
  const ctx = makeCtx(state);
  const res = handler(ctx, action) ?? { ok: true };
  if (!res.ok) return { ok: false, reason: res.reason ?? 'Not allowed', events: [] };
  return { ok: true, events: ctx.events };
}
