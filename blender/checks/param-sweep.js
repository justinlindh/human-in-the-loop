// --sweep for pose.mjs: run the same measurement once per value of a --param, and print one table.
//
//   pose.mjs --scene --mock floor --event '<json>' --clip 2 --every 12 --cover coverHandEyeNear \
//     --sweep 'PALM_STAND=[-2.6,0.1,0.2,-0.5,0.1],[-2.75,0.14,0.27,-0.6,0.08]' \
//     --across mock=floor,hq --across view=0,1,2,3 \
//     --measure coverHandEyeNear --rows "r.anim === 'facepalm' && r.frame >= 12" --pick min
//
// --sweep NAME=v1,v2,...   the values of a param (top-level commas only, so arrays are one value);
//                          repeat it for a grid of columns
// --across flag=a,b,c      a pose.mjs flag to vary down the rows (mock, view, seed, week, ...); repeat
// --measure <name>         the number to read: a scene row field, a cover measure, or a gesture measure
// --rows '<js>'            keep the rows where the expression over r is true (default: all)
// --pick min|median|max|mean   how the kept values collapse to one cell (default min)
// Each cell is one full pose.mjs run, one after another, so a big grid takes a while.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COVER_MEASURE } from './pose-rules.js';

const VALUE_FLAGS = new Set(['sweep', 'across', 'measure', 'rows', 'pick', 'json']);

// "a,[b,c],d" into ["a", "[b,c]", "d"].
export function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    if (ch === ']' || ch === ')' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim()).filter((v) => v !== '');
}

export function parseAxis(spec, what) {
  const i = spec.indexOf('=');
  if (i < 1) throw new Error(`pose: --${what} wants name=v1,v2 (got "${spec}")`);
  const values = splitTop(spec.slice(i + 1));
  if (!values.length) throw new Error(`pose: --${what} ${spec.slice(0, i)} has no values`);
  return { name: spec.slice(0, i), values };
}

export const cartesian = (axes) => axes.reduce((acc, ax) => acc.flatMap((c) => ax.values.map((v) => [...c, [ax.name, v]])), [[]]);

const collapse = { min: (v) => Math.min(...v), max: (v) => Math.max(...v), mean: (v) => v.reduce((a, b) => a + b, 0) / v.length, median: (v) => [...v].sort((a, b) => a - b)[v.length >> 1] };

// The rows of a --json file as flat objects: scene rows as they are, gesture frames with their
// contact measures beside t, phase and anim.
export function flatRows(json) {
  if (Array.isArray(json)) return json;
  return (json.frames ?? []).map((f) => ({ ...f, ...(f.contact ?? {}) }));
}

export function cellValue(json, { measure, rows, pick }) {
  const keep = rows ? new Function('r', `return (${rows});`) : () => true;
  const vals = flatRows(json).filter((r) => keep(r)).map((r) => r[measure] ?? r.covers?.[measure]?.fraction).filter(Number.isFinite);
  return vals.length ? collapse[pick](vals) : null;
}

export function runSweep(argv, script) {
  const get = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));
  const measure = get('measure');
  if (!measure) { console.error('pose: --sweep needs --measure <name> (the number to tabulate)'); return 2; }
  const pick = get('pick', 'min');
  if (!collapse[pick]) { console.error(`pose: --pick is one of ${Object.keys(collapse).join(', ')}`); return 2; }
  let cols, rowsAxes;
  try {
    cols = cartesian(all('sweep').map((s) => parseAxis(s, 'sweep')));
    rowsAxes = cartesian(all('across').map((s) => parseAxis(s, 'across')));
  } catch (e) { console.error(e.message); return 2; }
  const varied = new Set(all('across').map((s) => s.split('=')[0]));
  const base = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // The flags a sweep owns, and any flag an --across axis varies (the first copy would win over the axis).
    if (a.startsWith('--') && (VALUE_FLAGS.has(a.slice(2)) || varied.has(a.slice(2)))) { i++; continue; }
    base.push(a);
  }
  if (COVER_MEASURE.test(measure) && !base.includes('--cover') && base.includes('--scene')) base.push('--cover', measure);
  const dir = mkdtempSync(join(tmpdir(), 'pose-sweep-'));
  const label = (c) => c.map(([n, v]) => `${n}=${v}`).join(' ');
  const cells = [];
  let bad = 0;
  try {
    for (const r of rowsAxes) {
      const line = [];
      for (const c of cols) {
        const out = join(dir, 'cell.json');
        const args = [script, ...base, ...r.flatMap(([n, v]) => [`--${n}`, v]), ...c.flatMap(([n, v]) => ['--param', `${n}=${v}`]), '--json', out];
        const res = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
        let v = null;
        if (res.status === 0 || res.status === 1) {
          try { v = cellValue(JSON.parse(readFileSync(out, 'utf8')), { measure, rows: get('rows'), pick }); } catch { /* no rows */ }
        }
        if (v === null) { bad++; const why = (res.stderr || res.stdout || '').trim().split('\n').slice(-1)[0]; console.error(`pose: no value for ${label(r)} | ${label(c)}${res.status > 1 ? ` (exit ${res.status}: ${why})` : ''}`); }
        line.push(v);
      }
      cells.push({ r, line });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const fmt = (v) => (v === null ? '-' : Number(v.toFixed(4)).toString());
  const head = cols.map((c) => label(c) || measure);
  const lw = Math.max(0, ...cells.map(({ r }) => label(r).length));
  console.log(`SWEEP ${measure} (${pick}${get('rows') ? `, rows where ${get('rows')}` : ''})`);
  console.log(`SWEEP ${''.padEnd(lw)}  ${head.map((h) => h.padStart(Math.max(8, Math.min(h.length, 40)))).join('  ')}`);
  for (const { r, line } of cells) console.log(`SWEEP ${label(r).padEnd(lw)}  ${line.map((v, i) => fmt(v).padStart(Math.max(8, Math.min(head[i].length, 40)))).join('  ')}`);
  return bad ? 1 : 0;
}
