// The test files a change reaches, most relevant first, cut to a cap: smoke's capped related run.
//
//   node scripts/tools/rank-related.mjs --cap <n> --changed <path>... < test-files
//
// Reads candidate test files (one per line, repo-relative) on stdin and prints at most n of them.
// Relevance is the import distance from the test to the nearest changed file (full-select's graph:
// static imports and the repo files string literals name): a changed test file is 0, a test that imports
// a changed file is 1, and so on. Ties go to the shorter test (test-order.mjs durations, unknown as 1 s),
// then the path. A candidate the graph doesn't connect to the change ranks last.
// Exit 0, 2 on bad arguments.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, direct } from './full-select.mjs';
import { DURATIONS } from './test-order.mjs';

// Import distance from test to the nearest file in changed, or Infinity (breadth first, so shortest).
export function distance(test, changed, root = ROOT) {
  const seen = new Set([test]);
  let level = [test];
  for (let d = 0; level.length; d++) {
    if (level.some((f) => changed.has(f))) return d;
    const next = [];
    for (const f of level) {
      if (!/\.(m?js|ts)$/.test(f) || /(^|\/)node_modules\//.test(f)) continue;
      for (const abs of direct(join(root, f), root).names) {
        const rel = relative(root, abs);
        if (!rel.startsWith('..') && !seen.has(rel)) { seen.add(rel); next.push(rel); }
      }
    }
    level = next;
  }
  return Infinity;
}

export function rank(tests, changed, { root = ROOT, durations = DURATIONS } = {}) {
  const set = new Set(changed);
  return tests.map((t) => ({ t, d: distance(t, set, root), s: durations[t] ?? 1 }))
    .sort((a, b) => a.d - b.d || a.s - b.s || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
    .map((x) => x.t);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--cap'), j = argv.indexOf('--changed');
  const cap = Number(argv[i + 1]);
  if (i < 0 || !Number.isInteger(cap) || cap < 1 || j < 0 || j < i) {
    console.error('usage: rank-related.mjs --cap <n> --changed <path>... < test-files');
    process.exit(2);
  }
  const changed = argv.slice(j + 1);
  const tests = readFileSync(0, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  for (const t of rank(tests, changed).slice(0, cap)) console.log(t);
}
