import { createYakPacer } from './yak-pacing.js';
import { createMockSim } from './dev/mockSim.js';
import { createPacer, MAX_STEP } from './pacing.js';
import { autoQuality, deviceTraits, glRendererName } from './quality.js';

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
// Longest a spotlight may hold the clock before the hold lets go on its own: its expected length
// (renderer.spotlight().expectedSeconds) with some slack, or SPOTLIGHT_MAX_S when it gives none.
const SPOTLIGHT_MAX_S = 60;
const SPOTLIGHT_SLACK = 1.25;
const SPOTLIGHT_EXTRA_S = 10;
// A hard ceiling, so a wrong expectedSeconds (milliseconds by mistake, say) can't hold the clock for long.
const SPOTLIGHT_CEILING_S = 180;
const spotlightCap = (s) => (Number(s?.expectedSeconds) > 0 ? Math.min(s.expectedSeconds * SPOTLIGHT_SLACK + SPOTLIGHT_EXTRA_S, SPOTLIGHT_CEILING_S) : SPOTLIGHT_MAX_S);

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
  let autoPause = true;
  let awayPaused = false;

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
  // An explicit ?quality= wins for the whole session (tools and tests rely on it); otherwise the
  // saved setting, which ui applies through controls.setQuality at startup. 'auto' (and the boot
  // value) is Low on software GL, High otherwise.
  const urlQuality = params.get('quality');
  const detectedQuality = autoQuality(glRendererName(), deviceTraits());
  const quality = urlQuality ?? detectedQuality;
  let activeQuality = quality;
  const forcedTime = params.get('time') ?? (sim.state.flags?.mockTime ?? null);

  const renderer = renderMod?.createRenderer({
    canvas: document.getElementById('scene'),
    labelsEl: document.getElementById('labels'),
    quality,
  }) ?? null;
  const audio = audioMod?.createAudio({ quality, renderer }) ?? null;
  renderer?.setSpeed?.(speed);

  const yakPacer = createYakPacer();
  const present = (events, state) => {
    if (!events?.length) return;
    renderer?.handleEvents(events, state);
    ui?.handleEvents(events, state);
    audio?.onEvents(events, state);
  };

  const route = (events, state, direct = false) => {
    if (!events?.length) return;
    const urgentIds = new Set((state.chatPrompts ?? []).filter(p => !p.resolved).map(p => p.chatId));
    if (direct) for (const e of events) if (e.type === 'chat') urgentIds.add(e.id);
    present(yakPacer.enqueue(events, { urgentIds }), state);
    present(events.filter(e => e.type !== 'chat'), state);
  };

  // A tick's non-urgent events trickle out over the week instead of arriving in one frame.
  const pacer = createPacer();
  const dispatch = (action) => {
    const res = sim.dispatch(action);
    route(res.events, sim.state, true);
    return res;
  };

  const canSave = () => realSim && !!saveMod && !isSnap;
  // Headless tools (?snap) never write saves but may load one: an indexed moment's snapshot.
  const canLoad = () => realSim && !!saveMod;
  // Each company writes its own save slot. A finished run is saved too, so it stays listed (as over)
  // and its ending can be revisited or, for the anniversary, played on.
  function save() {
    if (!canSave() || !playing) return false;
    return saveMod.saveGame(sim.state);
  }

  function startPlaying(state) {
    pacer.reset();
    yakPacer.reset();
    if (realSim) useState(state);
    playing = true;
  }

  function showTitle() {
    playing = false;
    pacer.reset();
    yakPacer.reset();
    if (realSim) useState(simMod.createGame({ seed: randomSeed() }));
    ui?.showTitle();
  }

  const controls = {
    setSpeed: (k) => { speed = k; if (k > 0) awayPaused = false; renderer?.setSpeed?.(k); },
    getSpeed: () => speed,
    // Auto-pause when focus leaves the page (a setting; ui stores it and calls setAutoPause).
    setAutoPause: (on) => { autoPause = on !== false; },
    getAutoPause: () => autoPause,
    setPauseOnBlur: (on) => { autoPause = on !== false; },
    getPauseOnBlur: () => autoPause,
    // True after an auto-pause until the player picks a speed again (for a "paused while away" hint).
    get awayPaused() { return awayPaused; },
    // No options means "back to the title" (the game-over screen's New Game).
    newGame: (opts) => {
      if (!opts) { showTitle(); return; }
      const seed = Number.isFinite(opts.seed) ? opts.seed : randomSeed();
      // Founding options (logoColor, tagline, founders, funding) pass straight through to the sim.
      const founding = { ...opts, seed, companyName: opts.companyName || 'Loopworks' };
      // A fresh state has no slot yet; its first save takes a new one, so earlier companies stay.
      startPlaying(realSim ? simMod.createGame(founding) : sim.state);
    },
    // Loads a slot by id (default: the last one written).
    continueGame: (id) => {
      if (!canLoad()) return { ok: false, reason: 'No save found' };
      const res = saveMod.loadGame(undefined, id);
      if (res.ok) startPlaying(res.state);
      // Everything the save module reports (reason, notice, any failure code) except the state.
      const { state: _state, ...result } = res;
      return result;
    },
    // The raw text of a save slot, even one this build cannot load; null without storage.
    exportSave: (id) => (canSave() && saveMod.exportSave ? saveMod.exportSave(undefined, id) ?? null : null),
    // The save slots' metadata, newest first, plus ok and reason from a trial load so a slot that
    // will not load is listed with its reason instead of dropped.
    listSaves: () => {
      if (!canSave() || !saveMod.listSaves) return [];
      return saveMod.listSaves().map((m) => {
        const { state: _state, ...res } = saveMod.loadGame(undefined, m.id);
        return { ...m, ...res };
      });
    },
    deleteSave: (id) => {
      if (!canSave() || !saveMod.deleteSave) return { ok: false, reason: 'No save found' };
      saveMod.deleteSave(undefined, id);
      return { ok: true };
    },
    loadStatus: () => {
      if (!canSave()) return { ok: false, reason: 'No save found' };
      const res = saveMod.loadGame();
      // meta labels the title's Continue row.
      const meta = res.ok ? { companyName: res.state.companyName, week: res.state.week, logoColor: res.state.founding?.logoColor ?? null } : null;
      return { ok: res.ok, reason: res.reason, meta };
    },
    save,
    setQuality: (q) => {
      if (urlQuality) return;
      activeQuality = q === 'auto' ? detectedQuality : q;
      renderer?.setQuality(activeQuality);
      audio?.setQuality?.(activeQuality);
    },
    getQuality: () => activeQuality,
    autoQuality: detectedQuality,
    setTiltShift: (on) => renderer?.setTiltShift(on),
    setVolume: (v) => audio?.setVolume(v),
    // Per-bus volume (music, ambience, sfx, ui, voice) and mute, from the Settings panel.
    setBus: (bus, v) => audio?.setBus?.(bus, v),
    setMuted: (m) => audio?.setMuted?.(m),
    focusStaff: (id) => renderer?.focusStaff(id),
    // Build mode and other renderer hooks (setBuildMode, pickTile) for the UI; null without a renderer.
    renderer,
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
    version: __HITL_VERSION__,
    get state() { return sim.state; },
    get playing() { return playing; },
    get clock() { return { acc: pacer.acc, queued: pacer.queued, speed, frames: frameCount, busy: ui?.isBusy?.() ?? null, dayClock, frozen, spotlight: spot }; },
    dispatch,
    setSpeed: controls.setSpeed,
    tickN: (n) => { for (let i = 0; i < n; i++) route(sim.tick(), sim.state); },
    // Presents events as if the sim had emitted them (capture scenarios, playtests).
    emit: (events) => route(events, sim.state),
    controls,
  };

  if (renderer) addEventListener('resize', () => renderer.resize());
  // Save whenever the page may be going away: tab hidden (mobile browsers often kill it after this),
  // navigation or close, and the bfcache.
  addEventListener('beforeunload', () => { save(); });
  addEventListener('pagehide', () => { save(); });
  // Leaving the page (another window, another tab) pauses like the pause button and saves. Nothing
  // resumes on return; the player does.
  function leftPage() {
    if (autoPause && playing && !isSnap && speed > 0 && !sim.state.gameOver) {
      controls.setSpeed(0);
      awayPaused = true;
    }
    save();
  }
  addEventListener('blur', leftPage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) leftPage(); });

  let last = performance.now();
  let dayClock = 0.35;
  let firstFrame = true;
  let frameCount = 0;
  let frozen = false;
  // Spotlight hold: while the renderer plays a spotlight moment (renderer.spotlight() returns it),
  // no sim ticks run, queued events wait and the day doesn't turn, but the office keeps moving: the
  // hold stops the clock, it doesn't freeze the renderer. It composes with the decision freeze (a
  // spotlight behind its card keeps the clock stopped until the moment ends), and one that holds it
  // alone for longer than its cap (spotlightCap) is let go. Only frames where nothing else stops the clock
  // (a card, pause, a menu, a hidden tab) count toward that, so reading a card never costs the moment.
  let spot = null;          // { key, kind, heldFor } while a hold is on
  let spotStuck = null;     // the key of a moment let go for running too long
  function spotlightHold(dt, alone) {
    const s = renderer?.spotlight?.() ?? null;
    if (!s || s.key === spotStuck) { spot = null; if (!s) spotStuck = null; return false; }
    const add = alone ? dt : 0;
    if (spot?.key !== s.key && Number(s.expectedSeconds) * SPOTLIGHT_SLACK + SPOTLIGHT_EXTRA_S > SPOTLIGHT_CEILING_S) {
      console.warn(`[hitl] spotlight ${s.kind ?? ''} ${s.key} expects ${s.expectedSeconds}s; holding the clock ${SPOTLIGHT_CEILING_S}s at most`);
    }
    spot = spot?.key === s.key ? { ...spot, heldFor: spot.heldFor + add } : { key: s.key, kind: s.kind, heldFor: add };
    const cap = spotlightCap(s);
    if (spot.heldFor > cap) {
      console.warn(`[hitl] spotlight ${s.kind ?? ''} ${s.key} held the clock over ${cap}s; letting go`);
      spotStuck = s.key; spot = null; return false;
    }
    return true;
  }
  function frame(now) {
    frameCount++;
    // Capped so a stalled or hidden tab resumes smoothly instead of jumping.
    const dt = Math.min(MAX_STEP, (now - last) / 1000);
    last = now;
    // The UI reports busy while a panel or modal is open (auto-pause for menus).
    const menuPause = ui?.isBusy?.() === true;
    const free = playing && !menuPause && !sim.state.pendingDecision && !sim.state.gameOver && !document.hidden;
    const held = spotlightHold(dt, free && speed > 0);
    const running = free && !held;
    if (pacer.step(dt, { speed, running })) {
      route(pacer.schedule(sim.tick()), sim.state);
      pacer.takeDropped();
      if (sim.state.gameOver || sim.state.week % AUTOSAVE_WEEKS === 0) save();
    }
    // Paused in any way (the pause button, a menu, a decision, the title): the office holds still.
    // The renderer freezes, the day does not turn, and queued events wait for play to resume.
    frozen = speed === 0 || menuPause || !!sim.state.pendingDecision || !playing;
    if (running) route(pacer.due(), sim.state);
    present(yakPacer.step(dt, playing && speed > 0 && !menuPause && !document.hidden), sim.state);
    if (!frozen && !held) dayClock = (dayClock + dt / DAY_SECONDS) % 1;
    renderer?.setPaused?.(frozen);
    if (renderer) {
      renderer.setTimeOfDay(forcedTime === 'night' ? 0.95 : forcedTime === 'day' ? 0.45 : dayClock);
      renderer.sync(sim.state);
      renderer.render(dt);
    }
    ui?.update(sim.state);
    // State-driven music and ambience; the same pause picture the renderer gets.
    // A spotlight stops the clock, not the sound: audio hears it as running, with the spotlight
    // ({ kind, key }) so it keeps that scene's own cues.
    const audible = running || (held && playing && !menuPause && !sim.state.gameOver && !document.hidden);
    audio?.update?.(sim.state, dt, { speed, running: audible, spotlight: held ? { kind: spot.kind, key: spot.key } : null, menuPause, decision: !!sim.state.pendingDecision, title: !playing, over: !!sim.state.gameOver });
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
