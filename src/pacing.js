import { B } from './sim/balance.js';

// The game's real-time clock and event pacing. Pure (no DOM), shared by main.js and scripts/pace.js
// so the pacing simulator measures exactly what players experience.

// Real seconds per in-game week at 1x.
export const WEEK_SECONDS = 8.0;
// Paced events are released across this fraction of the week, leaving a quiet beat before the next tick.
export const SPREAD = 0.85;
// Events that land the moment they happen; everything else trickles out across the week.
export const IMMEDIATE = new Set(['decision', 'incident', 'launch', 'gameOver', 'officeUpgrade', 'standup', 'era', 'unlock', 'goal', 'incidentResolved']);
// Seconds per logic step of the game loop (createFrameClock). Small enough that no step spans a pacer
// boundary that matters (a week is at least two seconds), large enough that a slow frame's catch-up
// stays a few dozen steps. A power of two, so the clocks sum it without rounding error and a week
// ends on the step that reaches it.
export const LOGIC_STEP = 1 / 64;
// The most real time one frame may replay. A stalled or hidden tab resumes with this much at most, so
// coming back to it cannot jump weeks; frame rates under 1 / MAX_CATCHUP per second lose the rest.
export const MAX_CATCHUP = 1;

// Turns real frame time into whole fixed logic steps, so game time follows the wall clock at any frame
// rate: a slow machine runs several steps per frame instead of losing the time.
export function createFrameClock({ step = LOGIC_STEP, maxCatchup = MAX_CATCHUP } = {}) {
  let acc = 0;
  return {
    step,
    // Adds a frame's real seconds; returns how many whole steps to run now.
    advance(realSeconds) {
      acc += Math.min(Math.max(Number(realSeconds) || 0, 0), maxCatchup);
      const n = Math.floor(acc / step + 1e-9);
      acc = Math.max(0, acc - n * step);
      return n;
    },
    // Drops the time not yet stepped (the page came back to view, a new game began).
    reset() { acc = 0; },
    get pending() { return acc; },
  };
}

// Longest single pacer step honoured, so a stalled tab cannot jump weeks but slow machines keep real time.
export const MAX_STEP = 0.25;
// How long a speech bubble stays up, in real seconds: long enough to read at a relaxed pace. Faster
// game speeds shorten it a little, but never below the time it takes to read the line
// (readFloorSeconds + chars / readCharsPerSecond), since reading speed does not change with the game's.
// The renderer, the pacer, and the pacing simulator all use this.
const READ_SPEED_FACTOR = (speed) => (speed >= 4 ? B.readSpeedFactor4x : speed >= 2 ? B.readSpeedFactor2x : 1);
export function readSeconds(text, speed = 1) {
  const n = typeof text === 'string' ? text.length : 0;
  const at1x = Math.min(B.readMaxSeconds, Math.max(B.readMinimumSeconds, B.readBaseSeconds + B.readSecondsPerChar * n));
  const reading = Math.min(B.readMaxSeconds, B.readFloorSeconds + n / B.readCharsPerSecond);
  const words = typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  return Math.max(at1x * READ_SPEED_FACTOR(speed), reading, B.readMinimumSeconds + B.readFadeSeconds, words * B.readSecondsPerWord + B.readFadeSeconds);
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
        if (isSay(x.e) && (x.e.moment || !x.carried)) carried.push({ ...x, at: 0, carried: true });
        else if (isSay(x.e) && busy(x.e)) dropped.push(x.e);
        else { now.push(x.e); released(x.e); }
      }
      paced = carried;
      // The renderer paces moment dialogue while the decision or spotlight holds the sim clock.
      const later = [];
      for (const e of events) (IMMEDIATE.has(e.type) || (isSay(e) && e.moment) ? now : later).push(e);
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

