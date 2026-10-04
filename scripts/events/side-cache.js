// Stored bot runs, keyed by the content of the sim they were played on (see sideKey in pair-report.js).
// pair.js stores its side a here; any tool that needs a base's runs for the same sim, bots, seeds, era and
// fields reads them instead of playing them again.
//
//   cacheDir()          ~/.cache/hitl-ci/pair, or HITL_PAIR_CACHE_DIR
//   readSide(key)       the stored records, or null (none, damaged, or HITL_NO_CHECK_CACHE=1)
//   writeSide(key, r)   stores records atomically and removes entries older than 14 days; nothing with
//                       HITL_NO_CHECK_CACHE=1. A failure prints `<tool>: cache: skipped (...)` and is not fatal.
//   simFiles(repo, rev) [path, blob id] for each sim and data file of a revision, or of the checkout as it
//                       stands on disk without rev; null when git cannot say (no caching). Part of the key.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const off = () => process.env.HITL_NO_CHECK_CACHE === '1';

// What a side's runs depend on: the sim and its data (nothing in src/sim imports from elsewhere).
const SIM_FILE = /^src\/(sim|data)\/.*\.(js|mjs|json)$/;
const git = (cwd, args, input) => execFileSync('git', args, { cwd, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
export function simFiles(repo, rev, tool = 'pair') {
  try {
    if (rev) {
      return git(repo, ['ls-tree', '-r', rev, '--', 'src/sim', 'src/data']).split('\n').filter(Boolean)
        .map((l) => { const [meta, path] = l.split('\t'); return [path, meta.split(' ')[2]]; }).filter(([p]) => SIM_FILE.test(p) && !p.endsWith('.test.js'));
    }
    const paths = git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src/sim', 'src/data']).split('\n')
      .filter((p) => p && SIM_FILE.test(p) && !p.endsWith('.test.js') && existsSync(join(repo, p)));
    const ids = git(repo, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`).split('\n').filter(Boolean);
    return paths.map((p, i) => [p, ids[i]]);
  } catch (e) { console.error(`${tool}: cache: skipped (git cannot list the sim files: ${String(e.message).split('\n')[0]})`); return null; }
}

export const cacheDir = () => process.env.HITL_PAIR_CACHE_DIR || join(homedir(), '.cache', 'hitl-ci', 'pair');

export function readSide(key) {
  if (off()) return null;
  try { return JSON.parse(readFileSync(join(cacheDir(), `${key}.json`), 'utf8')); } catch { return null; }
}

export function writeSide(key, records, tool = 'pair') {
  if (off()) return;
  try {
    mkdirSync(cacheDir(), { recursive: true });
    const tmpFile = join(cacheDir(), `${key}.${process.pid}.tmp`);
    writeFileSync(tmpFile, JSON.stringify(records));
    renameSync(tmpFile, join(cacheDir(), `${key}.json`));
    // Entries for bases that no longer exist are never matched again.
    for (const n of readdirSync(cacheDir())) {
      const f = join(cacheDir(), n);
      if (Date.now() - statSync(f).mtimeMs > 14 * 864e5) rmSync(f, { force: true });
    }
  } catch (e) { console.error(`${tool}: cache: skipped (could not write side a: ${e.message})`); }
}
