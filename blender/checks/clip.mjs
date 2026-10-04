// Clipping checks on real furniture (src/render/checks.js), run headless against the mock office.
//
//   node blender/checks/clip.mjs          prints one line per check; exits 1 if any fails
//   node blender/checks/clip.mjs --rig    the same with authored clips on (?rig=1)
//   node blender/checks/clip.mjs --only=printer,desk:f3   only the cases whose names contain one of
//                                         these; exits 1 if none does. A narrowed pass is not recorded
//                                         in the cache, so a full run stays the gate.
//   node blender/checks/clip.mjs --browser   every group in harness pages instead of on the engine
//   node blender/checks/clip.mjs --jobs=4    engine groups at once (default an eighth of the cores)
//
// Seated desk poses in every mood, head bounds, and resting perk poses (couch, beanbag, nap pod,
// arcade stool, library armchair), and pair games (foosball) ready to start and playable on the floor
// and in the garage. The page functions live in clip-pages.js. By default each group plays in its own
// Node process on the studio engine (scripts/studio/clip.mjs), and only `sky`, which reads 2D canvas
// pixels, opens a harness page; `--browser` plays every group in harness pages, the reference the engine
// is held to (`node scripts/studio/parity.mjs --preset clip` compares the two).
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { makeTemp } from '../../scripts/tools/tmp.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inputHash, passedAt, recordPass } from './cache.mjs';
import { fmtTrace, fmtActor } from './diag.mjs';
import { GROUPS, OWN_PAGE, mainGroups, emptyGroups, groupsFor } from './clip-groups.mjs';
import * as P from './clip-pages.js';

