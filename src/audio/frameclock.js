// The director's clock: virtual seconds that advance only by the host's per-frame dt, so cue
// admission, cooldowns and music timing depend on game frames and never on how long the machine
// stalled. AudioContext time is used only to place sounds: toAudio maps a virtual time to the
// context time it should sound at.

const MAX_DT = 0.25;

export function createFrameClock() {
  let vt = 0;
  let ct = 0;
  return {
    get now() { return vt; },
    // A frame: advance virtual time by dt and note the context time it corresponds to.
    advance(dt, ctxTime) {
      if (Number.isFinite(dt) && dt > 0) vt += Math.min(dt, MAX_DT);
      if (Number.isFinite(ctxTime)) ct = ctxTime;
    },
    toAudio: (v) => ct + (v - vt),
    fromAudio: (a) => vt + (a - ct),
    // Commands from the director carry frame-time `at`; the host plays them at context time.
    // Music commands already carry context time.
    mapCommands(cmds) {
      return cmds.map((c) => (Number.isFinite(c.at) && c.op !== 'music' ? { ...c, at: ct + (c.at - vt) } : c));
    },
  };
}
