// Music night playback on the host side. The dance duck holds from the moment the command arrives;
// a delivered track that is still decoding gets up to WAIT_MS before the placeholder stands in. The
// duck releases, and the closing cheer (`after`, each `at` measured from the end) plays, when the
// buffer that actually plays ends. onended fires on the audio clock, so a suspended context waits.

const WAIT_MS = 3000;
const STEP_MS = 250;

export function createDance(ctx, loader, { duck, out, run, later = setTimeout }) {
  function play(c, waited = 0, onStart = null) {
    if (waited === 0) duck(c.duck, true);
    if (loader.meta(c.file)?.file && !loader.ready(c.file) && waited < WAIT_MS) {
      loader.preload([c.file]);
      later(() => play(c, waited + STEP_MS, onStart), STEP_MS);
      return null;
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = loader.get(c.file);
      const g = ctx.createGain();
      g.gain.value = c.gain;
      src.connect(g).connect(out());
      src.onended = () => {
        duck(c.duck, false);
        const end = ctx.currentTime;
        run((c.after ?? []).map((x) => ({ ...x, at: end + x.at })));
      };
      src.startAt = Math.max(ctx.currentTime, c.at + waited / 1000);
      src.start(src.startAt);
      onStart?.(src);
      return src;
    } catch {
      duck(c.duck, false);
      return null;
    }
  }
  return { play };
}
