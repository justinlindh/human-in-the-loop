#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { sampleMany } from './index.mjs';

const { values } = parseArgs({ options: { input: { type: 'string' }, jobs: { type: 'string', default: '2' } } });
try {
  if (!values.input) throw new Error('use --input requests.json [--jobs 2]');
  const requests = JSON.parse(readFileSync(values.input, 'utf8'));
  if (!Array.isArray(requests) || !requests.length) throw new Error('input must be a nonempty array of scene requests');
  const results = await sampleMany(requests, { jobs: Number(values.jobs) });
  for (const [requestIndex, { result }] of results.entries()) process.stdout.write(JSON.stringify({ ...result, requestIndex }) + '\n');
} catch (error) { console.error(`scene-engine: ${error.message}`); process.exitCode = 2; }
