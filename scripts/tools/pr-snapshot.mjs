// One shared snapshot of the open pull requests, so the tools that watch them read a file instead of
// each asking GitHub every minute.
//
//   node scripts/tools/pr-snapshot.mjs [--max-age <s>] [--pr <n>] [--refresh]
//
// Prints the snapshot as JSON ({ fetchedAt, changedAt, ageSeconds, isStale, prs: [...] }), or with
// --pr one PR's entry (exit 1 when it is not open). A reader that finds the snapshot older than
// --max-age (default 60 s, jittered by 10 %) refreshes it first, under a lock, so any number of
// readers cost one `gh pr list` per interval. When nothing in the snapshot has changed for 20
// minutes the interval stretches to 120 s. --refresh forces a fetch. If GitHub cannot be reached the
// old snapshot is returned with isStale true; with no snapshot at all the exit is 1.
// HITL_PR_SNAPSHOT moves the file (default ~/.cache/hitl-ci/pr-snapshot.json).
//
// Entries carry what the watchers read: number, title, state, isDraft, headRefName, headRefOid,
// baseRefName, mergeStateStatus, mergeable, statusCheckRollup, labels, autoMergeRequest, author,
// isCrossRepository, reviewDecision, updatedAt, url, and `comments` cut down to the newest Local CI
// comment and the newest owner record (what pr-status.sh and the review queue read).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export const FIELDS = 'number,title,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,mergeable,statusCheckRollup,labels,autoMergeRequest,author,isCrossRepository,reviewDecision,updatedAt,url,comments';
const QUIET_MS = 20 * 60 * 1000, QUIET_INTERVAL_MS = 120 * 1000, FLOOR_MS = 15 * 1000;
const LOCK_STALE_MS = 120 * 1000;

export const snapshotFile = () => process.env.HITL_PR_SNAPSHOT || join(homedir(), '.cache', 'hitl-ci', 'pr-snapshot.json');

// How old a snapshot may be before a reader refreshes it: the requested age, jittered by 10 %, and at
// least 120 s once nothing has changed for 20 minutes. Never under FLOOR_MS.
export function interval({ requestedMs = 60000, changedAt, now, rand = Math.random }) {
  const jittered = requestedMs * (0.9 + 0.2 * rand());
  const quiet = changedAt != null && now - changedAt >= QUIET_MS;
  return Math.max(FLOOR_MS, quiet ? Math.max(jittered, QUIET_INTERVAL_MS) : jittered);
}

// What a watcher would react to in one PR: change this and the signature changes.
export function signature(pr) {
  const checks = (pr.statusCheckRollup ?? []).map((c) => `${c.name ?? c.context}=${c.conclusion || c.state || c.status || ''}`).sort().join(',');
  const labels = (pr.labels ?? []).map((l) => l.name).sort().join(',');
  return [pr.state, pr.headRefOid, pr.mergeStateStatus, pr.mergeable, pr.isDraft, pr.reviewDecision, !!pr.autoMergeRequest, labels, checks].join('|');
}

const same = (a, b) => a.length === b.length && a.every((p, i) => p.number === b[i].number && signature(p) === signature(b[i]));

// The comments the watchers read, and nothing else: the newest Local CI comment and the newest
// owner record.
export function trimComments(comments) {
  const last = (re) => [...(comments ?? [])].reverse().find((c) => re.test(c.body ?? ''));
  return [last(/^### Local CI/), last(/<!-- hitl-owner/)].filter(Boolean);
}

export function read(file = snapshotFile()) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function write(file, snap) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(snap));
  renameSync(tmp, file);
}

const ghList = () => {
  const r = spawnSync('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', FIELDS], { encoding: 'utf8', maxBuffer: 1 << 27, timeout: 60000 });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'gh pr list failed').trim().split('\n').pop());
  return JSON.parse(r.stdout);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A lock whose holder is gone: its process no longer exists, or (no pid recorded yet) it is old.
