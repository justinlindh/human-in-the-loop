#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { makeTemp } from '../tools/tmp.mjs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const { values } = parseArgs({ options: { out: { type: 'string' }, runs: { type: 'string', default: '3' }, frames: { type: 'string', default: '15' } } });
const runs = Number(values.runs), count = Number(values.frames);
if (![runs, count].every(n => Number.isInteger(n) && n > 0)) throw new Error('runs and frames must be positive integers');
const dir = makeTemp('codex-scene-bench-');
const cases = [[], ['occupancy', 'projections'], ['visibility'], ['intersections'], ['intersections', 'clearances', 'visibility', 'projections', 'occupancy']];
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))];
const summary = numbers => ({ p50: percentile(numbers, 0.5), p95: percentile(numbers, 0.95), min: Math.min(...numbers), max: Math.max(...numbers) });
const run = (file, args) => {
  const start = performance.now();
  const child = spawnSync(process.execPath, [new URL(file, import.meta.url).pathname, ...args], { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  if (child.status !== 0) throw new Error(`${file} exited ${child.status}: ${child.stderr}\n${child.stdout}`);
  return performance.now() - start;
};
try {
  const cold = [];
  for (let i = 0; i < runs; i++) {
    const profile = join(dir, `cold-${i}.json`);
    const cliWallMs = run('./scene.mjs', ['--from', '0', '--json', '--profile', profile]);
    cold.push({ cliWallMs, ...JSON.parse(readFileSync(profile, 'utf8')) });
  }
  const workloads = [];
  for (const facts of cases) {
    const reports = [];
    for (let i = 0; i < runs; i++) {
      const out = join(dir, 'comparison.json');
      run('./compare.mjs', ['--frames', [0, 30, ...Array.from({ length: count }, (_, n) => n + 31)].join(','), '--facts', facts.join(','), '--control-perk-delay', '3', '--out', out]);
      reports.push(JSON.parse(readFileSync(out, 'utf8')));
    }
    const rows = reports.flatMap(r => r.rows.filter(row => row.frame > 30));
    const measurements = {};
    for (const side of ['node', 'browser']) {
      measurements[side] = {
        openMs: summary(reports.map(r => side === 'node' ? r.nodeReadyMs : r.browserOpenMs)),
        sampleMs: summary(rows.map(r => r[`${side}Timing`].sampleMs)),
        stepMs: summary(rows.map(r => r[`${side}Timing`].stepMs)),
        stepAndSampleMs: summary(rows.map(r => r[`${side}Timing`].stepMs + r[`${side}Timing`].sampleMs)),
        roundTripMs: summary(rows.map(r => r[`${side}RoundTripMs`])),
      };
    }
    const result = { facts, ...measurements, lockPhasesMs: reports.map(r => r.harnessPhases.lock),
      draws: Math.max(...rows.map(r => r.drawAudit.total)), differences: rows.reduce((sum, r) => sum + r.differences.length, 0) };
    workloads.push(result); console.log(JSON.stringify(result));
  }
  const report = { schema: 'hitl.scene-benchmark/0.1', node: process.version, platform: process.platform, architecture: process.arch,
    runs, framesPerRun: count, warmFrames: 30, mock: 'floor', quality: 'low', rig: false, viewport: [1600, 1000],
    control: 'Both environments use a 3-second initial perk delay in memory to compare identical states; production source is unchanged.',
    cold, workloads };
  if (values.out) writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
} finally { rmSync(dir, { recursive: true, force: true }); }
