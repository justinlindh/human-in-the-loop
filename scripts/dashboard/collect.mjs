// What the owner dashboard shows, gathered from this machine and GitHub without calling any model:
// open PRs and their checks (one gh call), local CI (auto-CI's job records, the run slots, load, the
// quiet window, the main guard), each agent's latest tool call (session log tails), token use per
// teammate (scripts/usage-lib.mjs) and the worktrees. collect({ slow }) returns one plain object;
// the slow parts (usage, dirty worktrees) are reused from the last slow pass when `slow` is false.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, loadavg, cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { logFiles, sessionName, usageSince } from '../usage-lib.mjs';
import { lastActivity, scrub } from './lib.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const CI = process.env.HITL_LOCK_DIR ?? join(homedir(), '.cache/hitl-ci');
const PROJECTS = process.env.CLAUDE_PROJECTS ?? join(homedir(), '.claude/projects');
const run = (cmd, args, opts = {}) => {
  // A command that exits non-zero (systemctl is-active on a stopped unit) still says something.
  try { return execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'], ...opts }); } catch (e) { return typeof e.stdout === 'string' ? e.stdout : ''; }
};
const read = (p) => { try { return readFileSync(p, 'utf8').trim(); } catch { return ''; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function worktrees() {
  return run('git', ['worktree', 'list', '--porcelain']).split('\n\n').filter(Boolean).map((b) => ({
    path: /^worktree (.*)$/m.exec(b)?.[1],
    branch: /^branch refs\/heads\/(.*)$/m.exec(b)?.[1] ?? null,
  })).filter((w) => w.path);
}
// Claude Code names a project folder after its path with every non-alphanumeric character as '-'.
const folder = (p) => p.replace(/[^A-Za-z0-9]/g, '-');

function prs() {
  const out = run('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,author,isDraft,statusCheckRollup,updatedAt,url']);
  let list = [];
  try { list = JSON.parse(out || '[]'); } catch { return null; }
  return list.map((p) => ({
    number: p.number, title: p.title, branch: p.headRefName, author: p.author?.login, draft: p.isDraft, updated: p.updatedAt, url: p.url,
    checks: Object.fromEntries((p.statusCheckRollup ?? []).map((c) => [c.context ?? c.name, (c.state ?? c.conclusion ?? c.status ?? '').toLowerCase()])),
  }));
}

function mainStatus() {
  const out = run('gh', ['api', 'repos/{owner}/{repo}/commits/main/status', '--jq', '{sha: .sha[0:7], state, guard: ([.statuses[] | select(.context == "main-guard")][0] | {state, description})}']);
  try { return JSON.parse(out); } catch { return null; }
}

function localCi() {
  const jobsDir = join(CI, 'auto/jobs');
  const jobs = existsSync(jobsDir) ? readdirSync(jobsDir).map((pr) => {
    const [pgid, head] = read(join(jobsDir, pr)).split(/\s+/);
    return { pr: Number(pr), head: head?.slice(0, 7), since: statSync(join(jobsDir, pr)).mtimeMs, running: alive(-Number(pgid)) };
  }).filter((j) => j.running) : [];
  // The last finished step of each running PR, from the timing log's tail.
  const steps = new Map();
  for (const l of read(join(CI, 'timings.jsonl')).split('\n').slice(-600)) {
    try { const r = JSON.parse(l); if (r.kind === 'step' && r.pr) steps.set(r.pr, { step: r.step, exit: r.exit }); } catch { /* skip */ }
  }
  for (const j of jobs) j.lastStep = steps.get(j.pr) ?? null;
  const slots = Number(run('bash', ['-c', 'source scripts/lib/ci-capacity.sh && ci_runs_going']).trim() || 0);
  const quietPid = Number(read(join(CI, 'quiet.request')).split(/\s+/)[0]);
  const red = read(join(CI, 'main-guard/red'));
  return {
    jobs, slots, slotMax: Number(process.env.HITL_CI_SLOTS ?? 3), load1: Number(loadavg()[0].toFixed(1)), cores: cpus().length,
    quiet: quietPid && alive(quietPid) ? { pid: quietPid } : null,
    renderHold: red ? red.split(' ').slice(1).join(' ') : null,
    guard: { active: run('systemctl', ['--user', 'is-active', 'hitl-main-guard.service']).trim(), last: read(join(CI, 'main-guard/last')).slice(0, 7) },
    recent: read(join(CI, 'auto/log')).split('\n').slice(-8),
  };
}

let slowCache = { usage: [], dirty: [] };
export async function collect({ slow = false } = {}) {
  const wts = worktrees();
  const folders = new Set(wts.map((w) => folder(w.path)));
  const wanted = (d) => folders.has(d);
  let files = [];
  try { files = logFiles(PROJECTS, wanted); } catch { /* no logs */ }
  const names = new Map();
  for (const f of files) if (f.parent && !names.has(f.parent) && f.mtime > Date.now() - 6 * 3600e3) names.set(f.parent, await sessionName(f.parent));
  const agents = lastActivity(files, (p) => names.get(p) ?? 'lead', { since: Date.now() - 24 * 3600e3 });
  if (slow) {
    let usage = [];
    try { usage = await usageSince(PROJECTS, wanted, new Date(Date.now() - 5 * 3600e3)); } catch { /* keep empty */ }
    const dirty = wts.filter((w) => run('git', ['-C', w.path, 'status', '--porcelain', '-uno']).trim()).map((w) => w.branch ?? w.path.split('/').pop());
    slowCache = { usage, dirty };
  }
  return {
    at: Date.now(),
    main: mainStatus(),
    prs: prs(),
    ci: localCi(),
    agents: agents.map((a) => ({ ...a, what: scrub(a.what) })),
    usage: slowCache.usage,
    worktrees: { count: wts.length, dirty: slowCache.dirty },
  };
}
