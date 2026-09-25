// The seeded event index (build.js writes it, find.js queries it): where it lives, the key that says
// whether it matches the code, and reading it back.
//
// The index is keyed by a hash of everything that decides what a seeded game does or what the index
// holds: src/sim (with balance.js and the bots), src/data, src/save (the snapshot format) and build.js. Rendering
// never touches sim state, so render changes keep the index valid. A query against code whose hash
// has no index refuses (or rebuilds with --build) rather than answer from old sim code.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = process.env.HITL_EVENTS_DIR ?? join(process.env.CI_WORKTREE_ROOT ?? join(homedir(), '.cache/hitl-ci'), 'events');
const INPUTS = ['src/sim', 'src/data', 'src/save', 'scripts/events/build.js'];

function files(dir) {
  if (statSync(dir).isFile()) return [dir];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(js|mjs|json)$/.test(name)) out.push(p);
  }
  return out;
}

// A short hash of the sim's inputs in this checkout.
export function simHash(root = ROOT) {
  const h = createHash('sha256');
  for (const f of INPUTS.flatMap((d) => files(join(root, d))).sort()) {
    h.update(relative(root, f));
    h.update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 16);
}

export const indexDir = (hash) => join(CACHE, hash);

// Every indexed row for this hash, or null when there is no index for it.
export function readIndex(hash) {
  const f = join(indexDir(hash), 'events.jsonl.gz');
  if (!existsSync(f)) return null;
  const meta = JSON.parse(readFileSync(join(indexDir(hash), 'meta.json'), 'utf8'));
  const rows = gunzipSync(readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { meta, rows };
}

// Rows matching a query: { id (an event id or type, exact), choice, bot, seed, era, stage (0, 1, 2
// or garage, floor, hq), week range [from, to], snapshot (only rows with one), prop }.
const STAGES = { garage: 0, floor: 1, hq: 2 };
export function match(rows, q) {
  const stage = q.stage == null ? null : STAGES[q.stage] ?? Number(q.stage);
  return rows.filter((r) => (q.id == null || r.id === q.id || r.type === q.id)
    && (q.choice == null || r.choice === Number(q.choice))
    && (q.bot == null || r.bot === q.bot)
    && (q.seed == null || r.seed === Number(q.seed))
    && (q.era == null || r.era === q.era)
    && (stage == null || r.stage === stage)
    && (q.from == null || r.week >= Number(q.from))
    && (q.to == null || r.week <= Number(q.to))
    && (!q.snapshot || r.snapshot)
    && (q.prop == null || (r.props ?? []).includes(q.prop) || r.stageProp === q.prop));
}

// A snapshot's saved state (the game's save format), from its path in the index.
export function readSnapshot(hash, name) {
  const p = name.startsWith('/') ? name : join(indexDir(hash), 'snapshots', name);
  return gunzipSync(readFileSync(p)).toString('utf8');
}

// Parses "printer_jam --choice 0 --stage floor"-style words into a query (used by find.js and by
// the --event flag of the tools that stage a moment).
export function parseQuery(words) {
  const q = {};
  const list = Array.isArray(words) ? words : String(words).split(/\s+/).filter(Boolean);
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (w.startsWith('--')) {
      const k = w.slice(2);
      const v = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true;
      if (k === 'weeks') { const [a, b] = String(v).split('-'); q.from = a; q.to = b ?? a; } else q[k] = v;
    } else q.id = w;
  }
  return q;
}
