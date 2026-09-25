// The team's shared timing log: one JSON line per tool run, CI step, lock wait or cache lookup,
// appended to $HITL_TIMINGS (default ~/.cache/hitl-ci/timings.jsonl, or under CI_WORKTREE_ROOT).
// scripts/perf/loop-report.js summarizes it. Logging never fails or slows a run: every error is
// swallowed, and HITL_TIMINGS=off turns it off.
//
// logTiming({ tool, step, wall_s, ... })  one line, with the run's context filled in
// trackRun(tool, extra)                    logs this process's wall and CPU time and exit code when it exits
import { appendFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

export function timingsFile(env = process.env) {
  if (env.HITL_TIMINGS) return env.HITL_TIMINGS === 'off' ? null : env.HITL_TIMINGS;
  return join(env.CI_WORKTREE_ROOT || join(homedir(), '.cache', 'hitl-ci'), 'timings.jsonl');
}

let ctx = null;
// Where the run happens: the worktree's name, branch and commit, and the PR when ci-pr set it.
function context() {
  if (ctx) return ctx;
  ctx = { worktree: basename(process.cwd()), pid: process.pid };
  try {
    const git = (...a) => execFileSync('git', a, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim();
    ctx.worktree = basename(git('rev-parse', '--show-toplevel'));
    ctx.branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    ctx.sha = git('rev-parse', '--short', 'HEAD');
  } catch { /* not a checkout */ }
  if (process.env.HITL_PR) ctx.pr = Number(process.env.HITL_PR) || process.env.HITL_PR;
  return ctx;
}

export function logTiming(record) {
  try {
    const file = timingsFile();
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...context(), ...record })}\n`);
  } catch { /* the log must never fail a run */ }
}

let tracked = false;
// Logs one line for this process when it exits: wall and CPU seconds (this process only; a
// browser's own processes are not counted) and the exit code. extra is merged in at exit, so a
// tool can fill in fields (gl, cache) as it learns them.
export function trackRun(tool, extra = {}) {
  if (tracked) return extra;
  tracked = true;
  process.once('exit', (code) => {
    const cpu = process.cpuUsage();
    logTiming({ kind: 'run', tool, ...extra, wall_s: +process.uptime().toFixed(2), cpu_s: +((cpu.user + cpu.system) / 1e6).toFixed(2), exit: code });
  });
  return extra;
}
