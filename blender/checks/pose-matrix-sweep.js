// --matrix with --sweep: run the whole pose matrix once per value of a --param and print one line per
// value, so "which value of PALM_X passes every cell" is one command.
//
//   pose.mjs --gesture facepalm --matrix views=all,postures=stand,sit --measure coverHandEyeNear \
//     --expect 'coverHandEyeNear>=0.5@0.7' --sweep 'PALM_STAND[2]=0.2,0.27,0.35'
//
// Each value is one pose.mjs run (its own Vite server, since a param is applied as modules load) that
// plays the whole matrix; a repeated --sweep makes a grid of value combinations.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAxis, cartesian } from './param-sweep.js';
import { margin, rowLabel, worstOf } from './pose-matrix.js';

export function runMatrixSweep(argv, script) {
  const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));
  let cols;
  try { cols = cartesian(all('sweep').map((s) => parseAxis(s, 'sweep'))); } catch (e) { console.error(e.message); return 2; }
  const base = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--sweep' || argv[i] === '--json') { i++; continue; } base.push(argv[i]); }
  const dir = mkdtempSync(join(tmpdir(), 'pose-msweep-'));
  const label = (c) => c.map(([n, v]) => `${n}=${v}`).join(' ');
  const rows = [];
  try {
    for (const c of cols) {
      const out = join(dir, 'm.json');
      const res = spawnSync(process.execPath, [script, ...base, ...c.flatMap(([n, v]) => ['--param', `${n}=${v}`]), '--json', out], { encoding: 'utf8', maxBuffer: 1 << 26 });
      let m = null;
      if (res.status === 0 || res.status === 1) { try { m = JSON.parse(readFileSync(out, 'utf8')); } catch { /* no result */ } }
      if (!m) { const why = (res.stderr || res.stdout || '').trim().split('\n').slice(-1)[0]; rows.push({ c, error: `exit ${res.status}: ${why}` }); continue; }
      const cells = m.cells;
      const worst = worstOf(cells);
      rows.push({ c, pass: cells.filter((x) => x.pass).length, total: cells.length, worst, axes: m.axes, margin: margin(worst) });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const w = Math.max(...rows.map((r) => label(r.c).length));
  console.log(`SWEEP matrix: passing cells per value`);
  for (const r of rows) {
    if (r.error) { console.log(`SWEEP ${label(r.c).padEnd(w)}  error: ${r.error}`); continue; }
    const at = r.pass === r.total ? 'ALL PASS' : `worst ${rowLabel(r.worst, r.axes)} view ${r.worst.view} (${r.worst.verdicts.filter((v) => !v.pass).map((v) => `${v.rule} ${Math.round(v.share * 100)}%`).join('; ')})`;
    console.log(`SWEEP ${label(r.c).padEnd(w)}  ${String(r.pass).padStart(3)} of ${r.total}  ${at}`);
  }
  const good = rows.filter((r) => r.pass === r.total).map((r) => label(r.c));
  console.log(`SWEEP passing every cell: ${good.length ? good.join(' | ') : 'none'}`);
  return rows.some((r) => r.error) ? 2 : good.length ? 0 : 1;
}
