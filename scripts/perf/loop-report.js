// Where the team's time goes, from the shared timing log (scripts/lib/timing.js).
// node scripts/perf/loop-report.js [--since 24h|7d|<ISO date>] [--file <timings.jsonl>] [--top 10] [--json]
// Sections: time per tool and CI step, time per worktree, wait classes, cache lookup rates,
// unverified repeat candidates by recorded context, and the slowest runs.
import { readFileSync, existsSync } from 'node:fs';
import { arg, quantile } from './stats.js';
import { timingsFile } from '../lib/timing.js';

const file = String(arg('file', timingsFile() ?? ''));
if (!file || !existsSync(file)) { console.error(`loop-report: no timing log at ${file || '(logging is off)'}`); process.exit(1); }
const TOP = Number(arg('top', 10));

function sinceMs(v) {
  if (!v || v === true) return 0;
  const m = /^(\d+(?:\.\d+)?)([hd])$/.exec(v);
  if (m) return Date.now() - Number(m[1]) * (m[2] === 'h' ? 3.6e6 : 8.64e7);
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}
const from = sinceMs(arg('since', null));
const rows = [];
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line);
    if (Date.parse(r.ts) >= from) rows.push(r);
  } catch { /* a torn line: skip */ }
}
if (!rows.length) { console.log('loop-report: nothing logged in that window'); process.exit(0); }
rows.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

const sum = (xs) => xs.reduce((a, x) => a + x, 0);
const fmt = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)}h` : s >= 60 ? `${(s / 60).toFixed(1)}m` : `${s.toFixed(1)}s`);
const group = (xs, key) => {
  const m = new Map();
  for (const x of xs) { const k = key(x); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
};
const table = (title, head, body) => {
  console.log(`\n## ${title}`);
  if (!body.length) { console.log('(none)'); return; }
  const cols = head.map((h, i) => Math.max(h.length, ...body.map((r) => String(r[i]).length)));
  const fmtRow = (r) => r.map((c, i) => (i === 0 ? String(c).padEnd(cols[i]) : String(c).padStart(cols[i]))).join('  ');
  console.log(fmtRow(head));
  for (const r of body) console.log(fmtRow(r));
};

const first = rows.reduce((a, r) => (r.ts < a ? r.ts : a), rows[0].ts);
const last = rows.reduce((a, r) => (r.ts > a ? r.ts : a), rows[0].ts);
console.log(`loop-report: ${rows.length} records, ${first.slice(0, 16)} to ${last.slice(0, 16)} UTC`);

// Timed work: whole runs of tools, and CI steps. A CI run is also its steps, so totals keep them apart.
const timed = rows.filter((r) => (r.kind === 'run' || r.kind === 'step') && Number.isFinite(r.wall_s) && !r.skipped);
const label = (r) => (r.kind === 'step' ? `${r.tool}:${r.step}` : r.tool);
const out = { tools: [], worktrees: [], locks: [], lock_classes: [], cache: [], repeats: [], slowest: [] };
out.tools = [...group(timed, label)].map(([k, xs]) => {
  const w = xs.map((x) => x.wall_s);
  const cpu = xs.filter((x) => Number.isFinite(x.cpu_s)).map((x) => x.cpu_s);
  return { what: k, runs: xs.length, total_s: sum(w), median_s: quantile(w, 0.5), p90_s: quantile(w, 0.9), cpu_s: cpu.length ? sum(cpu) : null, failed: xs.filter((x) => x.exit).length };
}).sort((a, b) => b.total_s - a.total_s);
table('Time per tool and CI step (by total wall time)', ['what', 'runs', 'total', 'median', 'p90', 'cpu', 'failed'],
  out.tools.slice(0, TOP * 2).map((t) => [t.what, t.runs, fmt(t.total_s), fmt(t.median_s), fmt(t.p90_s), t.cpu_s == null ? '-' : fmt(t.cpu_s), t.failed]));

// Exclude the known ci-local parent duplicate. Tool runs can still nest inside CI runs.
const topLevel = timed.filter((r) => r.kind === 'run' && !(r.tool === 'ci-local' && r.pr));
out.worktrees = [...group(topLevel, (r) => r.worktree)].map(([k, xs]) => ({ worktree: k, runs: xs.length, total_s: sum(xs.map((x) => x.wall_s)) }))
  .sort((a, b) => b.total_s - a.total_s);
table('Time per worktree (run subtotals; nested tools can overlap)', ['worktree', 'runs', 'total'], out.worktrees.map((w) => [w.worktree, w.runs, fmt(w.total_s)]));

const locks = rows.filter((r) => r.kind === 'lock');
const waitClasses = new Map([['ci-run', 'CI admission'], ['ci', 'CI admission'], ['gpu', 'GPU render'], ['software', 'Software render']]);
const waitClass = (r) => waitClasses.get(r.mode) ?? `Unknown (${r.mode ?? 'missing mode'})`;
const waitStats = ([k, xs]) => {
  const w = xs.map((x) => x.wait_s ?? 0);
  return { what: k, waits: xs.length, total_s: sum(w), median_s: quantile(w, 0.5), p90_s: quantile(w, 0.9), max_s: Math.max(...w), timeouts: xs.filter((x) => x.timed_out).length };
};
out.lock_classes = [...group(locks, waitClass)].map(waitStats).sort((a, b) => b.total_s - a.total_s);
out.locks = [...group(locks, (r) => `${waitClass(r)}: ${r.mode ?? '?'} ${r.for ?? '?'}`)].map(waitStats).sort((a, b) => b.total_s - a.total_s);
const waitTable = (title, xs) => table(title, ['class / job', 'waits', 'total', 'median', 'p90', 'max', 'timeouts'],
  xs.map((l) => [l.what, l.waits, fmt(l.total_s), fmt(l.median_s), fmt(l.p90_s), fmt(l.max_s), l.timeouts]));
