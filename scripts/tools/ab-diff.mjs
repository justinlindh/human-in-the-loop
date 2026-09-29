// The diff ab.sh prints: structured when both outputs are JSON, a unified text diff otherwise.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Every path where the two values differ: { path, base, now, delta? }. Numbers within `tol` are the
// same; arrays of objects match by the `id` field when given (else by index); `ignore` (a RegExp)
// drops paths.
export function jsonDiff(a, b, { tol = 0, id = null, ignore = null } = {}) {
  const out = [];
  const add = (path, base, now) => { if (!(ignore && ignore.test(path))) out.push({ path: path || '(root)', base, now, ...(typeof base === 'number' && typeof now === 'number' ? { delta: now - base } : {}) }); };
  const walk = (path, x, y) => {
    if (typeof x === 'number' && typeof y === 'number') { if (Math.abs(x - y) > tol && !(Number.isNaN(x) && Number.isNaN(y))) add(path, x, y); return; }
    if (Array.isArray(x) && Array.isArray(y)) {
      if (id && [...x, ...y].every((e) => isObj(e) && id in e)) {
        const mx = new Map(x.map((e) => [e[id], e])), my = new Map(y.map((e) => [e[id], e]));
        for (const k of new Set([...mx.keys(), ...my.keys()])) walk(`${path}[${id}=${k}]`, mx.get(k), my.get(k));
      } else {
        for (let i = 0; i < Math.max(x.length, y.length); i++) walk(`${path}[${i}]`, x[i], y[i]);
      }
      return;
    }
    if (isObj(x) && isObj(y)) { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(path ? `${path}.${k}` : k, x[k], y[k]); return; }
    if (JSON.stringify(x) !== JSON.stringify(y)) add(path, x, y);
  };
  walk('', a, b);
  return out;
}

const show = (v) => { const s = v === undefined ? '(absent)' : JSON.stringify(v); return s.length > 60 ? `${s.slice(0, 57)}...` : s; };

export function diffOutputs(baseOut, nowOut, { tol = 0, id = null, ignore = null, max = 60 } = {}) {
  let ja, jb;
  try { ja = JSON.parse(baseOut); jb = JSON.parse(nowOut); } catch { ja = undefined; }
  if (ja !== undefined && jb !== undefined) {
    const list = jsonDiff(ja, jb, { tol, id, ignore });
    if (!list.length) return { kind: 'json', count: 0, list, text: 'ab: identical (JSON)' };
    const lines = list.slice(0, max).map((d) => {
      const pct = d.delta !== undefined && d.base ? `, ${d.delta >= 0 ? '+' : ''}${((d.delta / Math.abs(d.base)) * 100).toFixed(1)}%` : '';
      const delta = d.delta !== undefined ? ` (${d.delta >= 0 ? '+' : ''}${+d.delta.toFixed(6)}${pct})` : '';
      return `  ${d.path}: ${show(d.base)} -> ${show(d.now)}${delta}`;
    });
    if (list.length > max) lines.push(`  ... and ${list.length - max} more (--max, or --json <file> for all)`);
    return { kind: 'json', count: list.length, list, text: `ab: ${list.length} difference(s) (JSON):\n${lines.join('\n')}` };
  }
  if (baseOut === nowOut) return { kind: 'text', count: 0, list: [], text: 'ab: identical (text)' };
  const dir = mkdtempSync(join(tmpdir(), 'ab-diff-'));
  try {
    writeFileSync(join(dir, 'base'), baseOut);
    writeFileSync(join(dir, 'now'), nowOut);
    const r = spawnSync('diff', ['-u', '--label', 'base', '--label', 'this tree', join(dir, 'base'), join(dir, 'now')], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const lines = r.stdout.split('\n').filter(Boolean);
    const changed = lines.filter((l) => /^[+-](?![+-]{2} )/.test(l)).length;
    const shown = lines.slice(0, max + 2);
    if (lines.length > max + 2) shown.push(`... ${lines.length - max - 2} more line(s) (--max)`);
    return { kind: 'text', count: changed, list: lines, text: `ab: ${changed} changed line(s) (text):\n${shown.join('\n')}` };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
