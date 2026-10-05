import { installLoader } from './loader.mjs';
import { Element, installPlatform } from './platform.mjs';
import { fileURLToPath } from 'node:url';

// A stand lasts the whole scene (Infinity does not serialize in a sample).
const HOLD_S = 1e9;

// width/height: the page's viewport in CSS pixels (the camera fit and HUD insets follow it), with the
// canvas filling it from the top-left corner as a harness page's does. transform: the loader's (loader.mjs).
// era: an era id the scene's company was founded in (`preinternet`, `dotcom`, `web2`, `agents`, ...), so
// the scene wears that era's art as a founded era career does.
export async function createRuntime({ state, mock = 'floor', quality = 'low', rig = null, era = null, traceRandom = false, initialPerkDelay, script = [], initialSync = true, width, height, transform } = {}) {
  const clock = installPlatform(fileURLToPath(new URL('../../', import.meta.url)), { quality, rig });
  installLoader({ initialPerkDelay, transform });
  const { createRenderer } = await import('../../src/render/index.js');
  const { createMockSim } = await import('../../src/dev/mockSim.js');
  const S = state ?? createMockSim({ scenario: mock, seed: 7 }).state;
  if (!Array.isArray(S.staff) || !Number.isInteger(S.officeStage)) throw new Error('scene-engine: expected a game state with staff and officeStage');
  if (era) {
    S.founding = { ...S.founding, startEra: era };
    S.era = { id: era, since: 0 };
    if (era === 'dotcom') S.flags = { ...S.flags, dotcom: { phase: 'growth', entered: 0, float: null, settled: false, recovered: false } };
  }
  const canvas = new Element('canvas');
  if (width && height) {
    globalThis.innerWidth = canvas.clientWidth = width;
    globalThis.innerHeight = canvas.clientHeight = height;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width, height, right: width, bottom: height });
  }
  // The label layer sits under body, as the page's does, so a check that queries the document finds it.
  const R = createRenderer({ canvas: document.body.appendChild(canvas), labelsEl: document.body.appendChild(new Element()), quality });
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
  // A caller that steps the renderer itself (the clip host) starts from the unsynced scene the browser page has.
  if (initialSync) {
    R.sync(S);
    if (S.pendingDecision) R.handleEvents([{ type: 'decision' }], S);
  }
  let frame = 0;
  const advance = () => { clock.tick(); R.sync(S); R.render(1 / 30, { draw: false }); };

  // A compose script (compose.mjs) says what a game state cannot: where someone stands and what they play.
  // It goes through the game's own hooks (R.catchFor for a stand, the character's gesture(), R.robot.force),
  // and the scene settles for a moment before frame 0, so script frames count from a scene at rest.
  const TIMED = ['gesture', 'use', 'release'];
  const pending = script.filter((e) => TIMED.includes(e.op)).map((e) => ({ ...e }));
  // A visit sent on purpose is the only visit: nobody else wanders in.
  if (pending.some((e) => e.op === 'use')) R.perks.hold = true;
  if (script.length || S.robot?.cause) {
    const { stageLayout } = await import('../../src/render/layout.js');
    const L = stageLayout(S.officeStage, S.office.expansion ?? 0);
    for (let i = 0; i < 2; i++) advance();
    if (S.robot?.cause && R.robot.force(`broken:${S.robot.cause}`)) R.robot.arriveNow();
    for (const e of script.filter((x) => x.op === 'place')) {
      // A named spot is the game's own step-out point for an item's slot, in world metres already.
      let x, z;
      if (e.stepOut) {
        const q = R.perks.stepOut(e.stepOut.item, e.stepOut.slot);
        if (!q) throw new Error(`scene-engine: compose place: "${e.stepOut.item}" slot ${e.stepOut.slot} has no step-out point (not a perk item with a step-in, a slot out of range, or the front is blocked)`);
        ({ x, z } = q);
      } else { x = -L.W / 2 + e.at[0]; z = -L.D / 2 + e.at[1]; }
      // standAt teleports; the temp it makes is then replaced by one that holds for the whole scene.
      if (!R.standAt(e.who, x, z)) throw new Error(`scene-engine: compose place: no such person ${e.who}`);
      // Facing the robot means where it rests after its plan (its dock), not the tile the item sits on.
      const rest = e.toward === 'robot' ? R.robot.peek()?.pos : null;
      if (e.toward === 'robot' && !rest) throw new Error('scene-engine: compose place: face "robot" but the scene has no robot');
      const dir = rest ? [rest[0] - x, rest[1] - z] : e.dir;
      R.catchFor(e.who, { anim: 'idle', t: HOLD_S, goal: { x, z, yaw: Math.atan2(dir[0], dir[1]), anim: 'idle' }, back: true });
    }
    const moment = script.find((x) => x.op === 'moment');
    for (let n = 0; n < (moment ? 30 : 45); n++) advance();
    // The game's own staging: what checks.js setupRobotFix does once the robot has settled. The fix event
    // makes the game pick the spot, walk the fixer there and slap; frame 0 is that event.
    if (moment?.name === 'music_night') {
      // What checks.js setupRobotParty does: the incentive event the game raises, with the dancers chosen.
      R.perks.hold = true; S.pendingDecision = null;
      S.robot = { ...S.robot, status: 'ok', cause: null };
      const ids = S.staff.filter((p) => p.mood !== 'away' && !p.remote).map((p) => p.id);
      const organiser = moment.organiser ?? ids[0];
      if (!organiser) throw new Error('scene-engine: compose moment: nobody free to organise the music night');
      const dancers = moment.dancers ?? ids.filter((id) => id !== organiser).slice(0, 3);
      R.handleEvents([{ type: 'incentive', staffId: organiser, reward: 'music_night', genre: moment.genre, dancers }], S);
      R.sync(S);
    } else if (moment) {
      R.perks.hold = true; S.pendingDecision = null;
      const rp = R.robot.root.position;
      const far = (id) => { const w = R.walkOf(id); return w?.goal ? Math.hypot(w.goal.x - rp.x, w.goal.z - rp.z) : Infinity; };
      const ids = S.staff.filter((p) => p.mood !== 'away' && !p.remote).map((p) => p.id).filter((id) => R.walkOf(id)?.mode === 'placed' && !R.walkOf(id).temp).sort((a, b) => far(a) - far(b));
      const fixer = moment.fixer === 'nearest' ? ids[0] : moment.fixer;
      if (!fixer) throw new Error('scene-engine: compose moment: nobody free to be the fixer');
      S.robot = { ...S.robot, status: 'ok', cause: null };
      R.handleEvents([{ type: 'robot', kind: 'fixed', fixerId: fixer, sameWeek: false }], S);
      R.sync(S);
    }
  }
  const character = (id) => {
    let root = null;
    R.scene.traverse((o) => { if (!root && o.userData.staffId === id) root = o.parent; });
    return root && globalThis.__sceneCharacters?.get(root);
  };
  // Gestures whose frame has come; called on reaching each frame, so a sample at frame f already shows it.
  const applyScript = (at) => {
    for (const e of pending) {
      if (e.done || e.frame > at) continue;
      e.done = true;
      if (e.op === 'use') {
        if (!R.perks.send([e.who], e.item, { slot: e.slot, dur: e.dur })) throw new Error(`scene-engine: compose use: ${e.who} cannot use "${e.item}" (not a perk item, or no such person)`);
        continue;
      }
      // A placed person is let go: the game's own release, back to their goal.
      if (e.op === 'release') {
        if (!R.catchFor(e.who, null, { walk: true })) throw new Error(`scene-engine: compose release: no such person ${e.who}`);
        continue;
      }
      const c = character(e.who);
      if (!c) throw new Error(`scene-engine: compose gesture: no such person ${e.who}`);
      c.gesture(e.name, e.seconds ?? 4);
    }
  };
  applyScript(0);
  return { R, S, randomTrace, clock, get frame() { return frame; }, applyScript,
    stepTo(target) {
      if (!Number.isInteger(target) || target < frame) throw new Error('scene-engine: frames must increase; open a fresh scene to rewind');
      while (frame < target) { advance(); frame++; applyScript(frame); }
      R.scene.updateMatrixWorld(); R.camera.updateMatrixWorld();
    },
    async loadMeasurements() {
      const previous = Math.random; Math.random = clock.tool;
      try { return await import('./model.mjs'); } finally { Math.random = previous; }
    },
  };
}
