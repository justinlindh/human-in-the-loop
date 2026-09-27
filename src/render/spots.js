// One diagnostic store per office, shared by props and moments. It records only while `on` (a check
// or trace turns it on); each search replaces its previous record, so a long-running game retains
// searches, not a frame-by-frame history.
const offices = new WeakMap();
export function spotDebug(office) {
  let debug = offices.get(office);
  if (!debug) { debug = { on: false, spots: Object.create(null) }; offices.set(office, debug); }
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
  // Candidate rows are built only when diagnostics are recording; the search itself is the same.
  const record = debug?.on && moment ? { search, center: point(center), candidates: [], selected: null, fallback: false } : null;
  let best = null, bestScore = Infinity, bestIndex = -1, index = -1;
  for (const q of candidates ?? spotRing(center, ring)) {
    index++;
    let why = null;
    for (const need of needs) {
      const result = checks[need](q);
      if (result !== true) { why = typeof result === 'string' ? result : need; break; }
    }
    const value = why ? null : score ? score(q) : 0;
    if (value !== null && !Number.isFinite(value)) why = 'no finite score';
    if (record) {
      const row = { ...point(q), reasons: why ? [why] : [], score: Number.isFinite(value) ? value : null };
      if (q.partner) row.partner = point(q.partner);
      record.candidates.push(row);
    }
    if (why || value >= bestScore) continue;
    best = q; bestScore = value; bestIndex = index;
    if (!score || bestScore <= minScore) break;
  }
  if (!best) best = typeof fallback === 'function' ? fallback() : fallback;
  if (record) {
    for (let i = 0; i < record.candidates.length; i++) {
      const row = record.candidates[i];
      if (!row.reasons.length && i !== bestIndex) row.reasons.push('lower-ranked candidate');
    }
    record.fallback = bestIndex < 0 && best != null;
    record.selected = point(best);
    record.selectedIndex = bestIndex;
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
