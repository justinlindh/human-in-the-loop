// Looping beds (the typing ambience). A loop starts at once on whatever buffer is ready (the
// placeholder on a fresh load) and crossfades to the delivered recording when it finishes decoding.

const SWAP_FADE = 1.0; // s

export function createLoops(ctx, loader, busOf) {
  const loops = new Map(); // id -> { src, gain, level, real }

  function startSource(id, buf, bus, real) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const meta = real ? loader.meta(id) : null;
    if (meta?.loopEnd) { const sr = loader.sampleRate(); src.loopStart = (meta.loopStart ?? 0) / sr; src.loopEnd = meta.loopEnd / sr; }
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain).connect(busOf(bus));
    src.start();
    return { src, gain };
  }

  function swapToReal(id, bus) {
    const l = loops.get(id);
    if (!l || l.real) return;
    const next = startSource(id, loader.get(id), bus, true);
    const t = ctx.currentTime;
    next.gain.gain.setTargetAtTime(Math.max(0.0001, l.level), t, SWAP_FADE / 3);
    l.gain.gain.setTargetAtTime(0.0001, t, SWAP_FADE / 3);
    l.src.stop(t + SWAP_FADE * 2);
    loops.set(id, { ...next, level: l.level, real: true });
  }

  return {
    set({ id, bus = 'ambience', gain, fade = 1 }) {
      let l = loops.get(id);
      if (!l) {
        if (gain <= 0) return;
        const real = loader.ready(id);
        const s = startSource(id, loader.get(id), bus, real);
        l = { ...s, level: gain, real };
        loops.set(id, l);
        if (!real) loader.whenReady(id, (ok) => { if (ok) swapToReal(id, bus); });
      }
      l.level = gain;
      l.gain.gain.setTargetAtTime(Math.max(0.0001, gain), ctx.currentTime, fade / 3);
    },
    state: (id) => { const l = loops.get(id); return l ? { real: l.real, level: l.level } : null; },
  };
}
