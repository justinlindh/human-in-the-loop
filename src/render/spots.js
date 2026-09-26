// One diagnostic store per office, shared by props and moments. Each search replaces its previous
// record, so a long-running game retains searches, not a frame-by-frame history.
const offices = new WeakMap();
export function spotDebug(office) {
  let debug = offices.get(office);
  if (!debug) { debug = { spots: Object.create(null) }; offices.set(office, debug); }
  return debug;
}

// Ring order is significant: the first passing candidate wins unless a score is supplied.
export function* spotRing(center, { radii, count = 12, start = 0, centerFirst = false }) {
  if (centerFirst) yield center;
  for (const radius of radii) {
    const n = typeof count === 'function' ? count(radius) : count;
    for (let i = 0; i < n; i++) {
      const angle = start + (i / n) * Math.PI * 2;
      yield { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
    }
  }
}

const point = (q) => q == null ? null : Object.fromEntries(['x', 'y', 'z', 'yaw'].filter((k) => Number.isFinite(q[k])).map((k) => [k, q[k]]));

// Checks return true or a reason (false uses the check's name). Candidates may carry extra fields
// such as a partner or a desk rectangle; the selected object is returned intact. Lower scores win,
// ties keep input order. A first-fit success or a declared minimum score stops enumeration.
export function pickSpot(center, { candidates, ring, needs = [], checks = {}, score = null, minScore = -Infinity, fallback = null, debug, moment, search = 'spot' }) {
  for (const need of needs) if (typeof checks[need] !== 'function') throw new Error(`Unknown spot requirement: ${need}`);
  const record = { search, center: point(center), candidates: [], selected: null, fallback: false };
  let best = null, bestScore = Infinity, bestIndex = -1;
  for (const q of candidates ?? spotRing(center, ring)) {
    const reasons = [];
    for (const need of needs) {
      const result = checks[need](q);
      if (result !== true) { reasons.push(typeof result === 'string' ? result : need); break; }
    }
    const value = reasons.length ? null : score ? score(q) : 0;
    if (value !== null && !Number.isFinite(value)) reasons.push('no finite score');
    const row = { ...point(q), reasons, score: Number.isFinite(value) ? value : null };
    if (q.partner) row.partner = point(q.partner);
    record.candidates.push(row);
    if (reasons.length || value >= bestScore) continue;
    best = q; bestScore = value; bestIndex = record.candidates.length - 1;
    if (!score || bestScore <= minScore) break;
  }
  for (let i = 0; i < record.candidates.length; i++) {
    const row = record.candidates[i];
    if (!row.reasons.length && i !== bestIndex) row.reasons.push('lower-ranked candidate');
  }
  if (!best) {
    best = typeof fallback === 'function' ? fallback() : fallback;
    record.fallback = best != null;
  }
  record.selected = point(best);
  record.selectedIndex = bestIndex;
  if (debug && moment) {
    const searches = debug.spots[moment] ??= Object.create(null);
    searches[search] = record;
  }
  return best;
}

// Compact failure output; the complete candidate list remains in the JSON diagnostics.
export function spotReasons(spots) {
  const lines = [];
  for (const [moment, searches] of Object.entries(spots ?? {})) for (const r of Object.values(searches)) {
    const counts = new Map();
    for (const q of r.candidates) for (const why of q.reasons) counts.set(why, (counts.get(why) ?? 0) + 1);
    const selected = r.selected ? JSON.stringify(r.selected) : 'none';
    lines.push(`${moment}/${r.search}: ${r.candidates.length} candidates; selected ${selected}${r.fallback ? ' (fallback)' : ''}; ${[...counts].map(([why, n]) => `${why}: ${n}`).join(', ') || 'no rejections'}`);
  }
  return lines;
}
