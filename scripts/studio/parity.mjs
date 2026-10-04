#!/usr/bin/env node
// Do an old tool and its studio replacement give the same rows on the same checkout? Runs both commands,
// keeps the output lines that match --grep, and compares them by name: a line is `<prefix> <name> {json}`
// (the text before the first `{` is the name, the JSON the numbers). Exit 1 on any difference, 2 when a
// command fails to run.
//
//   node scripts/studio/parity.mjs --preset clip
//   node scripts/studio/parity.mjs --old '<command>' --new '<command>' [--grep '^CLIP'] [--tolerance 0.005]
//                                  [--new-covers-only] [--timeout 900] [--json out.json]
//
//   --preset clip     the clip check: blender/checks/clip.mjs --browser against its engine run (no check
//                     cache); clip-rig the same with --rig
//   --tolerance       numbers within this of each other match (default 0.005; 0 for exact)
//   --new-covers-only rows only the old tool prints are listed as not covered, not counted as differences
//                     (the new tool runs a subset today); rows only the new tool prints always differ
//   --timeout         seconds each command may run (default 900)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const PRESETS = {
  // The clip check in harness pages against the engine (where only `sky` opens a page), with and
  // without the rig.
  clip: {
    old: 'HITL_NO_CHECK_CACHE=1 node blender/checks/clip.mjs --browser', new: 'HITL_NO_CHECK_CACHE=1 node blender/checks/clip.mjs',
    grep: '^CLIP', tolerance: 0.005,
  },
  'clip-rig': {
    old: 'HITL_NO_CHECK_CACHE=1 node blender/checks/clip.mjs --rig --browser', new: 'HITL_NO_CHECK_CACHE=1 node blender/checks/clip.mjs --rig',
    grep: '^CLIP', tolerance: 0.005,
  },
  stage: {
    old: 'node blender/checks/stage.mjs --browser --rows', new: 'node blender/checks/stage.mjs --rows',
    grep: '^STAGEROW', tolerance: 0.005,
  },
  // The standup cases (speech included) in harness pages against the engine; the live conversations
  // run in a browser either way, so both leave them out.
  standup: {
    old: 'HITL_NO_CHECK_CACHE=1 node blender/checks/standup.mjs --browser --no-live', new: 'HITL_NO_CHECK_CACHE=1 node blender/checks/standup.mjs --no-live',
    grep: '^STANDUP', tolerance: 0.005,
  },
  // The pose matrices in a harness page against the engine, every cell's verdicts and measure ranges,
  // judged by each gesture's own pass rule (pose-matrix.js PRESETS).
  facepalm: matrixPreset('--gesture facepalm --matrix views=all,postures=all,builds=all,rig=on,off'),
  slap: matrixPreset('--gesture slap --matrix cause=none,unplug,emptyDesk'),
};

function matrixPreset(flags) {
  return { old: `node blender/checks/pose.mjs ${flags} --rows --browser`, new: `node blender/checks/pose.mjs ${flags} --rows`, grep: '^CELL', tolerance: 0.005 };
}