function isAbandoned(dir) {
  try {
    const pid = Number(readFileSync(join(dir, 'pid'), 'utf8'));
    if (pid > 0) { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } }
  } catch { /* no pid file yet */ }
  try { return Date.now() - statSync(dir).mtimeMs > LOCK_STALE_MS; } catch { return false; }
}

// Takes the refresh lock, or waits for whoever holds it (up to waitMs) and reports false.
async function lock(dir, waitMs = 20000) {
  const until = Date.now() + waitMs;
  for (;;) {
    try { mkdirSync(dir); writeFileSync(join(dir, 'pid'), String(process.pid)); return true; } catch { /* held */ }
    if (isAbandoned(dir)) { rmSync(dir, { recursive: true, force: true }); continue; }
    if (Date.now() >= until) return false;
    await sleep(200);
  }
}

// The snapshot, refreshed first when it is older than the interval (or `force`). Never throws: when
// GitHub cannot be read the old snapshot comes back with isStale true and `error` set, or null.
export async function ensureFresh({ file = snapshotFile(), maxAgeMs = 60000, force = false, fetchPrs = ghList, now = () => Date.now(), rand = Math.random } = {}) {
  const fresh = (s) => s && now() - s.fetchedAt < interval({ requestedMs: maxAgeMs, changedAt: s.changedAt, now: now(), rand });
  let snap = read(file);
  if (!force && fresh(snap)) return { ...snap, isStale: false };
  const dir = `${file}.lock`;
  try { mkdirSync(dirname(file), { recursive: true }); } catch { /* the write below says so */ }
  const mine = await lock(dir);
  try {
    // Another reader may have refreshed while this one waited.
    if (!mine || !force) { snap = read(file); if (!force && fresh(snap)) return { ...snap, isStale: false }; }
    if (!mine) return snap ? { ...snap, isStale: true } : null;
    const prs = fetchPrs().map((p) => ({ ...p, comments: trimComments(p.comments) }));
    const t = now();
    const next = { version: 1, fetchedAt: t, changedAt: snap && same(snap.prs, prs) ? snap.changedAt : t, prs };
    write(file, next);
    return { ...next, isStale: false };
  } catch (err) {
    return snap ? { ...snap, isStale: true, error: err.message } : null;
  } finally {
    if (mine) rmSync(dir, { recursive: true, force: true });
  }
}

async function main(argv) {
  let args;
  try { args = parseArgs({ args: argv, options: { 'max-age': { type: 'string' }, pr: { type: 'string' }, refresh: { type: 'boolean' } } }).values; }
  catch (e) { console.error(`pr-snapshot: ${e.message}\nusage: node scripts/tools/pr-snapshot.mjs [--max-age <s>] [--pr <n>] [--refresh]`); return 2; }
  const maxAge = args['max-age'] == null ? 60 : Number(args['max-age']);
  if (!(maxAge > 0)) { console.error('pr-snapshot: --max-age wants a positive number of seconds'); return 2; }
  if (args.pr != null && !/^\d+$/.test(args.pr)) { console.error('pr-snapshot: --pr wants a pull request number'); return 2; }
  const snap = await ensureFresh({ maxAgeMs: maxAge * 1000, force: !!args.refresh });
  if (!snap) { console.error('pr-snapshot: no snapshot and GitHub could not be read'); return 1; }
  const meta = { fetchedAt: snap.fetchedAt, changedAt: snap.changedAt, ageSeconds: Math.round((Date.now() - snap.fetchedAt) / 1000), isStale: snap.isStale, ...(snap.error ? { error: snap.error } : {}) };
  if (args.pr != null) {
    const pr = snap.prs.find((p) => p.number === Number(args.pr));
    if (!pr) { console.error(`pr-snapshot: #${args.pr} is not open`); return 1; }
    console.log(JSON.stringify({ ...meta, signature: signature(pr), pr }));
  } else console.log(JSON.stringify({ ...meta, prs: snap.prs }));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
