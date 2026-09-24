import { getSystems, makeCtx } from './registry.js';
import './systems.js';

export function tick(state) {
  if (state.gameOver || state.pendingDecision) return [];
  const ctx = makeCtx(state);
  for (const sys of getSystems()) {
    sys.fn(ctx);
    if (state.gameOver) break;
  }
  state.week++;
  return ctx.events;
}
