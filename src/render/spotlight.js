// Spotlights: the fun staged moments the game clock holds for. main.js reads current() every frame
// (renderer.spotlight()) and stops ticking while one plays; the office, the moment and the sound go on.
// Routine life (standups, coffee, pair games) never spotlights.
//
// createSpotlights() -> { begin(kind, cut, expect, at), end(key), current(), where(), cut(), clear() }
//   begin  a moment starts: kind is its hitl:moment key ('printer_jam', 'waffle_party'), cut ends it
//          early (the Skip control), expect is how long it should play in seconds (a number, or a
//          function for a moment whose length changes as it goes), at where it plays (a function
//          returning { x, z }). Returns the spotlight's own key.
//   end    it ended (its own end, or cut): safe to call twice.
//   current() -> null | { kind, key, since, expectedSeconds }: the oldest spotlight still playing.
//   where() -> null | { x, z }: where the current one plays, for quieting chatter round it.
//   cut()  ends the current one early; false when none plays.
// Every start and end is announced: window event hitl:spotlight { active, kind, key }.

import { MOMENT_KINDS } from './spotlight-kinds.js';

export function createSpotlights({ camera = null } = {}) {
  const live = new Map();
  let seq = 0;
  let cameraKey = null;
  function focus() {
    const s = live.values().next().value;
    if (cameraKey === (s?.key ?? null)) return;
    if (cameraKey) camera?.release(cameraKey);
    cameraKey = s?.key ?? null;
    if (s?.at) camera?.hold(s.key, s.at, { zoom: MOMENT_KINDS[s.kind]?.zoom ?? 1.8 });
  }
  const announce = (active, s) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hitl:spotlight', { detail: { active, kind: s.kind, key: s.key, caption: MOMENT_KINDS[s.kind]?.caption } }));
  };
  function begin(kind, cut = null, expect = null, at = null, alive = null) {
    if (!MOMENT_KINDS[kind]?.spotlight) return null;
    const s = { kind, key: `${kind}-${++seq}`, since: typeof performance !== 'undefined' ? performance.now() : 0, cut, expect, at, alive };
    live.set(s.key, s);
    focus();
    announce(true, s);
    return s.key;
  }
  function end(key) {
    const s = key && live.get(key);
    if (!s) return;
    live.delete(key);
    focus();
    announce(false, s);
  }
  function current() {
    const s = live.values().next().value;
    if (!s) return null;
    const e = typeof s.expect === 'function' ? s.expect() : s.expect;
    return { kind: s.kind, key: s.key, since: s.since, caption: MOMENT_KINDS[s.kind]?.caption, ...(Number.isFinite(e) ? { expectedSeconds: e } : {}) };
  }
  function where() {
    const s = live.values().next().value;
    return s?.at?.() ?? null;
  }
  function cut() {
    const s = live.values().next().value;
    if (!s) return false;
    s.cut?.();
    end(s.key);
    return true;
  }
  function update() { for (const s of [...live.values()]) if (s.alive && !s.alive()) end(s.key); }
  function clear() { for (const k of [...live.keys()]) end(k); }
  return { begin, end, current, where, cut, clear, update };
}
