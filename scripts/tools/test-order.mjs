// The order vitest starts test files in: the slow files listed below first, longest first, then every
// other file in vitest's own order. With four workers and no duration cache (a fresh tree, every CI
// run), vitest's own order can start a 30 s file last, and the run waits on it alone.
// vite.config.js sets it as test.sequence.sequencer.
//
// Refresh the list from a run on this tree (it merges: files the run did not include keep their entry):
//   node scripts/tools/test-order.mjs --update                    the test:fast set
//   node scripts/tools/test-order.mjs --update -- tests/sim       any vitest run arguments
//   node scripts/tools/test-order.mjs --update --from report.json a vitest JSON report already made
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Seconds per file, from a run on four workers; files under MIN_S are left out.
const MIN_S = 1;
// BEGIN DURATIONS
export const DURATIONS = {
  'tests/sim/full-runs.test.js': 31.4,
  'tests/sim/period-content.test.js': 23.6,
  'tests/tools/studio-clip.test.js': 13.4,
  'tests/tools/studio.test.js': 9.6,
  'tests/tools/studio-compose.test.js': 7.7,
  'tests/tools/sweep-engine.test.js': 7.3,
  'tests/tools/ab.test.js': 6.1,
  'tests/sim/trailer-beats.test.js': 5.7,
  'tests/tools/pose-matrix.test.js': 5.2,
  'tests/tools/review-queue.test.js': 4.6,
  'tests/sim/office-gate.test.js': 2.9,
  'tests/tools/events-find.test.js': 2.8,
  'tests/tools/sweep-against.test.js': 2.8,
  'tests/tools/pose-slap.test.js': 2.6,
  'tests/tools/worktree.test.js': 2.6,
  'tests/sim/names.test.js': 2.3,
  'tests/tools/param.test.js': 2.2,
  'tests/sim/takeover.test.js': 2.1,
  'tests/sim/noc.test.js': 2,
  'tests/tools/stage-engine.test.js': 2,
  'tests/sim/epilogue-story.test.js': 1.9,
  'tests/tools/events-build.test.js': 1.7,
  'tests/tools/pr-snapshot.test.js': 1.7,
  'tests/sim/chunkc.test.js': 1.6,
  'tests/sim/printer-window.test.js': 1.6,
  'tests/sim/actions.test.js': 1.5,
  'tests/sim/id-independence.test.js': 1.4,
  'tests/tools/studio-ids.test.js': 1.4,
  'tests/sim/reviews.test.js': 1.3,
  'tests/tools/pace-browser.test.js': 1.3,
  'tests/tools/studio-page-host.test.js': 1.3,
  'tests/sim/advisors.test.js': 1.2,
  'tests/sim/chat-fixes.test.js': 1.2,
  'tests/sim/cancel.test.js': 1.1,
  'tests/tools/pose-scene-engine.test.js': 1.1,
  'tests/tools/wait-for.test.js': 1.1,
  'tests/tools/play.test.js': 1,
};
// END DURATIONS

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(SELF, '../../..');

// Listed files first (longest first), then the rest in the order vitest's own sequencer gives them.
// vitest is imported only when a run sorts, so loading vite.config.js for the dev server stays cheap.
export class LongestFirst {
  constructor(ctx) { this.ctx = ctx; }
  async base() {
    const { BaseSequencer } = await import('vitest/node');
    return new BaseSequencer(this.ctx);
  }
  async shard(files) { return (await this.base()).shard(files); }
  async sort(files) {
    const rest = await (await this.base()).sort(files);
    const known = (f) => DURATIONS[relative(this.ctx.config.root, f.moduleId)];
    const listed = rest.filter(known).sort((a, b) => known(b) - known(a));
    return [...listed, ...rest.filter((f) => !known(f))];
  }
}

// The list as source, longest first.
export function listSource(durations) {
  const rows = Object.entries(durations).filter(([, s]) => s >= MIN_S).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return `export const DURATIONS = {\n${rows.map(([f, s]) => `  '${f}': ${s},`).join('\n')}\n};\n`;
}

// Per-file seconds from a vitest JSON report, keyed by path from the repo root.
export function fromReport(report, root = ROOT) {
  const out = {};
  for (const t of report.testResults ?? []) {
    if (!Number.isFinite(t.startTime) || !Number.isFinite(t.endTime)) continue;
    out[relative(root, t.name)] = Math.round((t.endTime - t.startTime) / 100) / 10;
  }
  return out;
}

if (process.argv[1] === SELF) {
  const argv = process.argv.slice(2);
  if (argv[0] !== '--update') {
    console.error('usage: node scripts/tools/test-order.mjs --update [--from <vitest JSON report> | -- <vitest run arguments>]');
    process.exit(2);
  }
  const fromIdx = argv.indexOf('--from');
  let report;
  if (fromIdx >= 0) {
    const file = argv[fromIdx + 1];
    if (!file) { console.error('test-order: --from wants a vitest JSON report'); process.exit(2); }
    try { report = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`test-order: can't read ${file}: ${e.message}`); process.exit(2); }
  } else {
    const dash = argv.indexOf('--');
    const extra = dash >= 0 ? argv.slice(dash + 1) : ['--exclude', 'tests/sim/balance.test.js', '--exclude', 'tests/**/*.full.test.js'];
    const { makeTemp } = await import('./tmp.mjs');
    const dir = makeTemp('test-order-');
    const out = join(dir, 'report.json');
    try {
      // HITL_NO_TEST_CACHE: a cached pass would print an old result and write no report.
      // Its own process group, so an interrupt reaches vitest's workers too.
      const child = spawn('npx', ['vitest', 'run', ...extra, '--reporter=json', `--outputFile=${out}`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], detached: true, env: { ...process.env, HITL_NO_TEST_CACHE: '1' } });
      let stopped = null;
      for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { stopped = code; try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } });
      const r = await new Promise((done) => child.on('close', (status, signal) => done({ status, signal })));
      if (stopped) { rmSync(dir, { recursive: true, force: true }); process.exit(stopped); }
      try { report = JSON.parse(readFileSync(out, 'utf8')); } catch { console.error(`test-order: the vitest run (exit ${r.status}) wrote no report`); process.exit(1); }
      if (r.status !== 0) { console.error(`test-order: the vitest run failed (exit ${r.status}); the list is left as it was`); process.exit(1); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const measured = fromReport(report);
  if (!Object.keys(measured).length) { console.error('test-order: the report has no file timings'); process.exit(1); }
  const merged = Object.fromEntries(Object.entries({ ...DURATIONS, ...measured }).filter(([f]) => existsSync(join(ROOT, f))));
  const src = readFileSync(SELF, 'utf8');
  const next = src.replace(/(\/\/ BEGIN DURATIONS\n)[\s\S]*?(\/\/ END DURATIONS)/, (_, a, b) => a + listSource(merged) + b);
  writeFileSync(SELF, next);
  const listed = Object.values(merged).filter((s) => s >= MIN_S).length;
  console.log(`test-order: ${Object.keys(measured).length} files measured, ${listed} listed (${MIN_S} s or more)`);
}
