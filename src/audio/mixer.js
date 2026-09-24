// The WebAudio graph: sources -> bus gain -> master -> gentle compressor -> destination.
// The music bus runs through a lowpass (pauses, lockdown), a level gain, and a duck gain.

import { BUSES, BUS_IDS, DUCK } from './manifest.js';

export function createMixer(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
  const master = ctx.createGain();
  master.connect(comp).connect(ctx.destination);
  const bus = {};
  for (const id of BUS_IDS) {
    bus[id] = ctx.createGain();
    bus[id].gain.value = BUSES[id].gain;
    bus[id].connect(master);
  }
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 20000;
  const level = ctx.createGain();
  const duck = ctx.createGain();
  lowpass.connect(level).connect(duck).connect(bus.music);
  const user = { master: 1, muted: false, ...Object.fromEntries(BUS_IDS.map((b) => [b, 1])) };
  const ramp = (param, v, tc = 0.05) => param.setTargetAtTime(v, ctx.currentTime, tc);

  function applyUser() {
    ramp(master.gain, user.muted ? 0 : user.master);
    for (const id of BUS_IDS) ramp(bus[id].gain, BUSES[id].gain * user[id]);
  }

  // Music ducks are intervals on the audio clock: { key, from, to } (to may be Infinity until the
  // sound's length is known). The duck gain is scheduled from their union: the deepest duck covering
  // a moment wins, going down at that duck's attack and back up at the release of the one ending.
  // Overlapping holds extend the duck rather than deepen it. Nothing waits on a timer or an event.
  const holds = new Map(); // id -> { key, from, to }
  let nextHold = 1;

  function scheduleDuck() {
    const now = ctx.currentTime;
    for (const [id, h] of holds) if (h.to < now - 10) holds.delete(id);
    const g = duck.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
    else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
    const all = [...holds.values()];
    const times = [...new Set([now, ...all.flatMap((h) => [h.from, h.to]).filter((t) => t > now && Number.isFinite(t))])].sort((x, y) => x - y);
    const deepest = (covers) => {
      let target = 1, attack = 0.3;
      for (const h of all) if (covers(h) && DUCK[h.key] && DUCK[h.key].music < target) { target = DUCK[h.key].music; attack = DUCK[h.key].attack; }
      return { target, attack };
    };
    // What was in effect just before now, so a release at now fades up rather than jumps.
    let prev = deepest((h) => h.from < now && h.to >= now).target;
    for (const t of times) {
      const { target, attack } = deepest((h) => h.from <= t && t < h.to);
      if (target === prev) continue;
      const ending = all.filter((h) => h.to === t && DUCK[h.key]).map((h) => DUCK[h.key].release);
      const tc = (target > prev ? (ending.length ? Math.max(...ending) : 0.6) : attack) / 3;
      g.setTargetAtTime(target, t, tc);
      prev = target;
    }
  }

  return {
    bus,
    output: comp,
    musicIn: lowpass,
    setUser(key, v) { if (key === 'muted') user.muted = !!v; else if (key in user) user[key] = Math.max(0, Math.min(1, Number(v) || 0)); applyUser(); },
    musicMix({ level: lv = 1, lowpass: lp = null, fade = 0.4 }) {
      ramp(level.gain, lv, fade / 3);
      ramp(lowpass.frequency, lp ?? 20000, fade / 3);
    },
    // The music duck's current gain (1 = not ducked).
    get duckLevel() { return duck.gain.value; },
    // Holds the music duck `key` from `from` to `to` (audio clock seconds); returns the hold's id.
    hold(key, from = ctx.currentTime, to = Infinity) {
      const id = nextHold++;
      holds.set(id, { key, from, to });
      scheduleDuck();
      return id;
    },
    // Sets when a hold ends (its sound's length is known now, or its release came in).
    endHold(id, to = ctx.currentTime) {
      const h = holds.get(id);
      if (!h) return;
      h.to = Math.max(h.from, to);
      scheduleDuck();
    },
  };
}