// The attention clock. The sim proposes asks (state.asks); this decides, in running real seconds, when
// the player sees one. Pure: the caller feeds it frame time and what is open, and dispatches what it
// returns (presentAsk for `present`, expireAsk for each id in `expire`).
//
// Every number is in running play seconds, so a paused game or an open modal never spends them.
export const ATTENTION_DEFAULTS = {
  gap: 90,            // least play seconds between one ask opening and the next
  quiet: 45,          // least play seconds after any modal or beat closes before an ask opens
  expiry: 180,        // play seconds a non-emergency ask may wait before it takes its default
  momentWindow: 300,  // one staged moment per this many play seconds
  momentCap: 25,      // longest a staged moment may hold the clock
  watchWindow: 600,   // every window holds a stretch with no ask and no beat ...
  watchStretch: 180,  // ... this long
};
const RANK = { emergency: 0, normal: 1, low: 2 };

export function createAttention(cfg = {}) {
  const c = { ...ATTENTION_DEFAULTS, ...cfg };
  let t, lastAsk, lastClose, lastEvent, lastMoment, wasModal, windowStart, watched, waited;
  function reset() {
    t = 0; lastAsk = -Infinity; lastClose = -Infinity; lastEvent = -Infinity; lastMoment = -Infinity;
    wasModal = false; windowStart = 0; watched = false; waited = new Map();
  }
  reset();

  // Quiet play so far inside the current window.
  const stretch = () => t - Math.max(lastEvent, windowStart);
  const quietOver = () => t - lastClose >= c.quiet;

  return {
    config: c,
    reset,
    get playSeconds() { return t; },
    // True when a card or other non-urgent popup may open: nothing is open and the quiet is over.
    quietOk(modal = false) { return !modal && quietOver(); },
    // A beat (launch card, era, staged moment) opened or closed just now.
    beat() { lastEvent = t; lastClose = t; },
    // Staged moments: one per window.
    momentReady() { return t - lastMoment >= c.momentWindow; },
    momentBegun() { lastMoment = t; this.beat(); },
    get momentCap() { return c.momentCap; },
    // One frame. `dt` real seconds; `running` the clock is running; `speed` the game speed; `realTime`
    // keeps every gap in real seconds at any speed (off, they shrink with speed). `modal` a pausing
    // beat (a decision or one of the game's own cards) is up; the player's own menus are not beats.
    // `held` a staged moment holds the clock: time passes for the gaps, not for expiry. `askOpen` any ask
    // is open and `decisionOpen` a decision is; only a decision blocks an emergency. `asks` the
    // candidates ({ id, priority }) in sim order; `expiry` expiry is on.
    tick(dt, { running = true, held = false, speed = 1, realTime = true, modal = false, askOpen = false, decisionOpen = false, asks = [], expiry = true } = {}) {
      const step = realTime ? dt : dt * Math.max(speed, 0);
      if (running || held) t += step;
      if (modal && !wasModal) lastEvent = t;
      if (!modal && wasModal) lastClose = t;
      wasModal = modal;
      // A held moment is a beat in progress: its quiet runs from the end of the hold, and it is not a watching stretch.
      if (modal || held) lastEvent = t;
      if (held) lastClose = t;

      // The watching stretch: a window rolls over once it has run its length.
      if (stretch() >= c.watchStretch) watched = true;
      if (t - windowStart >= c.watchWindow) { windowStart = t; watched = false; }

      const ids = new Set(asks.map((a) => a.id));
      for (const id of [...waited.keys()]) if (!ids.has(id)) waited.delete(id);
      const out = { present: null, expire: [] };
      for (const a of asks) {
        if (!waited.has(a.id)) waited.set(a.id, 0);
        if (a.priority === 'emergency') continue;
        if (running) waited.set(a.id, waited.get(a.id) + step);
        if (expiry && waited.get(a.id) >= c.expiry) out.expire.push(a.id);
      }
      if (!running || modal || decisionOpen || !asks.length || !quietOver()) return out;
      const head = asks.filter((a) => !out.expire.includes(a.id))
        .sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1))[0];
      if (!head) return out;
      if (head.priority !== 'emergency') {
        if (askOpen) return out;
        if (t - lastAsk < c.gap) return out;
        // The end of a window stays clear when it has had no watching stretch yet.
        if (!watched && t - windowStart >= c.watchWindow - c.watchStretch && stretch() < c.watchStretch) return out;
      }
      out.present = head.id;
      lastAsk = t; lastEvent = t;
      return out;
    },
  };
}
