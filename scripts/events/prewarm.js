// Keeps the event index and the queries people reuse warm for the current sim code, so a lane's
// find.js call answers from cache instead of building or scanning while it waits.
//
//   node scripts/events/prewarm.js [--list] [--force] [--quiet]
//
// Builds the index when this checkout's sim hash has none (niced), then runs each line of
// scripts/events/prewarm.txt (a find.js argument line: blank lines and # comments skipped) niced,
// which fills the per-sim-hash query cache. A stamp beside the index records the queries answered
// for that hash, so a run with nothing changed reads the hash and returns without starting find.
// --force ignores the stamp, --list prints the queries and exits.
//
// Exit codes: 0 warm (index built or present, every query answered, including "no match");
// 1 the index is warm but a query could not be answered (named on stderr); 2 the index could not
// be built. Another prewarm already running for the same sim code makes this one exit 0 at once.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, CACHE, simHash, indexDir } from './lib.js';

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const say = (m) => { if (!QUIET) console.error(`prewarm: ${m}`); };
const listFile = join(dirname(fileURLToPath(import.meta.url)), 'prewarm.txt');

// A find argument line to argv: whitespace splits, '...' and "..." group (no escapes).
export function splitArgs(line) {
  const out = []; let cur = ''; let q = null; let has = false;
  for (const ch of line) {
    if (q) { if (ch === q) q = null; else cur += ch; } else if (ch === '"' || ch === "'") { q = ch; has = true; } else if (/\s/.test(ch)) { if (has || cur) out.push(cur); cur = ''; has = false; } else cur += ch;
  }
  if (q) throw new Error(`unclosed ${q} in: ${line}`);
  if (has || cur) out.push(cur);
  return out;
}

export function readQueries(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

const alive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

async function main() {
  const text = existsSync(listFile) ? readFileSync(listFile, 'utf8') : '';
  const queries = readQueries(text);
  if (argv.includes('--list')) { for (const q of queries) console.log(q); return 0; }
  const hash = simHash();
  const dir = indexDir(hash);
  const listHash = createHash('sha256').update(queries.join('\n')).digest('hex').slice(0, 16);
  const stampFile = join(dir, 'prewarm.json');
  if (!argv.includes('--force') && existsSync(join(dir, 'events.jsonl.gz')) && existsSync(stampFile)) {
    try { if (JSON.parse(readFileSync(stampFile, 'utf8')).list === listHash) { say(`warm for ${hash} (${queries.length} queries)`); return 0; } } catch { /* rewarm */ }
  }
  mkdirSync(CACHE, { recursive: true });
  const lock = join(CACHE, `prewarm-${hash}.lock`);
  // 'wx' makes taking the lock atomic; a lock whose pid is missing or dead is stale and replaced once.
  const take = () => { try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; } };
  if (!take()) {
    let pid = 0; try { pid = Number(readFileSync(lock, 'utf8')); } catch { /* released meanwhile */ }
    if (alive(pid)) { say(`another prewarm is running for ${hash}`); return 0; }
    rmSync(lock, { force: true });
    if (!take()) { say(`another prewarm is running for ${hash}`); return 0; }
  }
  try {
    const t0 = Date.now();
    if (!existsSync(join(dir, 'events.jsonl.gz'))) {
      say(`building the index for ${hash}`);
      const r = spawnSync('nice', ['-n', '10', process.execPath, join(ROOT, 'scripts/events/build.js')], { stdio: ['ignore', 2, 2] });
      if (r.status !== 0) { console.error(`prewarm: building the event index failed (exit ${r.status})`); return 2; }
      say(`index built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
    let failed = 0;
    for (const line of queries) {
      let args;
      try { args = splitArgs(line); } catch (e) { console.error(`prewarm: ${e.message}`); failed++; continue; }
      const t = Date.now();
      const r = spawnSync('nice', ['-n', '10', process.execPath, join(ROOT, 'scripts/events/find.js'), ...args, '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
      if (r.status === 0 || r.status === 1) say(`${r.status === 0 ? 'answered' : 'no match'} in ${((Date.now() - t) / 1000).toFixed(1)} s: ${line.slice(0, 100)}`);
      else { failed++; console.error(`prewarm: could not answer (exit ${r.status}): ${line.slice(0, 100)}\n${(r.stdout || r.stderr || '').slice(0, 300)}`); }
    }
    if (!failed) writeFileSync(stampFile, JSON.stringify({ list: listHash, at: new Date().toISOString(), queries: queries.length }));
    say(`${failed ? `${failed} of ${queries.length} queries failed` : `${queries.length} queries warm`} for ${hash} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return failed ? 1 : 0;
  } finally { rmSync(lock, { force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
