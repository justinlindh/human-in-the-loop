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
// Real seconds a speech bubble stays up; matches the renderer's chat bubble.
export const BUBBLE_SECONDS = 3.2;

// Game seconds (real seconds at 1x) between a chat line and the next turn of its conversation.
export const replyDelay = (prevText) => 1.2 + 0.04 * (prevText?.length ?? 0);

// A chat line's conversation: replies point at their thread's root.
const threadOf = (e) => e.replyTo ?? e.id;
const isReply = (e) => e.type === 'chat' && !!e.replyTo;

export function createPacer({ weekSeconds = WEEK_SECONDS } = {}) {
  let acc = 0;
  let gameT = 0; // game seconds since reset, only advancing while running
  let realT = 0; // real seconds since reset, always advancing
  let paced = [];
  let quiet = []; // overdue chat lines whose speaker is still talking: shown in the feed, not as bubbles
  const lastTurn = new Map(); // thread id -> { gameT, len } of its latest released line
  const speakerFree = new Map(); // staff id -> realT when their bubble ends

  // A chat line may go out once its speaker's last bubble is gone and, for a reply, once the
  // previous turn has been up long enough to read.
  function chatReady(x, i) {
    const e = x.e;
    if (e.fromId && (speakerFree.get(e.fromId) ?? -Infinity) > realT) return false;
    if (!isReply(e)) return true;
    const thread = threadOf(e);
    for (let j = 0; j < i; j++) if (paced[j].e.type === 'chat' && threadOf(paced[j].e) === thread) return false;
    const prev = lastTurn.get(thread);
    return !prev || gameT >= prev.gameT + replyDelay({ length: prev.len });
  }

  function released(e) {
    if (e.type !== 'chat') return;
    lastTurn.set(threadOf(e), { gameT, len: e.text?.length ?? 0 });
    if (e.fromId && e.text) speakerFree.set(e.fromId, realT + BUBBLE_SECONDS);
  }

  function prune() {
    const horizon = gameT - 2 * weekSeconds;
    for (const [k, v] of lastTurn) if (v.gameT < horizon) lastTurn.delete(k);
    for (const [k, v] of speakerFree) if (v < realT) speakerFree.delete(k);
  }

  return {
    get acc() { return acc; },
    get progress() { return acc / weekSeconds; },
    get queued() { return paced.length; },
    get realT() { return realT; },
    get gameT() { return gameT; },

    reset() { acc = 0; gameT = 0; realT = 0; paced = []; quiet = []; lastTurn.clear(); speakerFree.clear(); },

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
    // then this week's immediate events) and queues the rest across the week. Chat still waiting
    // on a conversation carries into the new week once; after that it goes out with the leftovers,
    // or quietly (see takeQuiet) if its speaker is mid-bubble.
    schedule(events) {
      const now = [];
      const carried = [];
      for (const x of paced) {
        if (x.e.type === 'chat' && !x.carried) carried.push({ ...x, at: 0, carried: true });
        else if (x.e.type === 'chat' && x.e.fromId && (speakerFree.get(x.e.fromId) ?? -Infinity) > realT) quiet.push(x.e);
        else { now.push(x.e); released(x.e); }
      }
      paced = carried;
      const later = [];
      for (const e of events) (IMMEDIATE.has(e.type) ? now : later).push(e);
      // Replies wait on their conversation, so only the rest take slots across the week.
      const slotted = later.filter((e) => !isReply(e));
      let k = 0;
      for (const e of later) {
        const at = isReply(e) ? 0 : slotted.length === 1 ? 0 : (k++ / slotted.length) * SPREAD;
        paced.push({ at, e });
      }
      prune();
      return now;
    },

    // Chat lines that went out without a bubble since the last call (the feed shows them; the
    // office does not, so one speaker never has two bubbles up).
    takeQuiet() {
      const out = quiet;
      quiet = [];
      return out;
    },

    // Paced events whose moment has come.
    due() {
      const progress = acc / weekSeconds;
      const out = [];
      for (let i = 0; i < paced.length;) {
        const x = paced[i];
        const ok = x.at <= progress && (x.e.type !== 'chat' || chatReady(x, i));
        if (ok) { paced.splice(i, 1); released(x.e); out.push(x.e); } else i++;
      }
      return out;
    },
  };
}
