// Controls for golden's identity cache record: each case runs golden.mjs for real against a
// scratch cache (HITL_CHECK_CACHE_DIR) and checks its exit code and output.
//   node blender/checks/golden-identity-controls.mjs
// Takes golden's render lock through golden itself; run under timeout and nice.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cache = mkdtempSync(join(tmpdir(), 'golden-identity-'));
const identityRecord = join(cache, 'golden-identity-scenes', 'char-lineup.json');
// Failure renders go to a scratch directory, so running this never touches the checkout's own shots.
const shots = join(cache, 'shots');
const shotFiles = ['stepped', 'settled'].map((k) => join(shots, `char-lineup.${k}.png`));
const clearShots = () => shotFiles.forEach((f) => rmSync(f, { force: true }));
// A deliberate temporal effect: every drawn frame moves the camera a little further.
const TEMPORAL = 'const R=window.__hitlRender,r=R.render;let n=0;R.render=(dt,o)=>{r(dt,o);if(!o||o.draw!==false)R.focusAt(n++*0.05,0,1.7)};';
// Only the frame-by-frame render fails to run.
const STEP_THROWS = 'window.__step=()=>{throw new Error("stepped render broke")};';
const HARMLESS = 'window.__control=1;';

const env = (extra = {}) => ({ ...process.env, HITL_CHECK_CACHE_DIR: cache, HITL_NO_CHECK_CACHE: '', HITL_GOLDEN_OUT: shots, ...extra });
function golden(args, extra) {
  const t = Date.now();
  const r = spawnSync('node', ['blender/checks/golden.mjs', ...args], { cwd: ROOT, encoding: 'utf8', env: env(extra), timeout: 600000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, ms: Date.now() - t };
}
const rendered = (r) => r.out.includes('harness: GL');
let failures = 0;
function control(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
}
const ONLY = ['--only=char-lineup'];

try {
  let r = golden(ONLY);
  control('cold run passes, records identity', () => { assert.equal(r.code, 0, r.out); assert.ok(existsSync(identityRecord)); });

  r = golden(ONLY);
  control('unchanged rerun uses no browser', () => { assert.equal(r.code, 0); assert.ok(!rendered(r), r.out); assert.match(r.out, /identity is on record/); });

  rmSync(identityRecord, { force: true });
  r = golden(ONLY);
  control('scene records alone cannot establish identity: browser opens and the check runs', () => { assert.equal(r.code, 0, r.out); assert.ok(rendered(r)); assert.match(r.out, /byte-identical/); assert.ok(existsSync(identityRecord)); });

  r = golden(['--only=prop-lineup']);
  control('subset of other scenes reuses the identity record', () => { assert.equal(r.code, 0, r.out); assert.match(r.out, /on record, not redrawn/); });

  clearShots();
  r = golden(ONLY, { HITL_GOLDEN_IDENTITY_SETUP: TEMPORAL });
  control('temporal draw effect: scene passes, identity fails, both renders and hashes kept', () => {
    assert.equal(r.code, 1, r.out); assert.match(r.out, /identity mismatch/); assert.match(r.out, /stepped sha [0-9a-f]+, settled sha/);
    assert.ok(shotFiles.every(existsSync));
  });
  r = golden(ONLY, { HITL_GOLDEN_IDENTITY_SETUP: TEMPORAL });
  control('unchanged rerun of the failing effect fails again with scenes cached', () => { assert.equal(r.code, 1, r.out); assert.ok(rendered(r)); assert.match(r.out, /identity mismatch/); });

  clearShots();
  r = golden(ONLY, { HITL_GOLDEN_IDENTITY_SETUP: STEP_THROWS });
  control('one render erroring: fails closed and keeps the render that exists', () => {
    assert.equal(r.code, 1, r.out); assert.match(r.out, /identity stepped render failed to run: .*stepped render broke/);
    assert.ok(!existsSync(shotFiles[0]) && existsSync(shotFiles[1]));
  });

  r = golden(ONLY, { HITL_GOLDEN_IDENTITY_SETUP: HARMLESS });
  control('changed identity inputs invalidate the record', () => { assert.equal(r.code, 0, r.out); assert.ok(rendered(r)); assert.match(r.out, /byte-identical/); assert.ok(!r.out.includes('not redrawn')); });

  const off = golden(ONLY, { HITL_NO_CHECK_CACHE: '1' });
  const off2 = golden(ONLY, { HITL_NO_CHECK_CACHE: '1' });
  control('cache disabled: identity is checked every run', () => {
    for (const x of [off, off2]) { assert.equal(x.code, 0, x.out); assert.ok(rendered(x)); assert.match(x.out, /byte-identical/); assert.ok(!x.out.includes('on record')); }
  });

  // Interrupted mid-check (setup for the next control).
  golden(ONLY);
  rmSync(identityRecord, { force: true });
  await new Promise((done) => {
    const child = spawn('node', ['blender/checks/golden.mjs', ...ONLY], { cwd: ROOT, env: env(), stdio: 'ignore', detached: true });
    setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } }, 3000);
    child.on('exit', () => done());
  });
  r = golden(ONLY);
  control('after an interrupted check, the next run rechecks identity instead of skipping', () => { assert.equal(r.code, 0, r.out); assert.match(r.out, /byte-identical/); assert.ok(!r.out.includes('not redrawn')); });
} finally {
  rmSync(cache, { recursive: true, force: true });
}
console.log(failures ? `golden-identity-controls: ${failures} control(s) failed` : 'golden-identity-controls: all controls pass');
process.exit(failures ? 1 : 0);
