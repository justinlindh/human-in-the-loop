import { B } from '../sim/balance.js';

// Observe transitions, never replay a loaded person's career. The queue holds at most one
// celebration per person; a Legend beat includes any other milestone reached in the same tick.
export function createGrowthMoments() {
  let owner = null;
  const seen = new Map(), pending = new Map();
  function sync(state) {
    if (owner !== state) { owner = state; seen.clear(); pending.clear(); }
    const present = new Set();
    for (const p of state.staff) {
      present.add(p.id);
      const before = seen.get(p.id);
      if (before) {
        const kind = !before.legend && p.legend ? 'legend'
          : before.level < B.maxLevel && p.level >= B.maxLevel ? 'top_level'
          : !before.path && p.path ? 'promotion' : null;
        if (kind) pending.set(p.id, { staffId: p.id, kind });
      }
      seen.set(p.id, { path: p.path, legend: p.legend, level: p.level });
    }
    for (const id of seen.keys()) if (!present.has(id)) { seen.delete(id); pending.delete(id); }
  }
  function take(ready) {
    for (const [id, value] of pending) if (ready(id)) { pending.delete(id); return value; }
    return null;
  }
  return { sync, take };
}
