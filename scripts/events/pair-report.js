// The comparison half of pair.js: two sides' per-run records in, a markdown table and a summary out.
// Kept free of the sim so it can be tested on hand-made records.
//
// A record is { reason, exited, won, weeks, score, incidents, caught, breaches, hash, fields }, keyed
// "<bot>:<seed>". `hash` is the identity of the run (ending reason, weeks, score and the final random
// state), so two runs are the same run when their hashes match.
import { createHash } from 'node:crypto';

// The cache key of one side's records: everything its runs depend on. `files` is [path, content id]
// for the sim and data files, order-independent; the rest are the run set and the code that plays it.
export function sideKey({ files, bots, seeds, startEra, fields, script, node }) {
  const body = JSON.stringify({ files: [...files].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0)), bots: [...bots].sort(), seeds, startEra: startEra ?? null, fields: fields ?? [], script, node });
  return createHash('sha256').update(body).digest('hex').slice(0, 24);
}

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
  const onlyA = Object.keys(a).filter((k) => !(k in b)), onlyB = Object.keys(b).filter((k) => !(k in a));
  return { rows, fieldNames, runs: keys.length, onlyA, onlyB };
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

// "name: expr, name2: expr2" (optionally wrapped in braces or ({ ... })) as [{ name, expr }], split on
// top-level commas. Throws when a part is not `identifier: expression` or an expression is not JS.
export function parseFields(src) {
  if (!src) return [];
  let body = src.trim();
  const wrapped = body.match(/^\(?\s*\{([\s\S]*)\}\s*\)?$/);
  if (wrapped) body = wrapped[1];
  const parts = [];
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
    if (!m) throw new Error(`"${p}" is not name: expression`);
    try { new Function('r', 's', `return (${m[2]});`); } catch (e) { throw new Error(`${m[1]} is not a JS expression: ${e.message}`); }
    return { name: m[1], expr: m[2].trim() };
  });
}
