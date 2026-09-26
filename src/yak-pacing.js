import { B } from './sim/balance.js';

// This is also the Quieter Yak setting's definition of an important message.
export const importantChat = (m) => m.important === true || m.channel === 'incidents' || m.channel === 'wins' || (!m.fromId && String(m.from).startsWith('@'));

export function createYakPacer() {
  let now = 0, gameNow = 0, free = 0, pending = [];
  const omitted = new Map();
  const omit = (e) => { if (e.id) omitted.set(e.id, now); };
  function reserve(e) {
    const words = String(e.text ?? '').trim().split(/\s+/).filter(Boolean).length;
    free = now + Math.max(B.yakMinGapSeconds, words * B.readSecondsPerWord + B.yakReadingGapSeconds);
  }
  function prune(state) {
    const parents = new Set();
    const byId = new Map(pending.map(x => [x.e.id, x.e]));
    for (const { e } of pending) {
      if (!importantChat(e)) continue;
      let parent = e.replyTo;
      while (parent && !parents.has(parent)) {
        parents.add(parent);
        parent = byId.get(parent)?.replyTo;
      }
    }
    // A removed parent removes its ordinary replies too, so a thread never opens halfway through.
    for (let i = 0; i < pending.length;) {
      const x = pending[i];
      const ended = x.outage !== undefined && state
        && (!state.outage || x.outage !== (state.flags?.outageSeq ?? 0));
      const stale = now - x.at > B.yakMaxWaitSeconds || gameNow - x.gameAt > B.yakMaxWaitGameSeconds;
      if (ended || (!importantChat(x.e) && !parents.has(x.e.id) && (stale || omitted.has(x.e.replyTo)))) {
        omit(x.e); pending.splice(i, 1);
      } else i++;
    }
    for (const [id, at] of omitted) if (now - at > B.yakMemorySeconds) omitted.delete(id);
  }
  return {
    reset() { now = 0; gameNow = 0; free = 0; pending = []; omitted.clear(); },
    enqueue(events, { urgentIds = new Set(), state, gameTime = gameNow } = {}) {
      const urgent = [];
      for (const e of events) {
        if (e.type !== 'chat') continue;
        if (urgentIds.has(e.id)) { urgent.push(e); reserve(e); continue; }
        if (!importantChat(e) && pending.filter(x => !importantChat(x.e)).length >= B.yakPendingLimit) { omit(e); continue; }
        pending.push({ e, at: now, gameAt: gameTime, outage: state?.flags?.outageChat?.[e.id] });
      }
      return urgent;
    },
    step(dt, running, { gameTime = gameNow + (running ? dt : 0), state } = {}) {
      if (!running) return [];
      now += dt;
      gameNow = gameTime;
      prune(state);
      if (now < free || !pending.length) return [];
      let i = pending.findIndex(x => importantChat(x.e));
      if (i < 0) i = 0;
      // A priority reply still follows its parent when both are waiting.
      const seen = new Set();
      while (pending[i].e.replyTo && !seen.has(i)) {
        seen.add(i);
        const parent = pending.findIndex(x => x.e.id === pending[i].e.replyTo);
        if (parent < 0) break;
        i = parent;
      }
      const [{ e }] = pending.splice(i, 1);
      reserve(e);
      return [e];
    },
    get queued() { return pending.length; },
  };
}
