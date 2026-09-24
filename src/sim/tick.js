import { getSystems, makeCtx } from './registry.js';
import './systems.js';
import { expireModifiers } from './effects.js';

export function tick(state) {
  if (state.gameOver || state.pendingDecision) return [];
  const ctx = makeCtx(state);
  for (const sys of getSystems()) {
    sys.fn(ctx);
    if (state.gameOver) break;
  }
  state.week++;
  if (!state.gameOver) expireModifiers(ctx);
  return ctx.events;
}
