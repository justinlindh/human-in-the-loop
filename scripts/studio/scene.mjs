#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { openScene } from './index.mjs';

const { values } = parseArgs({ options: Object.fromEntries([
  ...['mock', 'snapshot', 'seed', 'week', 'from', 'to', 'every', 'who', 'facts', 'profile'].map(k => [k, { type: 'string' }]),
  ['json', { type: 'boolean' }], ['rig', { type: 'boolean' }], ['help', { type: 'boolean' }],
]) });
if (values.help) {
  console.log('node scripts/studio/scene.mjs [--mock floor | --snapshot file | --seed N --week W] --from 0 --to 2 --every 0.2 --facts occupancy,projections --who s1 --json [--rig] [--profile file]');
  process.exit(0);
}
let scene;
try {
  const sources = ['mock', 'snapshot', 'seed'].filter(k => values[k] != null);
  if (sources.length > 1) throw new Error('select one state source');
  const frame = (name, fallback) => {
    const seconds = Number(values[name] ?? fallback), n = Math.round(seconds * 30);
    if (!Number.isFinite(seconds) || seconds < 0 || Math.abs(n / 30 - seconds) > 1e-6) throw new Error(`${name} must be a nonnegative multiple of 1/30 seconds`);
    return n;
  };
  const from = frame('from', 0), to = frame('to', values.from ?? 0), every = frame('every', 1 / 30);
  if (!every || to < from) throw new Error('every must be positive and to must be at least from');
  const facts = values.facts?.split(',') ?? [];
  if (facts.some(f => !['intersections', 'clearances', 'visibility', 'projections', 'occupancy'].includes(f))) throw new Error('unknown fact family');
  for (const k of ['seed', 'week']) if (values[k] != null && (!Number.isSafeInteger(Number(values[k])) || Number(values[k]) < 0)) throw new Error(`${k} must be a nonnegative integer`);
  scene = await openScene({ mock: values.mock ?? 'floor', snapshot: values.snapshot,
    seed: values.seed == null ? undefined : Number(values.seed), week: Number(values.week ?? 0), rig: values.rig });
  const timings = [];
  for (let n = from; n <= to; n += every) {
    const { result, timing } = await scene.sample(n, { facts, who: values.who?.split(',') });
    process.stdout.write(`${JSON.stringify(result)}\n`); timings.push({ frame: n, ...timing });
  }
  if (values.profile) writeFileSync(values.profile, JSON.stringify({ readyMs: scene.readyMs, frames: timings }, null, 2) + '\n');
} catch (error) { console.error(`scene-engine: ${error.message}`); process.exitCode = 2; }
finally { await scene?.close(); }
