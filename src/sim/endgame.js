import { registerAction } from './registry.js';

// Ends the run. S12 extends this with score and epilogue.
export function endGame(ctx, { won, reason }) {
  const { state } = ctx;
  if (state.gameOver) return;
  state.gameOver = { won, reason, score: 0, epilogue: [] };
  ctx.emit({ type: 'gameOver' });
}

export { registerAction };
