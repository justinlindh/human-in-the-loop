// Which whole-game test files (tests/**/*.full.test.js) a change can reach, so a PR run plays only those.
//
//   node scripts/tools/full-select.mjs [--base <ref>] [--files <path>...] [--why]
//
// Prints the selected test files, one per line (nothing when none is reached). Changed = committed
// since the merge base with --base (default origin/main), plus modified and untracked files, or the
// --files given. --why prints, on stderr, each selected test with the way it reaches a changed file.
//
// A test reaches a file through its static imports and, recursively from every file it reaches,
// through any string literal naming a repo .js, .mjs or .json file (a script it spawns, a worker, a
// literal import.meta.glob; not another test file, which a string names only as a list entry) and the
// directories a wildcard import.meta.glob reads, and the asset directories the files in
// COMPUTED_READS read by run-time path (the studio engine's public fetch, the model loader). A changed
// file selects every test that reaches it;
// vite.config.js, package.json and package-lock.json select every test.
// One no test reaches selects nothing, except a file that is not JavaScript under the paths the
// whole-game tests read (SCOPE: data a test may read without naming it, the build config, the
// lockfile), which selects every test; the render checks' own reference files (RENDER_ONLY) are the
// exception. Code a test only loads into a browser page is not followed.
// Exit 0, 2 on bad arguments.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCOPE = /^(src\/(sim|data|save)\/|tests\/|scripts\/(events|studio|tools|lib)\/|blender\/checks\/|scripts\/balance\.js$|vite\.config\.js$|package-lock\.json$|package\.json$)/;
const CODE = /\.(m?js|ts)$/;
// Files that read a directory by a path built at run time, which no literal names: the studio
// engine's fetch serves every public asset, and the game's model loader builds each model's URL.
const COMPUTED_READS = { 'scripts/studio/platform.mjs': ['public'], 'src/render/models.js': ['public/models'] };
// Non-JS files in SCOPE that only the render checks read (golden's reference images, the sweep's
// accepted violations): one no test reaches selects nothing rather than every test. Only types checked
// against every whole-game test's reach are listed; any other unreached non-JS file selects every test.
const RENDER_ONLY = /^(blender\/checks\/golden\/[^/]+\.png|blender\/checks\/sweep-baseline\.json)$/;
// The test runner's config and the installed packages: a change selects every test.
const EVERY = /^(vite\.config\.js|package\.json|package-lock\.json)$/;
const LITERAL = /['"`]((?:\.{1,2}\/|\/)?[\w@.\/-]+\.(?:m?js|json))['"`]/g;
const GLOB = /import\.meta\.glob\(\s*['"`]([^'"`]*\*[^'"`]*)['"`]/g;
const IMPORTS = [/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g];

export function fullTests(root = ROOT) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(join(root, d))) {
      const rel = `${d}/${n}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (n.endsWith('.full.test.js')) out.push(rel);
    }
  };
  walk('tests');
  return out.sort();
}

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

// What one file names directly: its imports (static, re-exported, literal dynamic), the repo files its
// string literals name, and the directories its wildcard globs read.
function direct(abs, root) {
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { return { names: [], dirs: [] }; }
  const names = [], dirs = [];
  const add = (cands) => { for (const c of cands) if (isFile(c)) { names.push(c); return; } };
  for (const re of IMPORTS) {
    for (const m of text.matchAll(re)) {
      const s = m[1];
      const base = s.startsWith('.') ? resolve(dirname(abs), s) : /^\/(src|blender|scripts|tests)\//.test(s) ? join(root, s) : null;
      if (base) add([base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')]);
    }
  }
  for (const m of text.matchAll(LITERAL)) {
    const lit = m[1];
    // A test file named in a string is a list entry (the test order, a test runner's arguments),
    // not a script the code runs.
    if (/\.test\.js$/.test(lit)) continue;
    add(lit.startsWith('.') ? [resolve(dirname(abs), lit)] : [join(root, lit), resolve(dirname(abs), lit)]);
  }
  for (const m of text.matchAll(GLOB)) {
    const head = m[1].split('*')[0];
    dirs.push(relative(root, resolve(dirname(abs), head.endsWith('/') ? head : dirname(head))));
  }
  return { names, dirs: dirs.filter((d) => !d.startsWith('..')) };
}

// Every repo file a test can reach (repo-relative), the directories it globs, and for each file the
// file that named it (`from`, for --why).
export function reach(test, root = ROOT) {
  const files = new Set(), dirs = new Set(), from = new Map();
  const pending = [[join(root, test), null]];
  while (pending.length) {
    const [abs, parent] = pending.pop();
    const rel = relative(root, abs);
    if (files.has(rel) || rel.startsWith('..') || /(^|\/)node_modules\//.test(rel)) continue;
    files.add(rel);
    from.set(rel, parent);
    for (const x of COMPUTED_READS[rel] ?? []) if (!dirs.has(x)) { dirs.add(x); from.set(`${x}/`, rel); }
    if (!CODE.test(abs)) continue;
    const d = direct(abs, root);
    for (const n of d.names) pending.push([n, rel]);
    for (const x of d.dirs) { dirs.add(x); from.set(`${x}/`, rel); }
  }
  return { files, dirs, from };
}

// The tests a list of changed files selects, each with the changed file that reached it.
export function select(changed, { root = ROOT, tests = fullTests(root) } = {}) {
  const inScope = changed;
  if (!inScope.length) return { picked: [], why: {} };
  const reached = Object.fromEntries(tests.map((t) => [t, reach(t, root)]));
  // The way from the test to f: f, the file that named it, ... back to the test.
  const chain = (t, f) => {
    const { files, dirs, from } = reached[t];
    let at = files.has(f) ? f : `${[...dirs].find((d) => f.startsWith(`${d}/`))}/`;
    const out = [f];
    if (at !== f) out.push(`${at} (directory)`);
    for (at = from.get(at); at; at = from.get(at)) out.push(at);
    return out.join(' <- ');
  };
  const hits = (t, f) => reached[t].files.has(f) || [...reached[t].dirs].some((d) => f.startsWith(`${d}/`));
  const why = {};
  for (const f of inScope) {
    if (EVERY.test(f)) { for (const t of tests) why[t] ??= `${f} (configures every test)`; continue; }
    const by = tests.filter((t) => hits(t, f));
    if (!by.length && !CODE.test(f) && SCOPE.test(f) && !RENDER_ONLY.test(f)) { for (const t of tests) why[t] ??= `${f} (not JavaScript and named by no test: every test)`; continue; }
    for (const t of by) why[t] ??= chain(t, f);
  }
  return { picked: tests.filter((t) => why[t]), why };
}

function changedFiles(base) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const mb = git('merge-base', base, 'HEAD').trim();
  const list = `${git('diff', '--name-only', '--no-renames', mb)}\n${git('ls-files', '--others', '--exclude-standard')}`;
  return [...new Set(list.split('\n').filter(Boolean))].sort();
}

function main(argv) {
  let base = 'origin/main', files = null, why = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' && argv[i + 1]) base = argv[++i];
    else if (a === '--why') why = true;
    else if (a === '--files') files = argv.slice(i + 1);
    else { console.error(`full-select: unknown argument ${a}\nusage: node scripts/tools/full-select.mjs [--base <ref>] [--files <path>...] [--why]`); return 2; }
    if (files) break;
  }
  let changed;
  try { changed = files ?? changedFiles(base); } catch (e) { console.error(`full-select: cannot read the changes against ${base}: ${String(e.message).split('\n')[0]}`); return 2; }
  const { picked, why: by } = select(changed);
  if (why) for (const t of picked) console.error(`${t}: ${by[t]}`);
  if (picked.length) console.log(picked.join('\n'));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
