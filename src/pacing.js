// The game's real-time clock and event pacing. Pure (no DOM), shared by main.js and scripts/pace.js
// so the pacing simulator measures exactly what players experience.

// Real seconds per in-game week at 1x.
export const WEEK_SECONDS = 5.0;
// Paced events are released across this fraction of the week, leaving a quiet beat before the next tick.
export const SPREAD = 0.85;
// Events that land the moment they happen; everything else trickles out across the week.
export const IMMEDIATE = new Set(['decision', 'incident', 'launch', 'gameOver', 'officeUpgrade', 'standup', 'era', 'unlock', 'goal']);
// Longest frame step honoured, so a stalled tab cannot jump weeks but slow machines keep real time.
export const MAX_STEP = 0.25;

export function createPacer({ weekSeconds = WEEK_SECONDS } = {}) {
  let acc = 0;
  let paced = [];

  return {
    get acc() { return acc; },
    get progress() { return acc / weekSeconds; },
    get queued() { return paced.length; },

    reset() { acc = 0; paced = []; },

    // Advances game time by one frame. Returns true when a week is due (at most one per call).
    step(dt, { speed, running }) {
      if (!running || speed <= 0) return false;
      acc += Math.min(MAX_STEP, dt) * speed;
      if (acc < weekSeconds) return false;
      acc -= weekSeconds;
      return true;
    },

    // Takes a tick's events; returns what must be presented now (leftovers from last week first,
    // then this week's immediate events) and queues the rest across the week.
    schedule(events) {
      const now = paced.map((x) => x.e);
      paced = [];
      const later = [];
      for (const e of events) (IMMEDIATE.has(e.type) ? now : later).push(e);
      later.forEach((e, i) => paced.push({ at: later.length === 1 ? 0 : (i / later.length) * SPREAD, e }));
      return now;
    },

    // Paced events whose moment in the week has come.
    due() {
      const out = [];
      while (paced.length && paced[0].at <= acc / weekSeconds) out.push(paced.shift().e);
      return out;
    },
  };
}
