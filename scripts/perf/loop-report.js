// Where the team's time goes, from the shared timing log (scripts/lib/timing.js).
// node scripts/perf/loop-report.js [--since 24h|7d|<ISO date>] [--file <timings.jsonl>] [--top 10] [--json]
// Sections: time per tool and CI step, time per worktree (lane), render lock waits, render-check
// cache hit rates, repeated work on identical inputs (the caching candidates), and the slowest runs.
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
const out = { tools: [], worktrees: [], locks: [], cache: [], repeats: [], slowest: [] };
out.tools = [...group(timed, label)].map(([k, xs]) => {
  const w = xs.map((x) => x.wall_s);
  const cpu = xs.filter((x) => Number.isFinite(x.cpu_s)).map((x) => x.cpu_s);
  return { what: k, runs: xs.length, total_s: sum(w), median_s: quantile(w, 0.5), p90_s: quantile(w, 0.9), cpu_s: cpu.length ? sum(cpu) : null, failed: xs.filter((x) => x.exit).length };
}).sort((a, b) => b.total_s - a.total_s);
table('Time per tool and CI step (by total wall time)', ['what', 'runs', 'total', 'median', 'p90', 'cpu', 'failed'],
  out.tools.slice(0, TOP * 2).map((t) => [t.what, t.runs, fmt(t.total_s), fmt(t.median_s), fmt(t.p90_s), t.cpu_s == null ? '-' : fmt(t.cpu_s), t.failed]));

// Top-level runs only (ci-pr, ci-local outside ci-pr, tools), so nothing counts twice.
const topLevel = timed.filter((r) => r.kind === 'run' && !(r.tool === 'ci-local' && r.pr));
out.worktrees = [...group(topLevel, (r) => r.worktree)].map(([k, xs]) => ({ worktree: k, runs: xs.length, total_s: sum(xs.map((x) => x.wall_s)) }))
  .sort((a, b) => b.total_s - a.total_s);
table('Time per worktree (top-level runs)', ['worktree', 'runs', 'total'], out.worktrees.map((w) => [w.worktree, w.runs, fmt(w.total_s)]));

const locks = rows.filter((r) => r.kind === 'lock');
out.locks = [...group(locks, (r) => `${r.mode} ${r.for}`)].map(([k, xs]) => {
  const w = xs.map((x) => x.wait_s ?? 0);
  return { what: k, waits: xs.length, total_s: sum(w), median_s: quantile(w, 0.5), max_s: Math.max(...w), timeouts: xs.filter((x) => x.timed_out).length };
}).sort((a, b) => b.total_s - a.total_s);
const lockTotal = sum(locks.map((x) => x.wait_s ?? 0));
table(`Render lock waits (${fmt(lockTotal)} in total)`, ['mode and job', 'waits', 'total', 'median', 'max', 'timeouts'],
  out.locks.slice(0, TOP).map((l) => [l.what, l.waits, fmt(l.total_s), fmt(l.median_s), fmt(l.max_s), l.timeouts]));

// A tool that relaunches itself under the lock looks its cache up twice; count each input once a minute.
const cacheRows = [];
const seenCache = new Map();
for (const r of rows.filter((x) => x.kind === 'cache').sort((a, b) => (a.ts < b.ts ? -1 : 1))) {
  const k = `${r.tool}|${r.input}|${r.worktree}`;
  const t = Date.parse(r.ts);
  if (r.input && seenCache.has(k) && t - seenCache.get(k) < 60000) continue;
  seenCache.set(k, t);
  cacheRows.push(r);
}
out.cache = [...group(cacheRows, (r) => r.tool)].map(([k, xs]) => {
  const hits = xs.filter((x) => x.cache === 'hit').length;
  const misses = xs.filter((x) => x.cache === 'miss');
  // A miss on an input that has missed before: the same render done again, never recorded as a pass.
  const again = misses.length - new Set(misses.map((x) => x.input)).size;
  return { check: k, lookups: xs.length, hits, hit_rate: hits / xs.length, repeat_misses: again };
}).sort((a, b) => b.lookups - a.lookups);
table('Render-check cache', ['check', 'lookups', 'hits', 'hit rate', 'misses on a seen input'],
  out.cache.map((c) => [c.check, c.lookups, c.hits, `${Math.round(100 * c.hit_rate)}%`, c.repeat_misses]));

// Identical inputs run more than once: the same CI step on the same tested commit, or the same
// tool with the same arguments on the same commit. Each repeat after the first is time a cache
// keyed on those inputs could have saved.
const inputKey = (r) => (r.sha ? `${label(r)} @${r.sha}${r.args ? ` ${r.args}` : ''}` : null);
out.repeats = [...group(timed.filter((r) => !(r.kind === 'run' && r.tool === 'ci-local' && r.pr)), inputKey)]
  .filter(([, xs]) => xs.length > 1)
  .map(([k, xs]) => ({ what: k, runs: xs.length, repeat_s: sum(xs.map((x) => x.wall_s)) - xs[0].wall_s, worktrees: [...new Set(xs.map((x) => x.worktree))].join(',') }))
  .sort((a, b) => b.repeat_s - a.repeat_s);
const repeatTotal = sum(out.repeats.map((r) => r.repeat_s));
table(`Repeated runs on identical inputs (${fmt(repeatTotal)} of repeats)`, ['what @ commit', 'runs', 'repeat time', 'worktrees'],
  out.repeats.slice(0, TOP).map((r) => [r.what.slice(0, 90), r.runs, fmt(r.repeat_s), r.worktrees]));

out.slowest = [...timed].sort((a, b) => b.wall_s - a.wall_s).slice(0, TOP)
  .map((r) => ({ what: label(r), wall_s: r.wall_s, ts: r.ts, worktree: r.worktree, pr: r.pr ?? null, exit: r.exit }));
table('Slowest runs', ['what', 'wall', 'when (UTC)', 'worktree', 'pr', 'exit'],
  out.slowest.map((r) => [r.what, fmt(r.wall_s), r.ts.slice(5, 16), r.worktree, r.pr ?? '-', r.exit ?? '-']));

if (arg('json', false)) console.log(`\n${JSON.stringify(out, null, 2)}`);
