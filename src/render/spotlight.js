// Spotlights: the fun staged moments the game clock holds for. main.js reads current() every frame
// (renderer.spotlight()) and stops ticking while one plays; the office, the moment and the sound go on.
// Routine life (standups, coffee, pair games) never spotlights.
//
// createSpotlights() -> { begin(kind, cut), end(key), current(), cut(), clear() }
//   begin  a moment starts: kind is its hitl:moment key ('printer_jam', 'waffle_party'), cut ends it
//          early (the Skip control). Returns the spotlight's own key.
//   end    it ended (its own end, or cut): safe to call twice.
//   current() -> null | { kind, key, since }: the oldest spotlight still playing.
//   cut()  ends the current one early; false when none plays.
// Every start and end is announced: window event hitl:spotlight { active, kind, key }.

export function createSpotlights() {
  const live = new Map();
  let seq = 0;
  const announce = (active, s) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hitl:spotlight', { detail: { active, kind: s.kind, key: s.key } }));
  };
  function begin(kind, cut = null) {
    const s = { kind, key: `${kind}-${++seq}`, since: typeof performance !== 'undefined' ? performance.now() : 0, cut };
    live.set(s.key, s);
    announce(true, s);
    return s.key;
  }
  function end(key) {
    const s = key && live.get(key);
    if (!s) return;
    live.delete(key);
    announce(false, s);
  }
  function current() {
    const s = live.values().next().value;
    return s ? { kind: s.kind, key: s.key, since: s.since } : null;
  }
  function cut() {
    const s = live.values().next().value;
    if (!s) return false;
    s.cut?.();
    end(s.key);
    return true;
  }
  function clear() { for (const k of [...live.keys()]) end(k); }
  return { begin, end, current, cut, clear };
}
