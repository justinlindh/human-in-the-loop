#!/usr/bin/env node
// One watcher for every open pull request, in place of each lane's own wait-for.sh and review-queue
// --wait. It reads the shared PR snapshot (pr-snapshot.mjs) and writes a message into a lane's team
// inbox only when that lane must act, in the format SendMessage writes, so an idle lane wakes on it:
//
//   failed     a required check failed on the head          -> the author lane
//   changes    a changes-requested verdict on the head      -> the author lane
//   conflict   the PR conflicts with main                   -> the author lane
//   merged     the PR merged (once)                         -> the author lane
//   closed     the PR closed without merging (once)         -> the author lane
//   ready      required checks green, no verdict on the head -> one reviewer, alternating per PR; a PR
//              keeps its reviewer for later heads, and the other reviewer is never told
//
// Drafts and PRs labelled awaiting-user are left to the lead's own watcher. The author lane comes from
// the branch prefix (integ/ integrator, lead/ team-lead, <lane>/ that lane); a tools/ branch belongs to
// tools2 when a ../gamedev-tools2 worktree has it checked out, else tools. Anything else goes to team-lead.
// Each message is sent once per PR, head and event (state in ~/.cache/hitl-ci/pr-watch-state.json).
// The service never pushes, merges or reruns anything.
//
//   node scripts/tools/pr-watch-service.mjs [--once] [--dry-run] [--interval <s>] [--status-every <min>]
//   --once           one pass, then exit 0
//   --dry-run        print who would be told what on this pass; writes no inbox and no state
//   --interval       seconds between passes (default 60)
//   --status-every   minutes between status lines in the log (default 10), so a dead service shows
// The first pass with no state file records what is already true without sending it.
// Env: HITL_TEAMS_DIR (default ~/.claude/teams), HITL_PR_WATCH_STATE, HITL_PR_WATCH_LOG
// (default ~/.cache/hitl-ci/pr-watch.log), HITL_PR_SNAPSHOT (see pr-snapshot.mjs).
// Exit: 0 after --once; 2 bad options or no team found; 143/130 on SIGTERM/SIGINT.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ensureFresh } from './pr-snapshot.mjs';
import { queue, requiredChecks, heldByVerdict, checkState, trustedLogins } from './review-queue.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REVIEWERS = ['reviewer', 'reviewer2'];
const cache = join(homedir(), '.cache', 'hitl-ci');
const teamsDir = () => process.env.HITL_TEAMS_DIR || join(homedir(), '.claude', 'teams');
const stateFile = () => process.env.HITL_PR_WATCH_STATE || join(cache, 'pr-watch-state.json');
const logFile = () => process.env.HITL_PR_WATCH_LOG || join(cache, 'pr-watch.log');

const log = (line) => {
  const l = `${new Date().toISOString()} ${line}`;
  try { mkdirSync(dirname(logFile()), { recursive: true }); appendFileSync(logFile(), `${l}\n`); } catch { /* stdout still has it */ }
  console.log(l);
};

// The team whose config lists the reviewers and team-lead, newest first: the directory name changes
// when the team is relaunched.
export function findTeam(dir = teamsDir()) {
  let best = null;
  for (const name of (() => { try { return readdirSync(dir); } catch { return []; } })()) {
    let cfg;
    try { cfg = JSON.parse(readFileSync(join(dir, name, 'config.json'), 'utf8')); } catch { continue; }
    const members = (cfg.members ?? []).map((m) => m.name);
    if (!['team-lead', ...REVIEWERS].every((n) => members.includes(n))) continue;
    if (!best || (cfg.createdAt ?? 0) > best.createdAt) best = { dir: join(dir, name), members, createdAt: cfg.createdAt ?? 0 };
  }
  return best;
}

