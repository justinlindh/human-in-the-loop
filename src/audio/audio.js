// Placeholder procedural sound effects. Real audio replaces this module wholesale later, so
// everything goes through the createAudio API. Nothing plays before the first user gesture.

// Each sound is a list of notes: [start s, freq Hz, duration s, wave, gain, endFreq?].
const SOUNDS = {
  click: [[0, 900, 0.035, 'square', 0.12, 700]],
  open: [[0, 520, 0.07, 'triangle', 0.22, 780], [0.05, 880, 0.08, 'triangle', 0.16]],
  close: [[0, 700, 0.07, 'triangle', 0.18, 440]],
  confirm: [[0, 660, 0.08, 'triangle', 0.22], [0.07, 990, 0.12, 'triangle', 0.22]],
  error: [[0, 220, 0.1, 'square', 0.14, 180], [0.1, 180, 0.14, 'square', 0.14, 140]],
  coin: [[0, 988, 0.06, 'square', 0.14], [0.06, 1319, 0.16, 'square', 0.14]],
  blip: [[0, 1200, 0.05, 'sine', 0.18, 1500]],
  decision: [[0, 523, 0.1, 'triangle', 0.2], [0.1, 659, 0.1, 'triangle', 0.2], [0.2, 784, 0.18, 'triangle', 0.2]],
  hire: [[0, 587, 0.09, 'triangle', 0.22], [0.09, 740, 0.09, 'triangle', 0.22], [0.18, 880, 0.2, 'triangle', 0.22]],
  resign: [[0, 440, 0.16, 'sine', 0.22, 392], [0.16, 349, 0.3, 'sine', 0.22, 330]],
  fanfare: [[0, 523, 0.12, 'square', 0.14], [0.12, 659, 0.12, 'square', 0.14], [0.24, 784, 0.12, 'square', 0.14],
    [0.36, 1047, 0.4, 'square', 0.16], [0.36, 523, 0.4, 'triangle', 0.18]],
  award: [[0, 784, 0.1, 'triangle', 0.2], [0.1, 988, 0.1, 'triangle', 0.2], [0.2, 1175, 0.1, 'triangle', 0.2], [0.3, 1568, 0.35, 'triangle', 0.2]],
  alarm: [[0, 880, 0.18, 'sawtooth', 0.12, 660], [0.2, 880, 0.18, 'sawtooth', 0.12, 660], [0.4, 880, 0.18, 'sawtooth', 0.12, 660]],
  gameover: [[0, 392, 0.25, 'triangle', 0.22], [0.25, 330, 0.25, 'triangle', 0.22], [0.5, 262, 0.6, 'triangle', 0.22]],
};

// Sim events that make a sound. Toast tones map to a soft blip so busy weeks stay quiet.
function soundFor(e) {
  switch (e.type) {
    case 'launch': return 'fanfare';
    case 'award': return 'award';
    case 'hire': return 'hire';
    case 'resign': return e.fired ? null : 'resign';
    case 'incident': return e.caught ? 'coin' : 'alarm';
    case 'officeUpgrade': return 'fanfare';
    case 'toast': return e.tone === 'bad' ? 'error' : 'blip';
    default: return null;
  }
}

const MIN_GAP_MS = { blip: 250, click: 30, alarm: 1500, error: 200 };

export function createAudio() {
  let ctx = null;
  let master = null;
  let volume = 0.7;
  const lastAt = {};

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }

  const onGesture = () => unlock();
  addEventListener('pointerdown', onGesture, { capture: true });
  addEventListener('keydown', onGesture, { capture: true });

  function play(name) {
    const notes = SOUNDS[name];
    if (!ctx || !notes || volume <= 0 || ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (lastAt[name] ?? -1e9) < (MIN_GAP_MS[name] ?? 60)) return;
    lastAt[name] = now;
    const t0 = ctx.currentTime + 0.005;
    for (const [at, freq, dur, wave, gain, endFreq] of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t0 + at);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + at + dur);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(g).connect(master);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.02);
    }
  }

  // UI cues arrive as window events so the UI needs no reference to this module.
  addEventListener('hitl:sfx', (e) => play(e.detail));
  addEventListener('click', (e) => { if (e.target?.closest?.('.hitl button, .hitl .tile')) play('click'); }, { capture: true });

  function onEvents(events) {
    if (!events?.length) return;
    // One sound per batch, the most notable one, so a busy week does not stack a chord.
    let best = null;
    const rank = ['blip', 'coin', 'error', 'hire', 'resign', 'alarm', 'award', 'fanfare'];
    for (const e of events) {
      const s = soundFor(e);
      if (s && (best === null || rank.indexOf(s) > rank.indexOf(best))) best = s;
    }
    if (best) play(best);
  }

  return {
    unlock,
    play,
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    },
    setMusic() {},
    onEvents,
  };
}
