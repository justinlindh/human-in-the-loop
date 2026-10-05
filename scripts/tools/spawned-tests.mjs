// The test files that reach any of the given files, including through a script a test runs by its
// path rather than importing it (`resolve('scripts/wait-for.sh')`, a spawned .mjs), which `vitest
// related` cannot see. The walk is full-select's (imports, plus string literals naming a repo .js,
// .mjs, .json or .sh file, recursively through the JS files reached); a shell script's own contents
// are not followed.
//
//   node scripts/tools/spawned-tests.mjs [--reached] <path>...
//
// Prints the test files, one per line, sorted (nothing when none reaches them). With --reached it
// prints instead the given paths that some test reaches, in the order given. Exit 0, 2 with no path.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, reach } from './full-select.mjs';

export function testFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', ':(glob)tests/**/*.test.js', ':(glob)src/**/*.test.js'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

// One walk over every test: { tests: the tests reaching any path, reached: the paths some test reaches }.
export function spawnedWalk(changed, { root = ROOT, tests = testFiles(root) } = {}) {
  const hit = new Set();
  const found = [];
  for (const t of tests) {
    const r = reach(t, root);
    const mine = changed.filter((f) => r.files.has(f) || [...r.dirs].some((d) => f.startsWith(`${d}/`)));
    if (!mine.length) continue;
    found.push(t);
    for (const f of mine) hit.add(f);
  }
  return { tests: found.sort(), reached: changed.filter((f) => hit.has(f)) };
}

export function testsReaching(changed, opts) {
  return spawnedWalk(changed, opts).tests;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const reachedOnly = args[0] === '--reached';
  const files = reachedOnly ? args.slice(1) : args;
  if (!files.length) { console.error('usage: node scripts/tools/spawned-tests.mjs [--reached] <path>...'); process.exit(2); }
  const w = spawnedWalk(files);
  for (const line of reachedOnly ? w.reached : w.tests) console.log(line);
}
