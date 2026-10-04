import { describe, it, expect, beforeAll } from 'vitest';
import { Worker } from 'node:worker_threads';

// Exit rates fall off a cliff within a few hundredths of each start's exitMrrMult, so this pins every
// era start's exit rate (IPO or acquisition) near Classic's for the bots that aim to exit. The band is
// 15 points either side of Classic's rate for the same bot: about three standard deviations of the
// difference between two 200-seed rates, and well inside the swing a step off the cliff causes.
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const BOTS = ['balanced', 'sensible'];
const STARTS = ['classic', 'preinternet', 'dotcom', 'web2', 'chatgbt', 'agents'];
const BAND = 0.15;
const rates = {};

beforeAll(() => Promise.all(STARTS.flatMap((startEra) => BOTS.map((name) => new Promise((resolve, reject) => {
  const w = new Worker(new URL('./balance-worker.js', import.meta.url), { workerData: { name, seeds: SEEDS, founding: { startEra }, summary: true } });
  w.once('message', (runs) => { rates[`${startEra}:${name}`] = runs.filter((r) => r.exited).length / runs.length; resolve(); });
  w.once('error', reject);
  w.once('exit', (code) => { if (rates[`${startEra}:${name}`] === undefined) reject(new Error(`worker ${startEra}:${name} exited with ${code}`)); });
})))), 1500000);

describe('era start exit rates stay near Classic (200 seeds per bot)', () => {
  it.each(STARTS.slice(1).flatMap((s) => BOTS.map((b) => [s, b])))('%s %s', (startEra, name) => {
    const classic = rates[`classic:${name}`];
    const rate = rates[`${startEra}:${name}`];
    expect(Math.abs(rate - classic), `${startEra} ${name}: ${Math.round(rate * 100)}% against Classic's ${Math.round(classic * 100)}%`).toBeLessThanOrEqual(BAND);
  });
});
