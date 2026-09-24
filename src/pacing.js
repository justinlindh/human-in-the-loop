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
// Real seconds a speech bubble stays up; matches the renderer's speech bubble.
export const BUBBLE_SECONDS = 3.2;

// Game seconds (real seconds at 1x) between a spoken line and the line that answers it.
export const replyDelay = (prevText) => 1.2 + 0.04 * (prevText?.length ?? 0);

// Spoken lines (`say`) are paced as conversation; everything else is spread across the week.
const isSay = (e) => e.type === 'say';
const isReply = (e) => isSay(e) && !!e.replyTo;

export function createPacer({ weekSeconds = WEEK_SECONDS } = {}) {
  let acc = 0;
  let gameT = 0; // game seconds since reset, only advancing while running
  let realT = 0; // real seconds since reset, always advancing
  let paced = [];
  let dropped = []; // spoken lines that went stale waiting for their speaker
  const said = new Map(); // say id -> { gameT, len } once released
  const speakerFree = new Map(); // staff id -> realT when their bubble ends

  const busy = (e) => (speakerFree.get(e.staffId) ?? -Infinity) > realT;

  // A spoken line goes out once its speaker's last bubble is gone and, for a reply, once the line
  // it answers has been up long enough to read.
  function sayReady(e) {
    if (busy(e)) return false;
    if (!isReply(e)) return true;
    if (paced.some((x) => x.e.id === e.replyTo)) return false;
    const prev = said.get(e.replyTo);
    return !prev || gameT >= prev.gameT + replyDelay({ length: prev.len });
  }

  function released(e) {
    if (!isSay(e)) return;
    said.set(e.id, { gameT, len: e.text?.length ?? 0 });
    if (e.text) speakerFree.set(e.staffId, realT + BUBBLE_SECONDS);
  }

  function prune() {
    const horizon = gameT - 2 * weekSeconds;
    for (const [k, v] of said) if (v.gameT < horizon) said.delete(k);
    for (const [k, v] of speakerFree) if (v < realT) speakerFree.delete(k);
  }

  return {
    get acc() { return acc; },
    get progress() { return acc / weekSeconds; },
    get queued() { return paced.length; },
    get realT() { return realT; },
    get gameT() { return gameT; },

    reset() { acc = 0; gameT = 0; realT = 0; paced = []; dropped = []; said.clear(); speakerFree.clear(); },

    // Advances the clocks by one frame. Returns true when a week is due (at most one per call).
    step(dt, { speed, running }) {
      const d = Math.min(MAX_STEP, dt);
      realT += d;
      if (!running || speed <= 0) return false;
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
