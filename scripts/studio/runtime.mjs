import { installLoader } from './loader.mjs';
import { Element, installPlatform } from './platform.mjs';
import { fileURLToPath } from 'node:url';

export async function createRuntime({ state, mock = 'floor', quality = 'low', rig = false, traceRandom = false, initialPerkDelay } = {}) {
  const clock = installPlatform(fileURLToPath(new URL('../../', import.meta.url)), { quality, rig });
  installLoader({ initialPerkDelay });
  const { createRenderer } = await import('../../src/render/index.js');
  const { createMockSim } = await import('../../src/dev/mockSim.js');
  const S = state ?? createMockSim({ scenario: mock, seed: 7 }).state;
  if (!Array.isArray(S.staff) || !Number.isInteger(S.officeStage)) throw new Error('scene-engine: expected a game state with staff and officeStage');
  const R = createRenderer({ canvas: new Element('canvas'), labelsEl: new Element(), quality });
  const { loadModels } = await import('../../src/render/models.js');
  await loadModels();
  for (let attempts = 0; !R.ready && attempts < 1000; attempts++) await new Promise(resolve => setTimeout(resolve, 1));
  if (!R.ready) throw new Error('scene-engine: renderer did not become ready');
  const { getTemplate, PROP_NAMES, ITEM_IDS } = await import('../../src/render/models.js');
  for (const name of [...PROP_NAMES, ...ITEM_IDS.flatMap(id => [1, 2, 3].map(n => `${id}_l${n}`)), 'chibi', 'pets', 'robot']) {
    if (!getTemplate(name)) throw new Error(`scene-engine: missing model ${name}`);
  }
  R.setSpeed(1); R.setPaused(false); R.setTimeOfDay(0.45);
  clock.reseed();
  const randomTrace = [];
  if (traceRandom) {
    const random = Math.random;
    Math.random = () => { const value = random(); randomTrace.push({ t: performance.now(), value, stack: new Error().stack.split('\n').slice(2, 7).join('\n') }); return value; };
  }
  R.sync(S);
  if (S.pendingDecision) R.handleEvents([{ type: 'decision' }], S);
  let frame = 0;
  return { R, S, randomTrace, get frame() { return frame; },
    stepTo(target) {
      if (!Number.isInteger(target) || target < frame) throw new Error('scene-engine: frames must increase; open a fresh scene to rewind');
      while (frame < target) { clock.tick(); R.sync(S); R.render(1 / 30, { draw: false }); frame++; }
      R.scene.updateMatrixWorld(); R.camera.updateMatrixWorld();
    },
    async loadMeasurements() {
      const previous = Math.random; Math.random = clock.tool;
      try { return await import('./model.mjs'); } finally { Math.random = previous; }
    },
  };
}
