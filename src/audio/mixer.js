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
  const held = new Map(); // duck key -> count

  const user = { master: 1, muted: false, ...Object.fromEntries(BUS_IDS.map((b) => [b, 1])) };
  const ramp = (param, v, tc = 0.05) => param.setTargetAtTime(v, ctx.currentTime, tc);

  function applyUser() {
    ramp(master.gain, user.muted ? 0 : user.master);
    for (const id of BUS_IDS) ramp(bus[id].gain, BUSES[id].gain * user[id]);
  }

  function applyDuck() {
    let target = 1, attack = 0.3, release = 0.6;
    for (const [k, n] of held) if (n > 0 && DUCK[k]) { if (DUCK[k].music < target) { target = DUCK[k].music; attack = DUCK[k].attack; } }
    if (target === 1) { for (const [k] of held) if (DUCK[k]) release = Math.max(release, DUCK[k].release); }
    ramp(duck.gain, target, (target < 1 ? attack : release) / 3);
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
    duck(key, on) {
      held.set(key, Math.max(0, (held.get(key) ?? 0) + (on ? 1 : -1)));
      applyDuck();
    },
  };
}
