// Standups stay indoors (issue #149): in every mock office, with and without a meeting table and a
// whiteboard, a staged standup gathers everyone inside the walls and outside all furniture. With a
// meeting table on Medium, attendees sit in its chairs (runStandupTableCheck). The speech cases follow
// the standup's bubbles and turn order (standup-speech.mjs), and standup-live.mjs then plays generated
// conversations through the real game loop.
//
//   node blender/checks/standup.mjs [--jobs=N] [--browser] [--no-live]
//
// The cases play on the studio engine by default, each in its own Node process (page-host.mjs), with no
// browser or render slot; --browser plays them in harness pages instead, the reference the engine is
// held to (`node scripts/studio/parity.mjs --preset standup`). The live conversations need main.js's own
// loop, so they always run in a browser after the cases pass; --no-live leaves them out.
import { inputHash, passedAt, recordPass } from './cache.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { standupPage } from './standup-pages.js';

const CASES = [];
for (const mock of ['garage', 'floor', 'hq']) for (const strip of ['none', 'meeting', 'meeting+whiteboard']) CASES.push({ mock, strip });
// The review desk's case: a real garage (seed 26, bot-played to week 110) whose whiteboard faces a wall.
CASES.push({ seed: 26, weeks: 110, strip: 'none' });
for (const speed of [1, 2, 4]) CASES.push({ mock: 'floor', strip: 'none', speech: { speed } });
for (const path of ['denied', 'ambient', 'priority', 'pause', 'menu', 'speed', 'departure', 'away', 'empty']) CASES.push({ mock: 'floor', strip: 'none', speech: { path } });
// At a meeting table (issue #974): seated around it on Medium, the standing ring on Low.
for (const mock of ['floor', 'hq']) for (const quality of ['medium', 'low']) CASES.push({ mock, strip: 'none', table: true, quality });

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => !['--browser', '--no-live', '--gpu', '--software'].includes(a) && !a.startsWith('--jobs='));
if (unknown.length) { console.error(`standup: unknown option ${unknown.join(' ')} (want --jobs=N --browser --no-live --gpu --software)`); process.exit(2); }
const BROWSER = argv.includes('--browser');
const LIVE = !argv.includes('--no-live');
const jobsArg = argv.find((a) => a.startsWith('--jobs='))?.slice(7);
if (jobsArg !== undefined && !(Number.isInteger(Number(jobsArg)) && Number(jobsArg) >= 1)) { console.error(`standup: --jobs wants a whole number of at least 1 (got ${jobsArg})`); process.exit(2); }
const JOBS = Number(jobsArg) || 8;
// A full pass is recorded against a hash of every input (cache.mjs); an engine pass also on scripts/studio/.
const studio = new URL('../../scripts/studio/', import.meta.url);
const studioHash = () => { const h = createHash('sha256'); for (const f of readdirSync(studio).filter((n) => n.endsWith('.mjs')).sort()) h.update(f).update(readFileSync(new URL(f, studio))); return h.digest('hex').slice(0, 16); };
const hash = inputHash('standup', `${BROWSER ? 'browser' : `engine:${studioHash()}`}${LIVE ? '' : '\nno-live'}`);
const before = passedAt('standup', hash);
if (before) {
  console.log(`standup${BROWSER ? ' --browser' : ''}: inputs unchanged since ${before}, skipped`);
  process.exit(0);
}
const pageOf = (c) => (c.seed ? { seed: c.seed, quality: 'low' } : { mock: c.mock, quality: c.quality ?? 'low' });
// One distinct name per case, so a parity run compares every row (the speech cases name their speed or path).
const label = (c) => `${c.seed ? `seed${c.seed}-w${c.weeks}` : c.mock}:${c.table ? `table-${c.quality}` : c.speech ? `speech-${c.speech.path ?? `${c.speech.speed}x`}` : c.strip}`;
let failed = 0;
const lines = new Map();
const record = (c, res, errors = []) => {
  if (!res.pass || errors.length) failed++;
  lines.set(c, `STANDUP ${res.pass && !errors.length ? 'ok  ' : 'FAIL'} ${label(c)} ${JSON.stringify(res)}${errors.length ? ' errors: ' + errors[0] : ''}`);
};
const fail = (c, message) => { failed++; lines.set(c, `STANDUP FAIL ${c.seed ? `seed${c.seed}` : c.mock}:${c.strip} error: ${message.split('\n')[0]}`); };
if (BROWSER) {
  const { startHarness } = await import('./harness.mjs');
  const H = await startHarness({ browsers: JOBS });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, CASES.length) }, async (_, slot) => {
    while (next < CASES.length) {
      const c = CASES[next++];
      try {
        const p = pageOf(c);
        const { page, errors } = await H.openScene(c.seed ? `quality=low&seed=${c.seed}` : `quality=${p.quality}&mock=${c.mock}`, { width: 640, height: 400, slot });
        record(c, await page.evaluate(standupPage, c), errors);
        await page.close();
      } catch (e) { fail(c, e.message); }
    }
  }));
  await H.close();
} else {
  const { runCases } = await import('../../scripts/studio/page-host.mjs');
  const module = fileURLToPath(new URL('./standup-pages.js', import.meta.url));
  const got = await runCases(CASES.map((c) => ({ page: pageOf(c), module, fn: 'standupPage', arg: c })), { jobs: jobsArg ? JOBS : undefined });
  got.forEach((r, i) => (r.error ? fail(CASES[i], r.error) : record(CASES[i], r.value)));
}
for (const c of CASES) console.log(lines.get(c));
console.log(`standup: ${CASES.length - failed} of ${CASES.length} passed${BROWSER ? ' (browser)' : ''}`);
if (!failed && LIVE) {
  const live = spawnSync('timeout', ['540', 'nice', '-n', '10', 'node', 'blender/checks/standup-live.mjs', ...argv.filter(a => a === '--gpu' || a === '--software')], { stdio: 'inherit' });
  if (live.status !== 0) failed++;
  console.log(`standup: live conversations ${live.status === 0 ? 'passed' : 'FAILED'}`);
}
if (!failed) recordPass('standup', hash);
process.exit(failed ? 1 : 0);
