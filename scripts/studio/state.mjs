import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export async function resolveState({ snapshot, seed, week = 0, state } = {}) {
  if (state) return structuredClone(state);
  if (snapshot) {
    const bytes = readFileSync(snapshot);
    return JSON.parse((bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes).toString('utf8'));
  }
  if (seed != null) {
    const { createGame, tick } = await import('../../src/sim/index.js');
    const { botDecide, botTurn } = await import('../../src/sim/bots.js');
    const result = createGame({ seed });
    while (result.week < week) {
      if (result.gameOver) throw new Error(`scene-engine: game ended before week ${week}`);
      botDecide('balanced', result); botTurn('balanced', result); tick(result);
    }
    return result;
  }
  return undefined;
}
