import type { Register, EngineInterface } from 'claude-code'
import { branchSwitch, noticeNote, ownersOf, parseNotice, shellWrites, type ShellWrite } from './rules.ts'

// Shared guards for the Human in the Loop lanes (issue #1313). Each guard fails open: an error in one
// passes the call on untouched.

// An absolute directory for a command's `cd` target, from the session's working directory.
async function dirFor($: EngineInterface, dir: string | null): Promise<string> {
  const base = await $.session.cwd()
  if (!dir) return base
  if (dir.startsWith('/')) return dir
  if (dir.startsWith('~')) return dir.replace(/^~/, (await $.env.get('HOME')) ?? '~')
  return `${base}/${dir}`
}

async function git($: EngineInterface, cwd: string, ...args: string[]) {
  return $.process.run(['git', ...args], { cwd, timeoutMs: 10000 })
}

// Tracked files a command would rewrite from the shell, each with its owner lane by lanes.txt.
async function trackedWrites($: EngineInterface, writes: ShellWrite[]) {
  const out: { path: string; how: string; rel: string; owners: string[] }[] = []
  for (const w of writes) {
    const cwd = await dirFor($, w.dir)
    const r = await git($, cwd, 'ls-files', '--full-name', '--error-unmatch', '--', w.path)
    if (r.exitCode !== 0) continue
    const rel = r.stdout.trim().split('\n')[0]
    const top = (await git($, cwd, 'rev-parse', '--show-toplevel')).stdout.trim()
    let lanes = ''
    try { lanes = await $.fs.read(`${top}/scripts/hooks/claude/lanes.txt`) } catch { /* no lanes file: no owner named */ }
    out.push({ ...w, rel, owners: ownersOf(rel, lanes) })
  }
  return out
}

// What keeps watching a worktree: a wait-for.sh whose working directory is in it, or a job.sh job of
// its own still running.
async function watchersOf($: EngineInterface, cwd: string): Promise<string[]> {
  const top = (await git($, cwd, 'rev-parse', '--show-toplevel')).stdout.trim()
  const gitDir = (await git($, cwd, 'rev-parse', '--absolute-git-dir')).stdout.trim()
  if (!top) return []
  const found: string[] = []
  const ps = await $.process.run(['ps', '-eo', 'pid=,args='], { timeoutMs: 10000 })
  for (const line of ps.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (!m || !/\bwait-for\.sh\b/.test(m[2]) || /^(grep|ps)\b/.test(m[2])) continue
    try {
      const at = (await $.fs.stat(`/proc/${m[1]}/cwd`, { resolve: true })).realPath
      if (at === top || at?.startsWith(`${top}/`)) found.push(`${m[2].replace(/^.*?(scripts\/wait-for\.sh)/, '$1').slice(0, 80)} (pid ${m[1]})`)
    } catch { /* gone, or not ours to read */ }
  }
  if (gitDir) {
    let jobs: { name: string }[] = []
    try { jobs = await $.fs.list(`${gitDir}/hitl-jobs`) } catch { /* no jobs */ }
    for (const j of jobs) {
      const dir = `${gitDir}/hitl-jobs/${j.name}`
      try {
        try { await $.fs.stat(`${dir}/exit`); continue } catch { /* no exit file: maybe running */ }
        const pid = (await $.fs.read(`${dir}/pid`)).trim()
        if (/^\d+$/.test(pid) && (await $.process.run(['kill', '-0', pid], { timeoutMs: 5000 })).exitCode === 0) found.push(`job.sh job ${j.name} (pid ${pid})`)
      } catch { /* half-written job dir */ }
    }
  }
  return found
}

export const register: Register = on => {
  // Rewrites of tracked files from the shell: lane-guard only sees Edit and Write, so answer up front
  // with the tool to use and the lane that owns the file.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    try {
      const writes = shellWrites(e.command)
      if (writes.length) {
        const tracked = await trackedWrites($, writes)
        if (tracked.length) {
          const lines = tracked.map((t) => `${t.rel} (written by ${t.how}): ${t.owners.length ? `its owner lane is ${t.owners.join(' and ')}` : 'no lane lists it'}`)
          return { deny: `hitl-guards: change tracked files with the Edit or Write tool, which lane-guard checks, not from the shell.\n${lines.join('\n')}\nRead the file, then Edit it. For a file outside your lane, ask its owner first. Scratch output goes outside the repo.` }
        }
      }
    } catch { /* fail open */ }
    return next(e)
  })

  // A branch switch under a watcher: wait-for.sh merges main into whatever branch the worktree has
  // checked out, and a job.sh job reads the files the switch replaces.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    try {
      const sw = branchSwitch(e.command)
      if (sw) {
        const cwd = await dirFor($, sw.dir)
        const isRef = !sw.maybeRef || (await git($, cwd, 'rev-parse', '--verify', '--quiet', `${sw.maybeRef}^{commit}`)).exitCode === 0
        const watching = isRef ? await watchersOf($, cwd) : []
        if (watching.length) return { deny: `hitl-guards: this worktree has work armed on its current branch:\n${watching.join('\n')}\nSwitching branches under it hands it the wrong files. Work on the other branch in its own worktree (git worktree add <dir> <branch>), or wait for it to end (job.sh stop <name> ends a job).` }
      }
    } catch { /* fail open */ }
    return next(e)
  })

  // A background command's notification carries only its status; add its exit code and last lines,
  // and flag a check that exited 0 without printing a result row.
  on('session.append', async ($, e, next) => {
    try {
      if (e.origin.kind !== 'task-notification') return next(e)
      const blocks = typeof e.message.content === 'string' ? [{ type: 'text' as const, text: e.message.content }] : e.message.content ?? []
      const text = blocks.map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text ?? '' : '')).join('\n')
      const n = parseNotice(text)
      if (!n || !n.command) return next(e)
      const tail = (await $.process.run(['tail', '-n', '12', n.outputFile], { timeoutMs: 5000 })).stdout
      return next({ ...e, message: { ...e.message, content: [...blocks, { type: 'text' as const, text: noticeNote(n, tail) }] } })
    } catch {
      return next(e)
    }
  })
}
