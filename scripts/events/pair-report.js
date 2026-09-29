// The comparison half of pair.js: two sides' per-run records in, a markdown table and a summary out.
// Kept free of the sim so it can be tested on hand-made records.
//
// A record is { reason, exited, won, weeks, score, incidents, caught, breaches, hash, fields }, keyed
// "<bot>:<seed>". `hash` is the identity of the run (ending reason, weeks, score and the final random
// state), so two runs are the same run when their hashes match.
const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((p, q) => p - q); return s[s.length >> 1]; };
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const sum = (rs, f) => rs.reduce((t, r) => t + (r[f] ?? 0), 0);

// A --fields column: numbers add up, booleans count the true ones, anything else is counted by value.
function fieldCell(rs, name) {
  const vals = rs.map((r) => r.fields?.[name]).filter((v) => v !== undefined && v !== null);
  if (!vals.length) return '-';
  if (vals.every((v) => typeof v === 'number')) return String(vals.reduce((t, v) => t + v, 0));
  if (vals.every((v) => typeof v === 'boolean')) return String(vals.filter(Boolean).length);
  const counts = new Map();
  for (const v of vals) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  return [...counts].sort((p, q) => q[1] - p[1]).map(([k, n]) => `${k} ${n}`).join(', ');
}

export function compare(a, b) {
  const keys = Object.keys(a).filter((k) => k in b);
  const bots = [...new Set(keys.map((k) => k.split(':')[0]))];
  const fieldNames = [...new Set(keys.flatMap((k) => [...Object.keys(a[k].fields ?? {}), ...Object.keys(b[k].fields ?? {})]))];
  const rows = bots.map((bot) => {
    const ks = keys.filter((k) => k.startsWith(`${bot}:`));
    const A = ks.map((k) => a[k]), B = ks.map((k) => b[k]);
    return {
      bot, runs: ks.length,
      same: ks.filter((k) => a[k].hash === b[k].hash).length,
      exitA: pct(A.filter((r) => r.exited).length, A.length), exitB: pct(B.filter((r) => r.exited).length, B.length),
      lost: ks.filter((k) => a[k].exited && !b[k].exited),
      gained: ks.filter((k) => !a[k].exited && b[k].exited),
      scoreA: med(A.map((r) => r.score)), scoreB: med(B.map((r) => r.score)),
      weeksA: med(A.map((r) => r.weeks)), weeksB: med(B.map((r) => r.weeks)),
      incidents: [sum(A, 'incidents'), sum(B, 'incidents')], caught: [sum(A, 'caught'), sum(B, 'caught')], breaches: [sum(A, 'breaches'), sum(B, 'breaches')],
      fields: Object.fromEntries(fieldNames.map((f) => [f, [fieldCell(A, f), fieldCell(B, f)]])),
    };
  });
  const missing = Object.keys(a).length !== Object.keys(b).length;
  return { rows, fieldNames, runs: keys.length, missing };
}

export function markdown({ rows, fieldNames }, { a = 'a', b = 'b' } = {}) {
  const r = (x) => (x == null ? '-' : Math.round(x));
  const head = ['bot', 'same', `exit ${a} -> ${b}`, 'lost / gained', 'median score', 'median weeks', 'incidents', 'caught', 'breaches', ...fieldNames];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const x of rows) {
    lines.push(`| ${[x.bot, `${x.same}/${x.runs}`, `${x.exitA}% -> ${x.exitB}%`, `${x.lost.length} / ${x.gained.length}`, `${r(x.scoreA)} -> ${r(x.scoreB)}`, `${r(x.weeksA)} -> ${r(x.weeksB)}`,
      `${x.incidents[0]} -> ${x.incidents[1]}`, `${x.caught[0]} -> ${x.caught[1]}`, `${x.breaches[0]} -> ${x.breaches[1]}`, ...fieldNames.map((f) => `${x.fields[f][0]} -> ${x.fields[f][1]}`)].join(' | ')} |`);
  }
  return lines.join('\n');
}
