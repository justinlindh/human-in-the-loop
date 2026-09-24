import { createMockSim } from './dev/mockSim.js';

// Optional layers: each lane's worktree renders whatever layers exist there.
const renderMods = import.meta.glob('./render/index.js');
const uiMods = import.meta.glob('./ui/index.js');
const audioMods = import.meta.glob('./audio/audio.js');
const simMods = import.meta.glob('./sim/index.js');

const params = new URLSearchParams(location.search);
const mockScenario = params.get('mock');
const isSnap = params.has('snap');
const WEEK_SECONDS = 2.0;

async function loadOptional(mods) {
  const loader = Object.values(mods)[0];
  return loader ? loader() : null;
}

async function boot() {
  const [renderMod, uiMod, audioMod, simMod] = await Promise.all([
    loadOptional(renderMods), loadOptional(uiMods), loadOptional(audioMods), mockScenario ? null : loadOptional(simMods),
  ]);

  let sim;
  if (mockScenario || !simMod) {
    const m = createMockSim({ scenario: mockScenario ?? 'floor', seed: Number(params.get('seed') ?? 7) });
    sim = { state: m.state, tick: () => m.tick(), dispatch: (a) => m.dispatch(a) };
  } else {
    const state = simMod.createGame({ seed: Number(params.get('seed') ?? 1) });
    sim = { state, tick: () => simMod.tick(state), dispatch: (a) => simMod.dispatch(state, a) };
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

  const route = (events, state) => {
    if (!events?.length) return;
    renderer?.handleEvents(events, state);
    ui?.handleEvents(events, state);
    audio?.onEvents(events);
  };
  const dispatch = (action) => {
    const res = sim.dispatch(action);
    route(res.events, sim.state);
    return res;
  };

  const controls = {
    setSpeed: (k) => { speed = k; },
    getSpeed: () => speed,
    newGame: () => location.assign(location.pathname),
    continueGame: () => {},
    loadStatus: () => ({ ok: false, reason: 'No save found' }),
    save: () => {},
    setQuality: (q) => renderer?.setQuality(q),
    setTiltShift: (on) => renderer?.setTiltShift(on),
    setVolume: (v) => audio?.setVolume(v),
    focusStaff: (id) => renderer?.focusStaff(id),
  };
  const ui = uiMod?.createUI({ root: document.getElementById('ui'), getState: () => sim.state, dispatch, controls }) ?? null;

  const weeks = Number(params.get('weeks') ?? 0);
  for (let i = 0; i < weeks; i++) {
    if (sim.state.pendingDecision) sim.dispatch({ type: 'resolveDecision', choice: 0 });
    sim.tick();
  }

  window.__HITL = {
    get state() { return sim.state; },
    dispatch,
    setSpeed: controls.setSpeed,
    tickN: (n) => { for (let i = 0; i < n; i++) route(sim.tick(), sim.state); },
  };

  if (renderer) addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => { acc = 0; });

  let acc = 0;
  let last = performance.now();
  let dayClock = 0.35;
  let firstFrame = true;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (speed > 0 && !sim.state.pendingDecision && !sim.state.gameOver) {
      acc += dt * speed;
      if (acc >= WEEK_SECONDS) {
        acc -= WEEK_SECONDS;
        route(sim.tick(), sim.state);
      }
    }
    dayClock = (dayClock + dt * Math.max(speed, 0.25) / 4) % 1;
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