const argv = process.argv.slice(2);
const RIG = argv.includes('--rig');
const rig = RIG ? '&rig=1' : '';
const BROWSER = argv.includes('--browser');
// --jobs N or --jobs=N, as stage.mjs takes it.
const jobsArg = argv.find((a) => a.startsWith('--jobs='))?.slice(7) ?? (argv.includes('--jobs') ? argv[argv.indexOf('--jobs') + 1] ?? '' : undefined);
const JOBS = jobsArg === undefined ? undefined : Number(jobsArg);
if (jobsArg !== undefined && !(Number.isInteger(JOBS) && JOBS >= 1)) { console.error(`clip: --jobs wants a whole number of at least 1 (got ${jobsArg})`); process.exit(2); }
const ONLY = argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').map((x) => x.trim()).filter(Boolean) ?? null;
const noMatch = () => { console.log(`clip: no case matches --only=${ONLY.join(',')}`); process.exit(1); };
const wanted = (name) => !ONLY || ONLY.some((p) => name.includes(p));
const runs = groupsFor(ONLY);
// A full pass is recorded against a hash of every input (cache.mjs); unchanged inputs skip the run. An
// engine pass and a browser pass are kept apart, and an engine pass also hashes scripts/studio/.
const studioHash = () => { const h = createHash('sha256'); const dir = new URL('../../scripts/studio/', import.meta.url).pathname; for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) h.update(f).update(readFileSync(join(dir, f))); return h.digest('hex').slice(0, 16); };
// The browser step of an engine run (internal, below) never reads or records the cache.
const STEP = argv.find((a) => a.startsWith('--browser-step='))?.slice(15);
const hash = STEP ? null : inputHash('clip', `${rig}${BROWSER ? '' : `\nengine:${studioHash()}`}`);
const before = passedAt('clip', hash);
if (ONLY && !Object.values(runs).some(Boolean)) noMatch();
if (before && !ONLY) {
  console.log(`clip${RIG ? ' --rig' : ''}${BROWSER ? ' --browser' : ''}: inputs unchanged since ${before}, skipped`);
  process.exit(0);
}
const errors = [];
const resultsBy = {};
const MAIN = mainGroups(GROUPS);
// Plays groups in harness pages, in this process. Each group gets a fresh page, so who a case picks
// and where they start never depend on which groups ran before it (a narrowed --only gives the same
// subject and result).
async function playInBrowser(groups) {
  // Imported only when a page is needed: the harness makes playwright own the process's signals, and
  // takes the render slot by running this process again under the lock.
  const { startHarness } = await import('./harness.mjs');
  const H = await startHarness();
  for (const group of groups) {
    const own = P.OWN_PAGES[group];
    const { page, errors: pageErrors } = await H.openScene(`quality=low&mock=${own?.mock ?? 'floor'}${!own || own.rig ? rig : ''}`, { width: 800, height: 500 });
    await page.evaluate(P.installExact);
    resultsBy[group] = own ? await page.evaluate(own.fn) : await page.evaluate(P.mainPage, Object.fromEntries(MAIN.map((g) => [g, g === group])));
    errors.push(...pageErrors);
    await page.close();
  }
  await H.close();
}
// The browser step of an engine run: plays exactly these groups in pages and writes
// { resultsBy, errors } to a file for the run that started it.
if (STEP) {
  const [file, list] = STEP.split('::');
  await playInBrowser(list.split(','));
  writeFileSync(file, JSON.stringify({ resultsBy, errors }));
  process.exit(0);
}
if (BROWSER) await playInBrowser(Object.keys(GROUPS).filter((g) => runs[g]));
else {
  const studio = await import('../../scripts/studio/clip.mjs');
  const inBrowser = studio.BROWSER_ONLY.filter((g) => runs[g]);
  const onEngine = studio.ENGINE_GROUPS.filter((g) => runs[g]);
  // The browser-only groups play in a child process of their own (its own process group, so ending it
  // ends the browser and the render-lock wrapper it starts), while the engine groups run here.
  const dir = makeTemp('clip-step-');
  let step = null;
  const stopStep = () => { if (step?.exitCode === null) try { process.kill(-step.pid, 'SIGTERM'); } catch { /* already gone */ } };
  // While the engine groups run, their own handler (runGroups, registered after this one) stops them and exits.
  let engineRunning = false;
  const onSignal = (sig) => () => { stopStep(); rmSync(dir, { recursive: true, force: true }); if (!engineRunning) process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGHUP' ? 1 : 15)); };
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => [s, onSignal(s)]);
  for (const [s, h] of handlers) process.on(s, h);
  try {
    const browserRun = !inBrowser.length ? Promise.resolve() : new Promise((done) => {
      step = spawn(process.execPath, [fileURLToPath(import.meta.url), `--browser-step=${join(dir, 'step.json')}::${inBrowser.join(',')}`, ...(RIG ? ['--rig'] : [])], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
      let err = '';
      step.stderr.on('data', (d) => { err += d; });
      step.on('close', (code) => {
        try { const r = JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8')); Object.assign(resultsBy, r.resultsBy); errors.push(...r.errors); } catch { errors.push(`browser step (${inBrowser.join(', ')}) exited ${code}: ${err.trim().split('\n').slice(-2).join(' | ')}`); }
        done();
      });
    });
    engineRunning = onEngine.length > 0;
    const engine = onEngine.length ? await studio.runGroups({ groups: onEngine, rig: RIG, ...(JOBS ? { jobs: JOBS } : {}) }) : { results: {}, errors: [] };
    engineRunning = false;
    Object.assign(resultsBy, engine.results);
    errors.push(...engine.errors);
    await browserRun;
  } finally {
    stopStep();
    for (const [s, h] of handlers) process.off(s, h);
    rmSync(dir, { recursive: true, force: true });
  }
}
// Every registered group, in one order whichever side played it: the floor-office groups, then the
// groups with their own page.
const out = [...MAIN, ...OWN_PAGE].flatMap((g) => resultsBy[g] ?? []);
const shown = out.filter((r) => wanted(r.name));
if (ONLY && !shown.length) noMatch();
let failed = 0;
// A wanted group that produced no case (registered without a runner, or a runner that returned
// nothing) would otherwise pass unnoticed.
for (const g of emptyGroups(Object.keys(GROUPS).filter((x) => runs[x]), resultsBy)) { failed++; console.log(`CLIP FAIL group:${g} {"reason":"the group ran no case"}`); }
for (const r of shown) {
  if (!r.pass) failed++;
  const { name, pass, worstAt, ...nums } = r;
  console.log(`CLIP ${pass ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(nums)}`);
  // A failure prints the worst actor as it stood at the worst sample, and their last trace lines.
  if (!pass && worstAt) {
    console.log(`  worst ${fmtActor(worstAt)}`);
    for (const l of worstAt.trace ?? []) console.log(`  trace ${fmtTrace(l)}`);
  }
}
if (errors.length) { failed++; console.log(`page errors: ${errors.join('; ')}`); }
console.log(`clip: ${shown.length - failed} of ${shown.length} passed${ONLY ? ` (--only=${ONLY.join(',')})` : ''}${BROWSER ? ' (browser)' : ''}`);
if (!failed && !ONLY) recordPass('clip', hash);
process.exit(failed ? 1 : 0);
