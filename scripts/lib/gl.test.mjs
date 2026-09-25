// Cases for scripts/lib/gl.js. Exit 0 when all pass.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { glMode, glArgs, rendererMatches, SOFTWARE_GL_ARGS, GPU_GL_ARGS } from './gl.js';

const cases = [
  ['defaults to the GPU', () => assert.equal(glMode({ argv: [], env: {} }), 'gpu')],
  ['defaults to software under CI', () => assert.equal(glMode({ argv: [], env: { CI: 'true' } }), 'software')],
  ['HITL_GL=gpu beats CI', () => assert.equal(glMode({ argv: [], env: { CI: 'true', HITL_GL: 'gpu' } }), 'gpu')],
  ['HITL_GL=software picks software', () => assert.equal(glMode({ argv: [], env: { HITL_GL: 'software' } }), 'software')],
  ['--software beats HITL_GL=gpu', () => assert.equal(glMode({ argv: ['--software'], env: { HITL_GL: 'gpu' } }), 'software')],
  ['--gpu beats HITL_GL=software', () => assert.equal(glMode({ argv: ['--gpu'], env: { HITL_GL: 'software' } }), 'gpu')],
  ['an unknown HITL_GL falls back', () => assert.equal(glMode({ argv: [], env: { HITL_GL: 'fast' }, fallback: 'software' }), 'software')],
  ['each mode has its launch flags', () => { assert.equal(glArgs('software'), SOFTWARE_GL_ARGS); assert.equal(glArgs('gpu'), GPU_GL_ARGS); }],
  ['a hardware renderer satisfies the GPU', () => assert.ok(rendererMatches('gpu', 'ANGLE (NVIDIA, Vulkan 1.4 (NVIDIA GeForce RTX 5090), NVIDIA)'))],
  ['SwiftShader does not satisfy the GPU', () => assert.ok(!rendererMatches('gpu', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'))],
  ['llvmpipe does not satisfy the GPU', () => assert.ok(!rendererMatches('gpu', 'llvmpipe (LLVM 19.1.7, 256 bits)'))],
  ['no WebGL2 does not satisfy the GPU', () => { assert.ok(!rendererMatches('gpu', null)); assert.ok(!rendererMatches('gpu', '')); }],
  ['software accepts any renderer', () => assert.ok(rendererMatches('software', 'SwiftShader'))],
];
// holdRenderLock, end to end: a probe script takes the lock for a mode and reports which lock
// files are busy while it runs (a lock this process holds reads as busy to a separate flock).
const lib = fileURLToPath(new URL('./gl.js', import.meta.url));
const wrl = fileURLToPath(new URL('../with-render-lock.sh', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'hitl-gl-'));
const probe = join(tmp, 'probe.mjs');
writeFileSync(probe, `import { holdRenderLock } from ${JSON.stringify(lib)};
import { spawnSync } from 'node:child_process';
holdRenderLock(process.argv[2]);
const busy = (f) => spawnSync('flock', ['-n', f, 'true']).status !== 0;
console.log(JSON.stringify({ soft: busy(${JSON.stringify(join(tmp, 'render-checks.lock'))}), gpu: busy(${JSON.stringify(join(tmp, 'gpu-render-1.lock'))}), holder: process.env.HITL_RENDER_LOCK_HELD === String(process.pid) }));
process.exit(Number(process.argv[3] ?? 0));
`);
const env = { ...process.env, HITL_LOCK_DIR: tmp, HITL_GPU_SLOTS: '1', RENDER_LOCK_WAIT: '5', HITL_TIMINGS: 'off' };
delete env.CI; delete env.HITL_RENDER_LOCK_HELD;
const runProbe = (args, extra = {}, pre = []) => {
  const r = spawnSync(pre.length ? 'bash' : process.execPath, pre.length ? [...pre, process.execPath, probe, ...args] : [probe, ...args], { env: { ...env, ...extra }, encoding: 'utf8' });
  const line = r.stdout.trim().split('\n').pop();
  return { status: r.status, out: line ? JSON.parse(line) : null, err: r.stderr };
};
cases.push(
  ['holdRenderLock takes a GPU slot', () => assert.deepEqual(runProbe(['gpu']).out, { soft: false, gpu: true, holder: true })],
  ['holdRenderLock takes the software lock', () => assert.deepEqual(runProbe(['software']).out, { soft: true, gpu: false, holder: true })],
  ['holdRenderLock says how long it waited', () => assert.match(runProbe(['gpu']).err, /waited \d+s for GPU render slot 1/)],
  ['a GPU run inside a software holder takes nothing more', () => assert.deepEqual(runProbe(['gpu'], {}, [wrl, '--software']).out, { soft: true, gpu: false, holder: true })],
  ['a software run inside a GPU slot still takes the software lock', () => assert.deepEqual(runProbe(['software'], {}, [wrl, '--gpu']).out, { soft: true, gpu: true, holder: true })],
  ['a GPU run inside a GPU slot does not wait for a second one', () => assert.equal(runProbe(['gpu'], {}, [wrl, '--gpu']).status, 0)],
  ['under CI nothing is locked', () => assert.deepEqual(runProbe(['gpu'], { CI: 'true' }).out, { soft: false, gpu: false, holder: false })],
  ['the exit status passes through', () => assert.equal(runProbe(['gpu', '3']).status, 3)],
);

let fails = 0;
for (const [name, fn] of cases) {
  try { fn(); } catch (e) { fails++; console.log(`FAIL ${name}: ${e.message}`); }
}

// webgl_lost: a real (software GL) browser whose page loses its context logs one line; a clean one none.
const lossRun = (lose) => {
  const log = join(tmp, `timings-${lose ? 'lost' : 'clean'}.jsonl`);
  const probe = join(tmp, 'lose.mjs');
  // Local CI runs this file from a checkout of main without node_modules, in the tree under test:
  // resolve playwright from the working directory first.
  const resolvePw = (from) => { try { return createRequire(from).resolve('playwright'); } catch { return ''; } };
  const pw = pathToFileURL(resolvePw(pathToFileURL(join(process.cwd(), 'x.js'))) || createRequire(import.meta.url).resolve('playwright')).href;
  writeFileSync(probe, `import playwright from ${JSON.stringify(pw)};
const { chromium } = playwright;
import { launchChromium } from ${JSON.stringify(lib)};
const { browser } = await launchChromium(chromium, { mode: 'software', label: 'gl-test' });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto('data:text/html,<canvas id=c></canvas>');
if (${lose}) await page.evaluate(() => document.getElementById('c').getContext('webgl').getExtension('WEBGL_lose_context').loseContext());
await page.waitForTimeout(300);
await browser.close();
`);
  const r = spawnSync(process.execPath, [probe], { cwd: fileURLToPath(new URL('../..', import.meta.url)), env: { ...env, HITL_TIMINGS: log }, encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) throw new Error(`probe exited ${r.status}: ${r.stderr.slice(0, 300)}`);
  let text = ''; try { text = readFileSync(log, 'utf8'); } catch { /* no line */ }
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.webgl_lost);
};
for (const [name, fn] of [
  ['a lost WebGL context logs webgl_lost', () => { const l = lossRun(true); assert.equal(l.length, 1); assert.equal(l[0].tool, 'gl-test'); assert.ok(l[0].lost_events >= 1); }],
  ['a page that keeps its context logs nothing', () => assert.equal(lossRun(false).length, 0)],
]) {
  try { fn(); } catch (e) { fails++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(fails ? `gl: ${fails} failing` : 'gl: all cases pass');
rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
