// Audio entry: runs the pure director and plays its commands through the mixer. It reads the
// routed sim events and state (it never dispatches), listens for UI cues ('hitl:sfx') and
// character clicks ('hitl:characterClick'), and stays silent until the first user gesture.
// Without WebAudio every call is a no-op.

import { createDirector } from './director.js';
import { createMixer } from './mixer.js';
import { createLoader } from './loader.js';
import { createLoops } from './loops.js';
import { createDucked } from './ducked.js';

const KEEP_COMMANDS = 60;

export function createAudio({ quality = 'high' } = {}) {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  const director = createDirector({ seed: 7, quality });
  let ctx = null, mix = null, loader = null;
  let lastState = null;
  // Until the host passes state, read it from the dev hook so music and group cheers still work.
  const stateNow = () => lastState ?? (typeof window !== 'undefined' ? window.__HITL?.state ?? null : null);
  let lastCtx = { running: true, title: false };
  let lastUpdateAt = 0;
  let q = quality;
  const user = { master: 0.7, muted: false };
  const busUser = {};
  const log = [];
  let music = null; // { src, gain, era }
  let loops = null;
  let danceBus = null; // the music night track's level node, into the sfx bus
  let ducked = null;
  let lastDance = null;
  const openHolds = {}; // duck key -> hold ids opened by 'duck' commands, oldest first

  function unlock() {
    if (!AC) return;
    if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {}); return; }
    try {
      ctx = new AC();
      mix = createMixer(ctx);
      loader = createLoader(ctx);
      loops = createLoops(ctx, loader, (b) => mix.bus[b] ?? mix.bus.ambience);
      danceBus = ctx.createGain();
      danceBus.connect(mix.bus.sfx);
      ducked = createDucked(ctx, loader, { mix, out: (c) => (c.op === 'dance' ? danceBus : mix.bus[c.bus] ?? mix.bus.sfx), run: (cmds) => run(cmds) });
      mix.setUser('master', user.master);
      mix.setUser('muted', user.muted);
      for (const [b, v] of Object.entries(busUser)) mix.setUser(b, v);
      // Small sounds decode up front; music and voice banks load on first use.
      loader.preload(['stingers/launch', 'stingers/era', 'stingers/office', 'stingers/waffle', 'stingers/win', 'stingers/gameover', 'sfx/award', 'ui/click', 'ui/open', 'ui/close', 'ui/confirm', 'ui/error', 'ui/coin', 'ui/blip', 'voice/crowd', 'ambience/typing', 'sfx/door']);
      // iOS wants a sound started inside the gesture.
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination); s.start();
    } catch {
      ctx = null;
    }
  }
  if (AC) {
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
    // A hidden tab goes silent at once (frames stop there, so nothing else would). On return, sound
    // resumes only if the game is running or the title is up; after an auto-pause it waits for the
    // player's next click or key (unlock resumes it).
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) { ctx.suspend().catch(() => {}); return; }
      const h = hostCtx();
      if (h.title || (h.running && !window.__HITL?.controls?.awayPaused)) ctx.resume().catch(() => {});
    });
  }

  const now = () => (ctx ? ctx.currentTime : 0);
  // Pause and title state from the page when the host does not pass them (the menu pause flag and title screen).
  function hostCtx() {
    const h = typeof window !== 'undefined' ? window.__HITL : null;
    const busy = h?.clock?.busy === true;
    const s = h?.state;
    return { menuPause: busy, decision: !!s?.pendingDecision, title: h ? !h.playing : false, speed: h?.clock?.speed ?? 1, running: (h?.clock?.speed ?? 1) > 0, over: !!s?.gameOver };
  }
  const ready = () => ctx && ctx.state === 'running';

  function playBuffer(buf, bus, gain, at, { offset = 0, duration } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(mix.bus[bus] ?? mix.bus.sfx);
    src.start(Math.max(ctx.currentTime, at), offset, duration);
    return src;
  }

  function startMusic(cmd, waited = 0) {
    const id = `music/${cmd.bed}`;
    // A delivered bed that is still decoding: wait for it (up to 3 s) rather than start the placeholder.
    if (loader.meta(id)?.file && !loader.ready(id) && waited < 3000) {
      loader.preload([id]);
      setTimeout(() => { if (director.musicState.bed === cmd.bed) startMusic(cmd, waited + 250); }, 250);
      return;
    }
    const buf = loader.get(id);
    const meta = loader.ready(id) ? loader.meta(id) : null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (meta?.loopEnd) { const sr = loader.sampleRate(); src.loopStart = (meta.loopStart ?? 0) / sr; src.loopEnd = meta.loopEnd / sr; }
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g).connect(mix.musicIn);
    const t = ctx.currentTime;
    src.start(t);
    g.gain.setTargetAtTime(1, t, cmd.fade / 3);
    if (music) {
      const old = music;
      old.gain.gain.setTargetAtTime(0.0001, t, cmd.fade / 3);
      old.src.stop(t + cmd.fade * 2);
    }
    music = { src, gain: g, era: cmd.era };
  }

  function run(cmds) {
    if (!cmds.length) return;
    for (const c of cmds) { log.push(c); if (log.length > KEEP_COMMANDS) log.shift(); }
    if (!ready()) return;
    for (const c of cmds) {
      try {
        if (c.op === 'play') {
          if (c.cue === 'voice.bark') {
            const meta = loader.meta(c.file);
            const takes = meta?.emotions?.[c.emotion] ?? meta?.emotions?.happy;
            if (meta?.file && !loader.ready(c.file)) loader.preload([c.file]);
            let dur;
            if (loader.ready(c.file) && takes?.length) {
              // A cheer passes a take index so voices sharing an emotion say different lines.
              const [off, d] = takes[Number.isInteger(c.take) ? c.take % takes.length : Math.floor(Math.random() * takes.length)];
              playBuffer(loader.get(c.file), 'voice', c.gain, c.at, { offset: off, duration: d });
              dur = d;
            } else {
              const buf = loader.get(`${c.file}#${c.emotion}`);
              playBuffer(buf, 'voice', c.gain, c.at);
              dur = buf.duration;
            }
            // A single bark ducks the music while it sounds.
            if (c.duckKey === 'voice') mix.hold('voice', Math.max(ctx.currentTime, c.at), Math.max(ctx.currentTime, c.at) + dur);
          } else if (c.duck) {
            ducked.play(c);
          } else {
            playBuffer(loader.get(c.file), c.bus, c.gain, c.at);
          }
        } else if (c.op === 'music') startMusic(c);
        else if (c.op === 'loop') loops.set(c);
        else if (c.op === 'dance') ducked.play(c, { wait: true, pausable: true, onStart: (src) => { lastDance = { file: c.file, real: loader.ready(c.file), duration: src.buffer.duration, startAt: src.startAt }; } });
        else if (c.op === 'dancePause') { if (c.paused) ducked.pause(); else ducked.resume(); }
        else if (c.op === 'preload') loader.preload(c.ids);
        else if (c.op === 'musicMix') mix.musicMix(c);
        else if (c.op === 'duck') {
          // An 'on' opens a hold at its time; the matching 'off' closes the oldest open hold of that key.
          const at = Math.max(ctx.currentTime, c.at ?? ctx.currentTime);
          if (c.on) (openHolds[c.key] ??= []).push(mix.hold(c.key, at));
          else { const id = openHolds[c.key]?.shift(); if (id) mix.endHold(id, at); }
        }
      } catch { /* a failed sound never breaks the game */ }
    }
  }

  // UI cues and character clicks arrive as window events, so the UI needs no reference to audio.
  if (typeof window !== 'undefined') {
    addEventListener('hitl:sfx', (e) => run(director.cue(e.detail, now())));
    addEventListener('hitl:propUse', (e) => run(director.prop(e.detail?.itemId, now())));
    addEventListener('hitl:characterClick', (e) => run(director.poke(e.detail?.staffId, stateNow(), now())));
    addEventListener('hitl:audioSettings', (e) => {
      const d = e.detail ?? {};
      if (Number.isFinite(d.master)) api.setVolume(d.master);
      api.setMuted(!!d.muted);
      for (const [b, v] of Object.entries(d.bus ?? {})) api.setBus(b, v);
    });
  }

  function update(state, dt, c = {}) {
    lastState = state;
    lastCtx = c;
    lastUpdateAt = performance.now();
    if (ready()) run(director.update(state, now(), c));
  }

  // Until the host calls update() every frame, keep music and ambient barks going from the last state seen.
  if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function') {
    const tick = () => {
      const s = stateNow();
      if (ready()) ducked?.pump();
      if (ready() && s && performance.now() - lastUpdateAt > 500) run(director.update(s, now(), { ...lastCtx, ...hostCtx() }));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const api = {
    unlock,
    onEvents(events, state) {
      if (state) lastState = state;
      if (!events?.length) return;
      run(director.events(events, state ?? stateNow(), now(), { speed: lastCtx.speed ?? 1 }));
    },
    update,
    cue(name) { run(director.cue(name, now())); },
    play(name) { run(director.cue(name, now())); },
    setVolume(v) { user.master = Math.max(0, Math.min(1, Number(v) || 0)); mix?.setUser('master', user.master); },
    setBus(bus, v) {
      if (bus === 'master') { api.setVolume(v); return; }
      busUser[bus] = v;
      mix?.setUser(bus, v);
    },
    setMuted(m) { user.muted = !!m; mix?.setUser('muted', user.muted); },
    // Low trims in the director (fewer voices, no ambient loops); the crowd bed under a cheer stays.
    setQuality(v) { q = v === 'low' ? 'low' : 'high'; director.setQuality(q); },
    setMusic() {},
    get commands() { return log.slice(); },
    loopState: (id) => loops?.state(id) ?? null,
    // The last music night track started: whether it was the delivered file, its length and start time.
    get lastDance() { return lastDance; },
    get musicDuck() { return mix?.duckLevel ?? 1; },
    // A MediaStream of the final mix, for capture tools.
    tap() { if (!ctx) return null; const d = ctx.createMediaStreamDestination(); mix.output.connect(d); return d.stream; },
    get state() { return { unlocked: !!ctx, running: !!ready(), music: director.musicState }; },
  };
  if (typeof window !== 'undefined') window.__HITL_AUDIO = api;
  return api;
}
