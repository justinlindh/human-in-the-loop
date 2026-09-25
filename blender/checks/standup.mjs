// Standups stay indoors (issue #149): in every mock office, with and without a meeting table and a
// whiteboard, a staged standup gathers everyone inside the walls and outside all furniture.
//
//   node blender/checks/standup.mjs      prints one line per case; exits 1 if any fails
import { startHarness } from './harness.mjs';
import { inputHash, passedAt, recordPass } from './cache.mjs';

const CASES = [];
for (const mock of ['garage', 'floor', 'hq']) for (const strip of ['none', 'meeting', 'meeting+whiteboard']) CASES.push({ mock, strip });
// The review desk's case: a real garage (seed 26, bot-played to week 110) whose whiteboard faces a wall.
CASES.push({ seed: 26, weeks: 110, strip: 'none' });

// Cases run concurrently (--jobs=N, default 8), each in its own seeded page; a full pass is
// recorded against a hash of every input (cache.mjs) and unchanged inputs skip the run.
const JOBS = Math.max(1, Number(process.argv.find((a) => a.startsWith('--jobs='))?.slice(7)) || 8);
const hash = inputHash('standup');
const before = passedAt('standup', hash);
if (before) {
  console.log(`standup: inputs unchanged since ${before}, skipped`);
  process.exit(0);
}
const H = await startHarness({ browsers: JOBS });
let failed = 0;
const lines = new Map();
async function runCase(c, slot) {
  const { page, errors } = await H.openScene(c.seed ? `quality=low&seed=${c.seed}` : `quality=low&mock=${c.mock}`, { width: 640, height: 400, slot });
  const res = await page.evaluate(async ({ strip, weeks }) => {
    const R = window.__hitlRender, S = window.__HITL.state;
    const C = await import('/src/render/checks.js');
    if (weeks) {
      const sim = await import('/src/sim/index.js');
      const b = await import('/src/sim/bots.js');
      for (let i = 0; i < weeks && !S.gameOver; i++) { b.botDecide('balanced', S); b.botTurn('balanced', S); sim.tick(S); }
      b.botDecide('balanced', S);
      S.lockdown = null; S.workPolicy = 'office'; for (const p of S.staff) { p.remote = false; p.call = null; }
      R.setSpeed(1); R.setPaused(false);
    }
    R.perks.hold = true;
    const drop = strip === 'none' ? [] : strip === 'meeting' ? ['meeting_table'] : ['meeting_table', 'whiteboard', 'whiteboard_wall'];
    S.office.placed = S.office.placed.filter((p) => !drop.includes(p.itemId));
    for (let i = 0; i < 60; i++) { window.__tick(1000 / 30); R.sync(S); R.advance(1 / 30); }
    return C.runStandupCheck(R, S);
  }, c);
  if (!res.pass || errors.length) failed++;
  lines.set(c, `STANDUP ${res.pass && !errors.length ? 'ok  ' : 'FAIL'} ${c.seed ? `seed${c.seed}-w${c.weeks}` : c.mock}:${c.strip} ${JSON.stringify(res)}${errors.length ? ' errors: ' + errors[0] : ''}`);
  await page.close();
}
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, CASES.length) }, async (_, slot) => {
  while (next < CASES.length) {
    const c = CASES[next++];
    try { await runCase(c, slot); } catch (e) { failed++; lines.set(c, `STANDUP FAIL ${c.seed ? `seed${c.seed}` : c.mock}:${c.strip} error: ${e.message.split('\n')[0]}`); }
  }
}));
await H.close();
for (const c of CASES) console.log(lines.get(c));
console.log(`standup: ${CASES.length - failed} of ${CASES.length} passed`);
if (!failed) recordPass('standup', hash);
process.exit(failed ? 1 : 0);