// The worktrees' checked-out branches, as branch -> worktree path.
function worktreeBranches() {
  const r = spawnSync('git', ['-C', REPO, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  const out = new Map();
  let path = null;
  for (const l of (r.stdout ?? '').split('\n')) {
    if (l.startsWith('worktree ')) path = l.slice(9);
    else if (l.startsWith('branch refs/heads/')) out.set(l.slice(18), path);
  }
  return out;
}

export function authorLane(branch, members, worktrees = new Map()) {
  const prefix = branch.split('/')[0];
  if (prefix === 'dependabot') return null;
  if (prefix === 'integ') return 'integrator';
  if (prefix === 'lead') return 'team-lead';
  if (prefix === 'tools') return /(^|\/)gamedev-tools2[^/]*$/.test(worktrees.get(branch) ?? '') ? 'tools2' : 'tools';
  return members.includes(prefix) ? prefix : 'team-lead';
}

// Required checks (less review) failing on the head, once nothing on the head is still running:
// `name=state`, or [] while anything runs or none failed.
export function failingChecks(pr, required) {
  const rollup = pr.statusCheckRollup ?? [];
  if (rollup.some((c) => c.__typename === 'CheckRun' && c.status !== 'COMPLETED')) return [];
  const names = required ?? rollup.map((c) => c.context ?? c.name).filter((n) => n && n !== 'review' && n !== 'local-ci');
  return names.filter((n) => checkState(pr, n) === 'failure').map((n) => {
    const c = rollup.find((x) => (x.context ?? x.name) === n);
    return `${n}=${String(c.state ?? c.conclusion).toLowerCase()}`;
  });
}

// The events true for one open PR now, as [{ event, key, to, text }], given the lane resolver and
// the PR's assigned reviewer (assign() picks one when the PR has none).
export function prEvents(pr, { required, trusted, lane, assign, verdict, held = (n, head) => heldByVerdict(null, n, head) }) {
  if (pr.isDraft || (pr.labels ?? []).some((l) => l.name === 'awaiting-user')) return [];
  const n = pr.number, head = pr.headRefOid, h = head.slice(0, 8), br = pr.headRefName;
  const at = `PR #${n} (${br}) at ${h}`;
  const out = [];
  const tell = (event, to, text) => to && out.push({ event, key: `${n}@${head}:${event}`, to, text });
  const author = lane(br);
  const review = checkState(pr, 'review');
  if (review === 'failure') {
    const v = verdict(n);
    tell('changes', author, `${at}: changes requested${v ? ` by ${v.login}: ${v.url}` : ''}. Address them and push; pr-watch follows the new head.`);
  }
  if (pr.mergeable === 'CONFLICTING') tell('conflict', author, `${at} conflicts with main. Merge origin/main into ${br} in your worktree (merge, never rebase), run npm run test:push, and push.`);
  const failing = failingChecks(pr, required);
  if (failing.length) tell('failed', author, `${at}: required check failed: ${failing.join(', ')}. Read the failing job, fix it and push (merge origin/main in first if main may already fix it); pr-watch follows the new head.`);
  const q = queue([pr], trusted, null, required)[0];
  // The CI group (a required check pending or failing) is not ready; a failure went to the author above.
  if (q && q.group !== 'CI') {
    if (!held(n, head)) {
      const how = { READY: 'Review it and post the verdict with scripts/review-verdict.sh.', DEPENDABOT: 'A Dependabot PR: read its diff and changelogs first with no install; CI comes after the verdict.', OUTSIDE: 'A fork or an outside author: never fetch or run it; report it to team-lead.' }[q.group];
      tell('ready', assign(n), `${at} is ready for review: ${pr.title}. It is assigned to you; the other reviewer is not told. ${how}`);
    }
  }
  return out;
}

// The reviewer's last verdict review, as { kind, sha, login, url }, or null.
function lastVerdict(n) {
  const r = spawnSync('gh', ['api', `repos/{owner}/{repo}/pulls/${n}/reviews?per_page=100`, '--jq',
    '[.[] | select((.body // "") | test("^\\\\*\\\\*Verdict: (pass|changes requested)\\\\*\\\\*"))] | last // empty | "\\(.commit_id) \\(.user.login) \\(.html_url)"'], { encoding: 'utf8', cwd: REPO });
  const [sha, login, url] = r.status === 0 ? r.stdout.trim().split(' ') : [];
  return login ? { sha, login, url } : null;
}

// A PR gone from the open list: { state, merge } from gh, or null when it cannot be read.
function closedState(n) {
  const r = spawnSync('gh', ['pr', 'view', String(n), '--json', 'state,mergeCommit'], { encoding: 'utf8', cwd: REPO });
  if (r.status !== 0) return null;
  try { const j = JSON.parse(r.stdout); return { state: j.state, merge: j.mergeCommit?.oid?.slice(0, 8) ?? null }; } catch { return null; }
}

// Takes <file>.lock the way the team mailbox does (a directory; one older than 10 s is stale).
async function withLock(file, fn) {
  const lock = `${file}.lock`;
  for (let i = 0; ; i++) {
    try { mkdirSync(lock); break; } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 10000) { rmSync(lock, { recursive: true, force: true }); continue; } } catch { continue; }
      if (i > 100) throw new Error(`${basename(file)} stays locked`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

// Appends one entry to a lane's inbox and reads it back; a write a concurrent writer replaced is
// tried once more. Returns the msg_id, or null when it could not be written.
export async function deliver(teamDir, to, text, summary) {
  const file = join(teamDir, 'inboxes', `${to}.json`);
  mkdirSync(dirname(file), { recursive: true });
  const msg = { from: 'pr-watch', text, summary, timestamp: new Date().toISOString(), msgV: 1, msg_id: randomUUID(), type: 'message', read: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await withLock(file, () => {
        let cur = [];
        try { cur = JSON.parse(readFileSync(file, 'utf8')); } catch { /* a new or empty inbox */ }
        if (!Array.isArray(cur)) cur = [];
        if (!cur.some((m) => m.msg_id === msg.msg_id)) cur.push(msg);
        const tmp = `${file}.pr-watch-${process.pid}`;
        writeFileSync(tmp, JSON.stringify(cur, null, 2));
        renameSync(tmp, file);
      });
      // Gone already is fine (drained); present is fine. Only a write nobody read and nobody kept is retried.
      const back = (() => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; } })();
      if (back.some((m) => m.msg_id === msg.msg_id) || back.length === 0) return msg.msg_id;
    } catch (e) { log(`deliver to ${to} failed: ${e.message}`); }
  }
  return null;
}

