// The presentation clock: what the player sees (toast queue and lifetimes, reveals, call turns, peeks,
// HUD throttles) is timed by the frames the host draws, not by the wall clock, so a stalled machine
// shows the same sequence a fast one does. The host calls `pTick(dtMs)` once per frame with a capped
// delta. Input-only timers (tooltips, confirm holds, focus) stay on the wall clock.
let now = 0;
let seq = 0;
let pending = [];

export const pnow = () => now;

// Runs fn after ms of presentation time; returns a handle for pClear.
export function pAfter(ms, fn) {
  const h = { id: ++seq, at: now + Math.max(0, ms), fn };
  pending.push(h);
  return h;
}

export function pClear(h) {
  if (!h) return;
  pending = pending.filter((p) => p !== h);
}

export function pTick(dtMs) {
  now += Math.max(0, dtMs);
  // A callback may schedule more; run whatever is due in time order until nothing is.
  for (;;) {
    let next = null;
    for (const p of pending) if (p.at <= now && (!next || p.at < next.at || (p.at === next.at && p.id < next.id))) next = p;
    if (!next) return;
    pending = pending.filter((p) => p !== next);
    next.fn();
  }
}

export function pReset() { now = 0; pending = []; }
