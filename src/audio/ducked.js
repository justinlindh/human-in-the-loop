// A sound that holds a music duck for exactly as long as its buffer plays: stingers and the music
// night track. The hold starts when the command arrives and ends at the start time plus the length
// of the buffer that actually plays, all on the audio clock. With `wait`, a delivered file that is
// still decoding gets up to WAIT_MS before the placeholder plays.
//
// `after` commands (the dancers' cheer) are timed from the end, each `at` measured from it. They
// wait in a queue that pump() releases shortly before they are due, so a pause can hold them.
// A pausable sound (the dance track) stops on pause() and resumes from the same spot on resume();
// its duck holds through the pause and its queued `after` moves with it.

const WAIT_MS = 3000;
const STEP_MS = 250;
const LOOKAHEAD = 0.2;   // s before an `after` command is due that it gets scheduled

export function createDucked(ctx, loader, { mix, out, run, later = setTimeout }) {
  const active = new Set();   // pausable playbacks: { c, holdId, buffer, startAt, offset, src, paused, end }
  let queue = [];             // { at, cmds, owner }
  let paused = false;

  function startSource(pb, at) {
    const src = ctx.createBufferSource();
    src.buffer = pb.buffer;
    const g = ctx.createGain();
    g.gain.value = pb.c.gain;
    src.connect(g).connect(out(pb.c));
    src.startAt = at;
    src.start(at, pb.offset);
    pb.src = src;
    pb.startAt = at;
    pb.end = at + pb.buffer.duration - pb.offset;
    mix.endHold(pb.holdId, pb.end);
    if (pb.c.after?.length) queue.push({ at: pb.end, cmds: pb.c.after, owner: pb });
    if (!pb.started) { pb.started = true; pb.onStart?.(src); }
    return src;
  }

  function play(c, { wait = false, pausable = false, onStart = null } = {}, waited = 0, holdId = null) {
    const id = holdId ?? mix.hold(c.duck, ctx.currentTime);
    if (wait && loader.meta(c.file)?.file && !loader.ready(c.file) && waited < WAIT_MS) {
      loader.preload([c.file]);
      later(() => play(c, { wait, pausable, onStart }, waited + STEP_MS, id), STEP_MS);
      return null;
    }
    try {
      const pb = { c, holdId: id, buffer: loader.get(c.file), offset: 0, paused: false, pausable, onStart, started: false };
      if (pausable) active.add(pb);
      const at = Math.max(ctx.currentTime, c.at + waited / 1000);
      if (pausable && paused) { pb.paused = true; pb.startAt = at; mix.endHold(id, Infinity); return null; }
      return startSource(pb, at);
    } catch {
      mix.endHold(id, ctx.currentTime);
      return null;
    }
  }

  return {
    play,
    // Releases queued `after` commands that are nearly due, with absolute times. Call every frame.
    pump() {
      const now = ctx.currentTime;
      const due = queue.filter((q) => q.at - now <= LOOKAHEAD);
      if (!due.length) return;
      queue = queue.filter((q) => !due.includes(q));
      for (const q of due) {
        if (q.owner) active.delete(q.owner);
        run(q.cmds.map((x) => ({ ...x, at: Math.max(now, q.at) + x.at })));
      }
      for (const pb of active) if (!pb.paused && pb.end <= now) active.delete(pb);
    },
    pause() {
      if (paused) return;
      paused = true;
      const now = ctx.currentTime;
      for (const pb of active) {
        if (pb.paused || !pb.src) continue;
        pb.offset = Math.min(pb.buffer.duration, pb.offset + Math.max(0, now - pb.startAt));
        try { pb.src.stop(now); } catch { /* not started yet */ }
        pb.src = null;
        pb.paused = true;
        mix.endHold(pb.holdId, Infinity);
        queue = queue.filter((q) => q.owner !== pb);
      }
    },
    resume() {
      if (!paused) return;
      paused = false;
      for (const pb of active) {
        if (!pb.paused) continue;
        pb.paused = false;
        startSource(pb, Math.max(ctx.currentTime, pb.startAt));
      }
    },
    get paused() { return paused; },
  };
}
