// The game's real-time clock and event pacing. Pure (no DOM), shared by main.js and scripts/pace.js
// so the pacing simulator measures exactly what players experience.

// Real seconds per in-game week at 1x.
export const WEEK_SECONDS = 8.0;
// Paced events are released across this fraction of the week, leaving a quiet beat before the next tick.
export const SPREAD = 0.85;
// Events that land the moment they happen; everything else trickles out across the week.
export const IMMEDIATE = new Set(['decision', 'incident', 'launch', 'gameOver', 'officeUpgrade', 'standup', 'era', 'unlock', 'goal']);
// Longest frame step honoured, so a stalled tab cannot jump weeks but slow machines keep real time.
export const MAX_STEP = 0.25;
// How long a speech bubble stays up, in real seconds: long enough to read at a relaxed pace. Faster
// game speeds shorten it only a little, since reading speed does not change with the game's.
// The renderer, the pacer, and the pacing simulator all use this.
export const READ = { base: 1.8, perChar: 0.06, min: 2.5, max: 7 };
const READ_SPEED_FACTOR = (speed) => (speed >= 4 ? 0.6 : speed >= 2 ? 0.75 : 1);
export function readSeconds(text, speed = 1) {
  const n = typeof text === 'string' ? text.length : 0;
  const at1x = Math.min(READ.max, Math.max(READ.min, READ.base + READ.perChar * n));
  return at1x * READ_SPEED_FACTOR(speed);
}

// Spoken lines (`say`) are paced as conversation; everything else is spread across the week.
const isSay = (e) => e.type === 'say';
const isReply = (e) => isSay(e) && !!e.replyTo;

export function createPacer({ weekSeconds = WEEK_SECONDS } = {}) {
  let acc = 0;
  let gameT = 0; // game seconds since reset, only advancing while running
  let realT = 0; // real seconds since reset, always advancing
  let liveT = 0; // real seconds since reset while running; bubbles and conversations hold while paused
  let lastSpeed = 1;
  let paced = [];
  let dropped = []; // spoken lines that went stale waiting for their speaker
  const said = new Map(); // say id -> liveT when the line it answers may follow
  const speakerFree = new Map(); // staff id -> liveT when their bubble ends

  const busy = (e) => (speakerFree.get(e.staffId) ?? -Infinity) > liveT;

  // A spoken line goes out once its speaker's last bubble is gone and, for a reply, once the line
  // it answers has been up for its reading time.
  function sayReady(e) {
    if (busy(e)) return false;
    if (!isReply(e)) return true;
    if (paced.some((x) => x.e.id === e.replyTo)) return false;
    const readBy = said.get(e.replyTo);
    return readBy === undefined || liveT >= readBy;
  }

  function released(e) {
    if (!isSay(e)) return;
    const until = liveT + readSeconds(e.text, lastSpeed);
    said.set(e.id, until);
    if (e.text) speakerFree.set(e.staffId, until);
  }

  function prune() {
    const horizon = liveT - 2 * weekSeconds;
    for (const [k, v] of said) if (v < horizon) said.delete(k);
    for (const [k, v] of speakerFree) if (v < liveT) speakerFree.delete(k);
  }

  return {
    get acc() { return acc; },
    get progress() { return acc / weekSeconds; },
    get queued() { return paced.length; },
    get realT() { return realT; },
    get gameT() { return gameT; },
    get liveT() { return liveT; },

    reset() { acc = 0; gameT = 0; realT = 0; liveT = 0; paced = []; dropped = []; said.clear(); speakerFree.clear(); },

    // Advances the clocks by one frame. Returns true when a week is due (at most one per call).
    step(dt, { speed, running }) {
      const d = Math.min(MAX_STEP, dt);
      realT += d;
      if (!running || speed <= 0) return false;
      liveT += d;
      lastSpeed = speed;
      acc += d * speed;
      gameT += d * speed;
      if (acc < weekSeconds) return false;
      acc -= weekSeconds;
      return true;
    },

    // Takes a tick's events; returns what must be presented now (leftovers from last week first,
    // then this week's immediate events) and queues the rest across the week. A spoken line still
    // waiting carries into the new week once; after that it goes out with the leftovers, or is
    // dropped (see takeDropped) if its speaker is mid-bubble.
    schedule(events) {
      const now = [];
      const carried = [];
      for (const x of paced) {
        if (isSay(x.e) && !x.carried) carried.push({ ...x, at: 0, carried: true });
        else if (isSay(x.e) && busy(x.e)) dropped.push(x.e);
        else { now.push(x.e); released(x.e); }
      }
      paced = carried;
      const later = [];
      for (const e of events) (IMMEDIATE.has(e.type) ? now : later).push(e);
      // Replies wait on the line they answer, so only the rest take slots across the week.
      const slotted = later.filter((e) => !isReply(e));
      let k = 0;
      for (const e of later) {
        const at = isReply(e) ? 0 : slotted.length === 1 ? 0 : (k++ / slotted.length) * SPREAD;
        paced.push({ at, e });
      }
      prune();
      return now;
    },

    // Paced events whose moment has come.
    due() {
      const progress = acc / weekSeconds;
      const out = [];
      for (let i = 0; i < paced.length;) {
        const x = paced[i];
        if (x.at <= progress && (!isSay(x.e) || sayReady(x.e))) { paced.splice(i, 1); released(x.e); out.push(x.e); } else i++;
      }
      return out;
    },

    // Spoken lines dropped since the last call (nobody shows them; the pacing simulator counts them).
    takeDropped() {
      const out = dropped;
      dropped = [];
      return out;
    },
  };
}
