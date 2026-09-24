import { createMockSim } from './dev/mockSim.js';
import { createPacer, MAX_STEP } from './pacing.js';

// Optional layers: each lane's worktree renders whatever layers exist there.
const renderMods = import.meta.glob('./render/index.js');
const uiMods = import.meta.glob('./ui/index.js');
const audioMods = import.meta.glob('./audio/audio.js');
const simMods = import.meta.glob('./sim/index.js');
const saveMods = import.meta.glob('./save/save.js');

const params = new URLSearchParams(location.search);
const mockScenario = params.get('mock');
const isSnap = params.has('snap');
// ?seed or ?weeks skips the title and plays immediately (tests, snapshots, reproducible runs).
const directPlay = !!mockScenario || params.has('seed') || params.has('weeks');
// Ambient day/night runs on real time so higher game speeds never strobe the scene.
const DAY_SECONDS = 120;
const AUTOSAVE_WEEKS = 4;

async function loadOptional(mods) {
  const loader = Object.values(mods)[0];
  return loader ? loader() : null;
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

async function boot() {
  const [renderMod, uiMod, audioMod, simMod, saveMod] = await Promise.all([
    loadOptional(renderMods), loadOptional(uiMods), loadOptional(audioMods),
    mockScenario ? null : loadOptional(simMods), mockScenario ? null : loadOptional(saveMods),
  ]);
  const realSim = !!simMod && !mockScenario;

  let sim;
  let playing = false;

  function useState(state) {
    sim = { state, tick: () => simMod.tick(state), dispatch: (a) => simMod.dispatch(state, a) };
  }
  if (!realSim) {
    const m = createMockSim({ scenario: mockScenario ?? 'floor', seed: Number(params.get('seed') ?? 7) });
    sim = { state: m.state, tick: () => m.tick(), dispatch: (a) => m.dispatch(a) };
  } else {
    useState(simMod.createGame({ seed: Number(params.get('seed') ?? randomSeed()) }));
  }

  let speed = Number(params.get('speed') ?? (isSnap ? 0 : 1));
  const quality = params.get('quality') ?? 'high';
  const forcedTime = params.get('time') ?? (sim.state.flags?.mockTime ?? null);

  const renderer = renderMod?.createRenderer({
    canvas: document.getElementById('scene'),
    labelsEl: document.getElementById('labels'),
    quality,
  }) ?? null;
  const audio = audioMod?.createAudio() ?? null;
  renderer?.setSpeed?.(speed);

  const route = (events, state) => {
    if (!events?.length) return;
    renderer?.handleEvents(events, state);
    ui?.handleEvents(events, state);
    audio?.onEvents(events);
  };

  // A tick's non-urgent events trickle out over the week instead of arriving in one frame.
  const pacer = createPacer();
  const dispatch = (action) => {
    const res = sim.dispatch(action);
    route(res.events, sim.state);
    return res;
  };

  const canSave = () => realSim && !!saveMod && !isSnap;
  function save() {
    if (!canSave() || !playing) return false;
    if (sim.state.gameOver) { saveMod.clearSave(); return false; }
    return saveMod.saveGame(sim.state);
  }

  function startPlaying(state) {
    pacer.reset();
    if (realSim) useState(state);
    playing = true;
  }

  function showTitle() {
    playing = false;
    pacer.reset();
    if (realSim) useState(simMod.createGame({ seed: randomSeed() }));
    ui?.showTitle();
  }

  const controls = {
    setSpeed: (k) => { speed = k; renderer?.setSpeed?.(k); },
    getSpeed: () => speed,
    // No options means "back to the title" (the game-over screen's New Game).
    newGame: (opts) => {
      if (!opts) { showTitle(); return; }
      const seed = Number.isFinite(opts.seed) ? opts.seed : randomSeed();
      startPlaying(realSim ? simMod.createGame({ seed, companyName: opts.companyName || 'Loopworks' }) : sim.state);
      if (canSave()) saveMod.clearSave();
    },
    continueGame: () => {
      if (!canSave()) return { ok: false, reason: 'No save found' };
      const res = saveMod.loadGame();
      if (res.ok) startPlaying(res.state);
      return { ok: res.ok, reason: res.reason, notice: res.notice };
    },
    loadStatus: () => {
      if (!canSave()) return { ok: false, reason: 'No save found' };
      const res = saveMod.loadGame();
      return { ok: res.ok, reason: res.reason };
    },
    save,
    setQuality: (q) => renderer?.setQuality(q),
    setTiltShift: (on) => renderer?.setTiltShift(on),
    setVolume: (v) => audio?.setVolume(v),
    focusStaff: (id) => renderer?.focusStaff(id),
  };
  const ui = uiMod?.createUI({ root: document.getElementById('ui'), getState: () => sim.state, dispatch, controls }) ?? null;

  if (directPlay || !ui) {
    playing = true;
    const weeks = Number(params.get('weeks') ?? 0);
    for (let i = 0; i < weeks; i++) {
      if (sim.state.pendingDecision) sim.dispatch({ type: 'resolveDecision', choice: 0 });
      if (sim.state.gameOver) break;
      sim.tick();
    }
  } else {
    showTitle();
  }

  window.__HITL = {
    get state() { return sim.state; },
    get playing() { return playing; },
    get clock() { return { acc: pacer.acc, queued: pacer.queued, speed, frames: frameCount, busy: ui?.isBusy?.() ?? null }; },
    dispatch,
    setSpeed: controls.setSpeed,
    tickN: (n) => { for (let i = 0; i < n; i++) route(sim.tick(), sim.state); },
    controls,
  };

  if (renderer) addEventListener('resize', () => renderer.resize());
  addEventListener('beforeunload', () => { save(); });

  let last = performance.now();
  let dayClock = 0.35;
  let firstFrame = true;
  let frameCount = 0;
  function frame(now) {
    frameCount++;
    // Capped so a stalled or hidden tab resumes smoothly instead of jumping.
    const dt = Math.min(MAX_STEP, (now - last) / 1000);
    last = now;
    // The UI reports busy while a panel or modal is open (auto-pause for menus).
    const menuPause = ui?.isBusy?.() === true;
    const running = playing && !menuPause && !sim.state.pendingDecision && !sim.state.gameOver && !document.hidden;
    if (pacer.step(dt, { speed, running })) {
      route(pacer.schedule(sim.tick()), sim.state);
      const quiet = pacer.takeQuiet();
      if (quiet.length) { ui?.handleEvents(quiet, sim.state); audio?.onEvents(quiet); }
      if (sim.state.gameOver || sim.state.week % AUTOSAVE_WEEKS === 0) save();
    }
    if (!menuPause) route(pacer.due(), sim.state);
    dayClock = (dayClock + dt / DAY_SECONDS) % 1;
    if (renderer) {
      renderer.setTimeOfDay(forcedTime === 'night' ? 0.95 : forcedTime === 'day' ? 0.45 : dayClock);
      renderer.sync(sim.state);
      renderer.render(dt);
    }
    ui?.update(sim.state);
    if (firstFrame) {
      firstFrame = false;
      requestAnimationFrame(() => { window.__HITL_READY = true; });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (!renderer && !ui) {
    const s = sim.state;
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:24px;font:14px JetBrains Mono,monospace;color:#2a2630';
    pre.textContent = `Human in the Loop (${mockScenario ? `mock: ${mockScenario}` : 'real sim'})\nweek ${s.week}  stage ${s.officeStage}  staff ${s.staff.length}  products ${s.products.length}`;
    document.getElementById('ui').appendChild(pre);
  }
}

boot().catch((e) => {
  console.error(e);
  window.__HITL_READY = true;
});