const queued = (teamDir, to, id) => {
  try { return JSON.parse(readFileSync(join(teamDir, 'inboxes', `${to}.json`), 'utf8')).some((m) => m.msg_id === id && !m.read); } catch { return false; }
};

const loadState = () => { try { return JSON.parse(readFileSync(stateFile(), 'utf8')); } catch { return null; } };
function saveState(s) {
  mkdirSync(dirname(stateFile()), { recursive: true });
  const tmp = `${stateFile()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 1));
  renameSync(tmp, stateFile());
}

// One pass: reads the snapshot, works out each event, and sends the ones not sent before.
export async function pass({ team, dryRun = false, maxAgeMs = 60000, force = false }) {
  const fresh = loadState();
  const state = fresh ?? { sent: {}, open: {}, assigned: {}, next: 0, pending: [] };
  const seeding = !fresh && !dryRun;
  const snap = await ensureFresh({ maxAgeMs, force });
  if (!snap) { log('pass skipped: no PR snapshot and GitHub could not be read'); return state; }
  const prs = snap.prs.filter((p) => (p.baseRefName ?? 'main') === 'main');
  const trusted = trustedLogins(join(REPO, 'scripts', 'ci-trusted'));
  const required = requiredChecks(null);
  const wts = worktreeBranches();
  // A PR's lane is fixed the first time it is seen, so a later branch switch in a worktree can't move it.
  const lane = (br) => {
    const pr = prs.find((p) => p.headRefName === br);
    return state.open[pr?.number]?.lane ?? authorLane(br, team.members, wts);
  };
  const assign = (n) => {
    if (!state.assigned[n]) { state.assigned[n] = REVIEWERS[state.next % REVIEWERS.length]; state.next++; }
    return state.assigned[n];
  };
  const events = [];
  for (const pr of prs) {
    events.push(...prEvents(pr, { required, trusted, lane, assign, verdict: lastVerdict }));
    state.open[pr.number] = { branch: pr.headRefName, lane: lane(pr.headRefName), head: pr.headRefOid };
  }
  // Gone from the open list: merged or closed, told once.
  const openNow = new Set(prs.map((p) => String(p.number)));
  for (const [n, info] of Object.entries(state.open)) {
    if (openNow.has(n) || snap.isStale) continue;
    const c = closedState(n);
    if (!c || c.state === 'OPEN') continue;
    delete state.open[n];
    delete state.assigned[n];
    if (!info.lane) continue;
    if (c.state === 'MERGED') events.push({ event: 'merged', key: `${n}:merged`, to: info.lane, text: `PR #${n} (${info.branch}) merged${c.merge ? ` at ${c.merge}` : ''}. Message the teammates its Affects section names who must act now; nothing else to watch.` });
    else events.push({ event: 'closed', key: `${n}:closed`, to: info.lane, text: `PR #${n} (${info.branch}) was closed without merging.` });
  }
  for (const e of events) {
    if (state.sent[e.key]) continue;
    if (dryRun) { console.log(`would tell ${e.to}: ${e.text}`); continue; }
    if (seeding) { state.sent[e.key] = { at: Date.now(), to: e.to, seeded: true }; continue; }
    const id = await deliver(team.dir, e.to, e.text, `pr-watch: #${e.key.split(/[@:]/)[0]} ${e.event}`);
    state.sent[e.key] = { at: Date.now(), to: e.to, id };
    log(`${e.event} ${e.key} -> ${e.to} ${id ? `sent ${id}` : 'NOT WRITTEN'}`);
    if (id) state.pending.push({ to: e.to, id, key: e.key, at: Date.now() });
  }
  if (seeding) log(`first pass: recorded ${events.length} event(s) already true, sent none`);
  // A message still queued 10 minutes on is logged once as undelivered (its lane isn't running);
  // it stays in the inbox and is never sent again.
  state.pending = state.pending.filter((p) => {
    if (!queued(team.dir, p.to, p.id)) return false;
    if (Date.now() - p.at < 600000) return true;
    log(`undelivered ${p.key} -> ${p.to} (${p.id} still queued after 10 min)`);
    return false;
  });
  if (!dryRun) saveState(state);
  return state;
}