waitTable('Wait classes', out.lock_classes);
waitTable('Waits per job', out.locks.slice(0, TOP));
console.log('Counts include immediate acquisitions and probes; timeouts are included in wait durations. Queue duration alone does not justify capacity changes.');

// Relaunches under a lock can log a lookup twice. Ignore only timestamp and process id;
// keep scene, outcome and every recorded context/configuration field in the heuristic key.
const recordKey = (r, omit = []) => JSON.stringify(Object.fromEntries(Object.keys(r).sort().filter((k) => !omit.includes(k)).map((k) => [k, r[k]])));
const cacheUnit = (r) => r.scene == null ? 'whole-run' : 'scene';
const cacheGroup = (r) => JSON.stringify([r.tool, cacheUnit(r)]);
const cacheRows = [];
const seenCache = new Map();
const rawCache = rows.filter((r) => r.kind === 'cache');
for (const r of rawCache) {
  const k = recordKey(r, ['ts', 'pid']);
  const t = Date.parse(r.ts);
  if (r.input && r.worktree && seenCache.has(k) && t - seenCache.get(k) < 60000) continue;
  seenCache.set(k, t);
  cacheRows.push(r);
}
const rawCacheGroups = group(rawCache, cacheGroup);
out.cache = [...group(cacheRows, cacheGroup)].map(([k, xs]) => {
  const hits = xs.filter((x) => x.cache === 'hit').length;
  const misses = xs.filter((x) => x.cache === 'miss').length;
  const disabled = xs.filter((x) => x.cache === 'off').length;
  const enabled = hits + misses;
  const raw_lookups = rawCacheGroups.get(k).length;
  return { check: xs[0].tool, unit: cacheUnit(xs[0]), raw_lookups, deduplicated: raw_lookups - xs.length,
    lookups: xs.length, enabled, hits, misses, disabled, unknown: xs.length - enabled - disabled, hit_rate: enabled ? hits / enabled : null };
}).sort((a, b) => b.lookups - a.lookups);
table('Cache lookups by unit (enabled hit rates)', ['check / unit', 'raw', 'suppressed', 'lookups', 'enabled', 'hits', 'misses', 'disabled', 'unknown', 'hit rate'],
  out.cache.map((c) => [`${c.check} / ${c.unit}`, c.raw_lookups, c.deduplicated, c.lookups, c.enabled, c.hits, c.misses, c.disabled, c.unknown, c.hit_rate == null ? '-' : `${Math.round(100 * c.hit_rate)}%`]));
out.cache_note = 'Deduplication is a 60-second heuristic, not exact run identity: same nonempty input and worktree, with all recorded fields except ts/pid matching. Missing inputs are retained. Golden scene input is a scene base key, not a hash of every loaded file or reference; repeated keys do not prove repeated renders.';
console.log(out.cache_note);

// SHA describes the logging checkout, not necessarily the tested tree. Keep all recorded
// context except process ids and measurements, so differing configurations cannot collapse.
const measurements = ['ts', 'pid', 'wall_s', 'cpu_s', 'exit', 'ci_s', 'setup_s', 'load1_start', 'load1_end', 'runs_start', 'slot_wait_s'];
out.identity = { records: timed.length, unverified_records: timed.length, missing_sha: timed.filter((r) => !r.sha).length,
  note: 'All repeat candidates are unverified. SHA is the logging checkout (ci-pr: launcher); PR is not a tested head. Recorded args can be truncated and omit environment/configuration. Cache records cannot be joined to timed runs by SHA. Do not add parent and child durations or interpret subsequent time as savings.' };
out.repeats = [...group(timed, (r) => recordKey(r, measurements))]
  .filter(([, xs]) => xs.length > 1)
  .map(([k, xs]) => ({ what: label(xs[0]), recorded: JSON.parse(k), cache_identity: 'unverified', runs: xs.length,
    subsequent_s: sum(xs.slice(1).map((x) => x.wall_s)) }))
  .sort((a, b) => b.subsequent_s - a.subsequent_s);
table('Repeat candidates by recorded context (unverified)', ['recorded context', 'runs', 'subsequent time'],
  out.repeats.slice(0, TOP).map((r) => [`${r.what} ${JSON.stringify(r.recorded)}`, r.runs, fmt(r.subsequent_s)]));
console.log(out.identity.note);
out.unidentified = [...group(timed.filter((r) => !r.sha), label)].map(([what, xs]) => ({ what, runs: xs.length, total_s: sum(xs.map((r) => r.wall_s)) }));
table('Missing checkout identity (unverified records, including singletons)', ['what', 'records', 'total'],
  out.unidentified.map((r) => [r.what, r.runs, fmt(r.total_s)]));

out.slowest = [...timed].sort((a, b) => b.wall_s - a.wall_s).slice(0, TOP)
  .map((r) => ({ what: label(r), wall_s: r.wall_s, ts: r.ts, worktree: r.worktree, pr: r.pr ?? null, exit: r.exit }));
table('Slowest runs', ['what', 'wall', 'when (UTC)', 'worktree', 'pr', 'exit'],
  out.slowest.map((r) => [r.what, fmt(r.wall_s), r.ts.slice(5, 16), r.worktree, r.pr ?? '-', r.exit ?? '-']));

if (arg('json', false)) console.log(`\n${JSON.stringify(out, null, 2)}`);
