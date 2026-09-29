import { installLoader } from './loader.mjs';
import { Element, installPlatform } from './platform.mjs';
import { fileURLToPath } from 'node:url';

// A stand lasts the whole scene (Infinity does not serialize in a sample).
const HOLD_S = 1e9;

export async function createRuntime({ state, mock = 'floor', quality = 'low', rig = false, traceRandom = false, initialPerkDelay, script = [] } = {}) {
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
  const advance = () => { clock.tick(); R.sync(S); R.render(1 / 30, { draw: false }); };

  // A compose script (compose.mjs) says what a game state cannot: where someone stands and what they play.
  // It goes through the game's own hooks (R.catchFor for a stand, the character's gesture(), R.robot.force),
  // and the scene settles for a moment before frame 0, so script frames count from a scene at rest.
  const pending = script.filter((e) => e.op === 'gesture').map((e) => ({ ...e }));
  if (script.length || S.robot?.cause) {
    const { stageLayout } = await import('../../src/render/layout.js');
    const L = stageLayout(S.officeStage, S.office.expansion ?? 0);
    for (let i = 0; i < 2; i++) advance();
    if (S.robot?.cause && R.robot.force(`broken:${S.robot.cause}`)) R.robot.arriveNow();
    for (const e of script.filter((x) => x.op === 'place')) {
      const x = -L.W / 2 + e.at[0], z = -L.D / 2 + e.at[1];
      // standAt teleports; the temp it makes is then replaced by one that holds for the whole scene.
      if (!R.standAt(e.who, x, z)) throw new Error(`scene-engine: compose place: no such person ${e.who}`);
      R.catchFor(e.who, { anim: 'idle', t: HOLD_S, goal: { x, z, yaw: Math.atan2(e.dir[0], e.dir[1]), anim: 'idle' }, back: true });
    }
    for (let n = 0; n < 45; n++) advance();
  }
  const character = (id) => {
    let root = null;
    R.scene.traverse((o) => { if (!root && o.userData.staffId === id) root = o.parent; });
    return root && globalThis.__sceneCharacters?.get(root);
  };
  // Gestures whose frame has come; called before each step, so a gesture at frame f plays from frame f.
  const applyScript = (at) => {
    for (const e of pending) {
      if (e.done || e.frame > at) continue;
      const c = character(e.who);
      if (!c) throw new Error(`scene-engine: compose gesture: no such person ${e.who}`);
      c.gesture(e.name, e.seconds ?? 4);
      e.done = true;
    }
  };
  applyScript(0);
  return { R, S, randomTrace, get frame() { return frame; }, applyScript,
    stepTo(target) {
      if (!Number.isInteger(target) || target < frame) throw new Error('scene-engine: frames must increase; open a fresh scene to rewind');
      while (frame < target) { applyScript(frame); advance(); frame++; }
      R.scene.updateMatrixWorld(); R.camera.updateMatrixWorld();
    },
    async loadMeasurements() {
      const previous = Math.random; Math.random = clock.tool;
      try { return await import('./model.mjs'); } finally { Math.random = previous; }
    },
  };
}