async function main(argv) {
  let v;
  try { v = parseArgs({ args: argv, options: { once: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, interval: { type: 'string' }, 'status-every': { type: 'string' } } }).values; }
  catch (e) { console.error(`pr-watch: ${e.message}\nusage: node scripts/tools/pr-watch-service.mjs [--once] [--dry-run] [--interval <s>] [--status-every <min>]`); return 2; }
  const interval = Number(v.interval ?? 60), statusEvery = Number(v['status-every'] ?? 10);
  if (!(interval >= 15) || !(statusEvery > 0)) { console.error('pr-watch: --interval wants 15 s or more and --status-every a positive number of minutes'); return 2; }
  const team = findTeam();
  if (!team) { console.error(`pr-watch: no team in ${teamsDir()} lists team-lead, reviewer and reviewer2`); return 2; }
  // A one-shot pass reads GitHub, not a snapshot up to an interval old.
  if (v['dry-run'] || v.once) { await pass({ team, dryRun: !!v['dry-run'], maxAgeMs: interval * 1000, force: true }); return 0; }
  log(`started: team ${basename(team.dir)}, every ${interval} s`);
  let lastStatus = 0, passes = 0;
  for (;;) {
    let cur = findTeam() ?? team;
    if (cur.dir !== team.dir) { log(`team is now ${basename(cur.dir)}`); Object.assign(team, cur); }
    try { await pass({ team, maxAgeMs: interval * 1000 }); passes++; } catch (e) { log(`pass failed: ${e.stack ?? e.message}`); }
    if (Date.now() - lastStatus >= statusEvery * 60000) {
      const s = loadState();
      log(`status: alive, ${passes} pass(es), ${Object.keys(s?.open ?? {}).length} open PR(s) watched, ${s?.pending?.length ?? 0} message(s) waiting to be read`);
      lastStatus = Date.now();
    }
    await new Promise((r) => setTimeout(r, interval * 1000));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [s, c] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(s, () => process.exit(c));
  // gh names this repository as {owner}/{repo} from the working directory.
  process.chdir(REPO);
  process.exit(await main(process.argv.slice(2)));
}
