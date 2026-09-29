// --matrix with --sweep: run the whole pose matrix once per value of a --param and print one line per
// value, so "which value of PALM_X passes every cell" is one command.
//
//   pose.mjs --gesture facepalm --matrix views=all,postures=stand,sit --measure coverHandEyeNear \
//     --expect 'coverHandEyeNear>=0.5@0.7' --sweep 'PALM_STAND[2]=0.2,0.27,0.35'
//
// Each value is one pose.mjs run (its own Vite server, since a param is applied as modules load) that
// plays the whole matrix. A repeated --sweep multiplies into a grid of value combinations: the run count
// is printed first, and a grid over --max-runs (default 64) is refused. --jobs N runs that many values at
// once (default: a quarter of the cores, at least 1).
import { spawn } from 'node:child_process';
import { cpus, tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseAxis, cartesian } from './param-sweep.js';
import { margin, rowLabel, worstOf } from './pose-matrix.js';

export const DEFAULT_MAX_RUNS = 64;
export const defaultJobs = () => Math.max(1, cpus().length >> 2);

// The flags a matrix sweep owns, so the per-value runs don't see them.
const OWN = new Set(['--sweep', '--json', '--jobs', '--max-runs']);

// For each swept axis, how far the mean passing-cell count moves across that axis's values, most
// influential first.
export function sensitivity(rows, axes) {
  const ok = rows.filter((r) => !r.error);
  return axes.map((ax) => {
    const means = ax.values.map((v) => {
      const hit = ok.filter((r) => r.c.some(([n, x]) => n === ax.name && x === v));
      return hit.length ? hit.reduce((a, r) => a + r.pass, 0) / hit.length : null;
    }).filter((m) => m !== null);
    return { name: ax.name, spread: means.length ? Math.max(...means) - Math.min(...means) : 0 };
  }).sort((a, b) => b.spread - a.spread);
}

const running = new Set();

const runOne = (script, args) => new Promise((resolve) => {
  const p = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  running.add(p);
  p.on('close', () => running.delete(p));
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('error', (e) => resolve({ status: -1, out: String(e) }));
  p.on('close', (status) => resolve({ status, out }));
});

async function pool(items, jobs, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

export async function runMatrixSweep(argv, script) {
  const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));
  const num = (k, d) => { const v = all(k)[0]; return v === undefined ? d : Number(v); };
  let axes, cols;
  try { axes = all('sweep').map((s) => parseAxis(s, 'sweep')); cols = cartesian(axes); } catch (e) { console.error(e.message); return 2; }
  const jobs = num('jobs', defaultJobs());
  const maxRuns = num('max-runs', DEFAULT_MAX_RUNS);
  if (!(jobs >= 1) || !(maxRuns >= 1)) { console.error('pose: --jobs and --max-runs want a positive number'); return 2; }
  const shape = axes.map((a) => a.values.length).join(' x ');
  console.log(`SWEEP ${cols.length} runs (${axes.length > 1 ? `${shape}; a repeated --sweep multiplies` : shape}), ${Math.min(jobs, cols.length)} at a time`);
  if (cols.length > maxRuns) {
    console.error(`pose: ${cols.length} runs is over --max-runs ${maxRuns}; sweep fewer values or params, or pass --max-runs ${cols.length}`);
    return 2;
  }
  const base = [];
  for (let i = 0; i < argv.length; i++) { if (OWN.has(argv[i])) { i++; continue; } base.push(argv[i]); }
  const dir = mkdtempSync(join(tmpdir(), 'pose-msweep-'));
  const label = (c) => c.map(([n, v]) => `${n}=${v}`).join(' ');
  // A signal skips the finally below, so stop the running values and remove the dir here.
  const onSignal = (sig) => () => {
    for (const p of running) p.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
    process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGHUP' ? 1 : 15));
  };
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => [s, onSignal(s)]);
  for (const [s, h] of handlers) process.on(s, h);
  let rows;
  try {
    rows = await pool(cols, jobs, async (c, i) => {
      const out = join(dir, `m${i}.json`);
      const res = await runOne(script, [...base, ...c.flatMap(([n, v]) => ['--param', `${n}=${v}`]), '--json', out]);
      let m = null;
      if (res.status === 0 || res.status === 1) { try { m = JSON.parse(readFileSync(out, 'utf8')); } catch { /* no result */ } }
      if (!m) return { c, error: `exit ${res.status}: ${res.out.trim().split('\n').slice(-1)[0]}` };
      const worst = worstOf(m.cells);
      return { c, pass: m.cells.filter((x) => x.pass).length, total: m.cells.length, worst, axes: m.axes, margin: margin(worst) };
    });
  } finally {
    for (const [s, h] of handlers) process.off(s, h);
    rmSync(dir, { recursive: true, force: true });
  }
  const w =Math.max(...rows.map((r) => label(r.c).length));
  console.log('SWEEP matrix: passing cells per value');
  for (const r of rows) {
    if (r.error) { console.log(`SWEEP ${label(r.c).padEnd(w)}  error: ${r.error}`); continue; }
    const at = r.pass === r.total ? 'ALL PASS' : `worst ${rowLabel(r.worst, r.axes)} view ${r.worst.view} (${r.worst.verdicts.filter((v) => !v.pass).map((v) => `${v.rule} ${Math.round(v.share * 100)}%`).join('; ')})`;
    console.log(`SWEEP ${label(r.c).padEnd(w)}  ${String(r.pass).padStart(3)} of ${r.total}  ${at}`);
  }
  if (axes.length > 1) {
    const s = sensitivity(rows, axes);
    if (s[0].spread > 0) console.log(`SWEEP moves the pass count most: ${s.map((x) => `${x.name} (${Number(x.spread.toFixed(2))})`).join(', ')}`);
    else console.log('SWEEP no swept param changes the pass count');
  }
  const good = rows.filter((r) => !r.error && r.pass === r.total).map((r) => label(r.c));
  console.log(`SWEEP passing every cell: ${good.length ? good.join(' | ') : 'none'}`);
  return rows.some((r) => r.error) ? 2 : good.length ? 0 : 1;
}
