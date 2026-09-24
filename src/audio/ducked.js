// A sound that holds a music duck for exactly as long as its buffer plays: stingers and the music
// night track. The hold starts when the command arrives and ends at the start time plus the length
// of the buffer that actually plays, all on the audio clock. With `wait`, a delivered file that is
// still decoding gets up to WAIT_MS before the placeholder plays. `after` commands (the dancers'
// cheer) are scheduled from that same end, each `at` measured from it.

const WAIT_MS = 3000;
const STEP_MS = 250;

export function createDucked(ctx, loader, { mix, out, run, later = setTimeout }) {
  function play(c, { wait = false, onStart = null } = {}, waited = 0, holdId = null) {
    const id = holdId ?? mix.hold(c.duck, ctx.currentTime);
    if (wait && loader.meta(c.file)?.file && !loader.ready(c.file) && waited < WAIT_MS) {
      loader.preload([c.file]);
      later(() => play(c, { wait, onStart }, waited + STEP_MS, id), STEP_MS);
      return null;
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = loader.get(c.file);
      const g = ctx.createGain();
      g.gain.value = c.gain;
      src.connect(g).connect(out(c));
      src.startAt = Math.max(ctx.currentTime, c.at + waited / 1000);
      src.start(src.startAt);
      const end = src.startAt + src.buffer.duration;
      mix.endHold(id, end);
      if (c.after?.length) run(c.after.map((x) => ({ ...x, at: end + x.at })));
      onStart?.(src);
      return src;
    } catch {
      mix.endHold(id, ctx.currentTime);
      return null;
    }
  }
  return { play };
}
