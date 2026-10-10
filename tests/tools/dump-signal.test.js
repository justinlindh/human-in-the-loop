import { afterAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

// A --trace-js that spins 200 ms a frame keeps the engine's frame loop in one synchronous stretch for minutes
// (an awaited value never yields to the event loop).
const SPIN = '(() => { const t = process.hrtime.bigint(); while (process.hrtime.bigint() - t < 200000000n); return 0; })()';
const DUMP = resolve(__dirname, '../../blender/checks/dump.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'dump-signal-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const report = join(tmp, 'report.json');
writeFileSync(report, JSON.stringify({ mode: 'fast', violations: [] }));

const start = (...a) => {
  const p = spawn(process.execPath, [DUMP, '--out', join(tmp, 'out'), '--sweep-row', report, 'seed:1:w0', '--clip', '60', '--every', '1', '--trace-js', SPIN, ...a], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (b) => { err += b; });
  const done = new Promise((r) => p.on('exit', (code, signal) => r({ code, signal, err: () => err, at: Date.now() })));
  return { p, done };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (run, ms) => Promise.race([run.done, sleep(ms).then(() => { run.p.kill('SIGKILL'); return null; })]);

describe('dump.mjs ends promptly inside the engine frame loop', () => {
  it('stops on SIGTERM', async () => {
    const run = start();
    await sleep(10000);
    const sent = Date.now();
    run.p.kill('SIGTERM');
    const r = await within(run, 8000);
    expect(r, 'still running 8 s after SIGTERM').not.toBeNull();
    expect(r.signal).toBe('SIGTERM');
    expect(r.at - sent).toBeLessThan(3000);
  }, 30000);
  it('ends a run that overruns --timeout, saying so', async () => {
    const t0 = Date.now();
    const run = start('--timeout', '12');
    const r = await within(run, 30000);
    expect(r, 'still running 30 s into a 12 s limit').not.toBeNull();
    expect(r.err()).toContain('dump: timed out after 12 s');
    expect(r.code === 124 || r.signal === 'SIGTERM').toBe(true);
    expect(r.at - t0).toBeLessThan(25000);
  }, 40000);
});
