// The test files that reach any of the given files, including through a script a test runs by its
// path rather than importing it (`resolve('scripts/wait-for.sh')`, a spawned .mjs), which `vitest
// related` cannot see. The walk is full-select's (imports, plus string literals naming a repo .js,
// .mjs, .json or .sh file, recursively through the JS files reached); a shell script's own contents
// are not followed.
//
//   node scripts/tools/spawned-tests.mjs <path>...
//
// Prints the test files, one per line, sorted (nothing when none reaches them). Exit 0, 2 with no path.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, reach } from './full-select.mjs';

export function testFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', 'tests/**/*.test.js', 'src/**/*.test.js'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

export function testsReaching(changed, { root = ROOT, tests = testFiles(root) } = {}) {
  const want = new Set(changed);
  return tests.filter((t) => {
    const r = reach(t, root);
    return [...want].some((f) => r.files.has(f) || [...r.dirs].some((d) => f.startsWith(`${d}/`)));
  }).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node scripts/tools/spawned-tests.mjs <path>...'); process.exit(2); }
  for (const t of testsReaching(files)) console.log(t);
}