// "CLIP ok   desk:f1 {"a":1}" into { name: "CLIP ok   desk:f1", value: { a: 1 } }; the status word is
// part of the value, so a case that passes in one and fails in the other differs.
export function parseRow(line) {
  const i = line.indexOf('{');
  if (i < 0) return { name: line.trim(), value: null, status: null };
  const head = line.slice(0, i).trim().split(/\s+/);
  const status = /^(ok|FAIL|pass|fail)$/i.test(head[1] ?? '') ? head[1] : null;
  const name = (status ? [head[0], ...head.slice(2)] : head).join(' ');
  let value;
  try { value = JSON.parse(line.slice(i)); } catch { value = line.slice(i); }
  return { name, value, status };
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Where two parsed values differ beyond tol, as a list of "path: a vs b"; empty when they match.
export function diffValues(a, b, tol, path = '') {
  if (typeof a === 'number' && typeof b === 'number') return near(a, b, tol) ? [] : [`${path || 'value'}: ${a} vs ${b}`];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${path || 'value'}: length ${a.length} vs ${b.length}`];
    return a.flatMap((x, i) => diffValues(x, b[i], tol, `${path}[${i}]`));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => (k in a && k in b ? diffValues(a[k], b[k], tol, path ? `${path}.${k}` : k) : [`${path ? `${path}.` : ''}${k}: only in ${k in a ? 'old' : 'new'}`]));
  }
  return a === b ? [] : [`${path || 'value'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

// Compares two lists of lines. Returns { matched, differ: [{ name, why }], onlyOld: [name], onlyNew: [name] }.
export function compareRows(oldLines, newLines, { tolerance = 0.005 } = {}) {
  const index = (lines) => new Map(lines.map(parseRow).map((r) => [r.name, r]));
  const o = index(oldLines), n = index(newLines);
  const differ = [];
  let matched = 0;
  for (const [name, a] of o) {
    const b = n.get(name);
    if (!b) continue;
    const why = [...(a.status !== b.status ? [`status: ${a.status} vs ${b.status}`] : []), ...diffValues(a.value, b.value, tolerance)];
    if (why.length) differ.push({ name, why }); else matched++;
  }
  return { matched, differ, onlyOld: [...o.keys()].filter((k) => !n.has(k)), onlyNew: [...n.keys()].filter((k) => !o.has(k)) };
}

function run(command, timeoutS, children) {
  return new Promise((resolve) => {
    const p = spawn('sh', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    children.add(p);
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } }, timeoutS * 1000);
    p.on('close', (code, signal) => { clearTimeout(timer); children.delete(p); resolve({ code, signal, out, err }); });
  });
}

async function main() {
  const { values } = parseArgs({ options: { preset: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' }, grep: { type: 'string' }, tolerance: { type: 'string' }, 'new-covers-only': { type: 'boolean' }, timeout: { type: 'string' }, json: { type: 'string' } } });
  const preset = values.preset ? PRESETS[values.preset] : null;
  if (values.preset && !preset) { console.error(`parity: unknown preset ${values.preset} (want ${Object.keys(PRESETS).join(', ')})`); return 2; }
  const cfg = { ...(preset ?? {}), ...Object.fromEntries(Object.entries({ old: values.old, new: values.new, grep: values.grep }).filter(([, v]) => v !== undefined)) };
  if (!cfg.old || !cfg.new) { console.error('usage: parity.mjs --preset clip | --old <command> --new <command> [--grep <regex>] [--tolerance n] [--new-covers-only]'); return 2; }
  const tolerance = Number(values.tolerance ?? cfg.tolerance ?? 0.005);
  const coversOnly = values['new-covers-only'] ?? cfg.newCoversOnly ?? false;
  const timeoutS = Number(values.timeout ?? 900);
  let grep;
  try { grep = new RegExp(cfg.grep ?? '.'); } catch (e) { console.error(`parity: bad --grep: ${e.message}`); return 2; }
  if (!(tolerance >= 0) || !(timeoutS > 0)) { console.error('parity: --tolerance and --timeout want positive numbers'); return 2; }

  const children = new Set();
  const stop = () => { for (const p of children) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } } process.exit(143); };
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, stop);
  // One after the other: both may want the same cores, and a timing-free answer needs neither rushed.
  const a = await run(cfg.old, timeoutS, children);
  const b = await run(cfg.new, timeoutS, children);
  const lines = (r) => r.out.split('\n').filter((l) => grep.test(l));
  const failed = [['old', a], ['new', b]].filter(([, r]) => r.signal || (lines(r).length === 0));
  for (const [which, r] of failed) console.error(`parity: the ${which} command printed no matching lines (exit ${r.code ?? r.signal})\n${(r.err || r.out).trim().split('\n').slice(-3).join('\n')}`);
  if (failed.length) return 2;

  const result = compareRows(lines(a), lines(b), { tolerance });
  for (const d of result.differ) console.log(`DIFF ${d.name}\n  ${d.why.join('\n  ')}`);
  for (const k of result.onlyNew) console.log(`ONLY NEW ${k}`);
  for (const k of result.onlyOld) console.log(`${coversOnly ? 'NOT COVERED' : 'ONLY OLD'} ${k}`);
  const bad = result.differ.length + result.onlyNew.length + (coversOnly ? 0 : result.onlyOld.length);
  console.log(`parity: ${result.matched} rows match within ${tolerance}, ${result.differ.length} differ, ${result.onlyNew.length} only in the new tool, ${result.onlyOld.length} only in the old${coversOnly ? ' (not covered, not counted)' : ''}`);
  if (values.json) writeFileSync(values.json, JSON.stringify(result, null, 1));
  return bad ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
