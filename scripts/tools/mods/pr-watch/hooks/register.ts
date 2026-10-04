import type { EngineInterface, Register } from 'claude-code'

import type { PrWatch } from '../types'
import { decide, describeLocalCi, failedSteps, jobOfLink, parseLocalCi, parseLook, parseNumber, tail } from './logic'

const WATCHES = { plugin: 'pr-watch', key: 'watches' } as const
const WATCH_TOOL = 'mcp__pr-watch__watch_pr'
const UNWATCH_TOOL = 'mcp__pr-watch__unwatch_pr'
const POLL_MS = 60_000
// One look is wait-for.sh with no waiting. It may merge main into the branch and run the tests first,
// so the cap leaves room for a test run.
const LOOK_SECONDS = 590

let sessionCwd = '.'
let isPolling = false
const line = new Map<number, string>()

type Ran = { code: number; out: string; err: string }

async function run($: EngineInterface, argv: string[], cwd: string, timeoutMs = 60_000): Promise<Ran> {
  try {
    const r = await $.process.run(argv, { cwd, timeoutMs })
    return { code: r.exitCode, out: r.stdout, err: r.stderr }
  } catch (err) {
    return { code: -1, out: '', err: String(err) }
  }
}

const loadWatches = async ($: EngineInterface): Promise<PrWatch[]> => (await $.state.get(WATCHES)).value ?? []
const saveWatches = ($: EngineInterface, watches: PrWatch[]) => $.state.set(WATCHES, watches)

function showStatus($: EngineInterface, watches: readonly PrWatch[]): void {
  const parts = watches.map(w => line.get(w.number) ?? `#${w.number}`)
  $.ui.status(parts.length ? `pr-watch: ${parts.join(' | ')}` : undefined)
}

// The existing waiter, once: it reads GitHub, merges main into the branch when due and leaves.
async function look($: EngineInterface, w: PrWatch) {
  const argv = [
    'timeout', '-k', '5', String(LOOK_SECONDS),
    'bash', 'scripts/wait-for.sh', String(w.number), '--merged', '--timeout', '0', '--poll', '1',
    '--test', 'npm run test:fast', ...(w.update ? [] : ['--no-update']),
  ]
  const r = await run($, argv, w.cwd, (LOOK_SECONDS + 10) * 1000)
  return parseLook(r.code, r.out + r.err, w.number)
}

async function failureDetail($: EngineInterface, w: PrWatch, head: string, failing: string[]): Promise<string> {
  const parts: string[] = []
  const home = (await $.env.get('HOME')) ?? ''
  for (const entry of failing) {
    const name = entry.split('=')[0]
    if (name === 'local-ci') {
      const c = await run($, ['gh', 'pr', 'view', String(w.number), '--json', 'comments', '--jq', '[.comments[] | select(.body | startswith("### Local CI"))] | last | .body // ""'], w.cwd)
      parts.push(describeLocalCi(c.out, w.number, head))
      for (const step of failedSteps(parseLocalCi(c.out).rows).slice(0, 2)) {
        try {
          const log = (await $.fs.read(`${home}/.cache/hitl-ci/failed/pr${w.number}-${head.slice(0, 7)}/${step.step}.log`)) as string
          parts.push(`${step.step} log, last lines:\n${tail(log)}`)
        } catch { /* the step kept no log */ }
      }
      continue
    }
    const checks = await run($, ['gh', 'pr', 'checks', String(w.number), '--json', 'name,link'], w.cwd)
    let job: string | undefined
    try { job = jobOfLink((JSON.parse(checks.out) as { name: string; link: string }[]).find(c => c.name === name)?.link ?? '') } catch { /* no checks table */ }
    if (!job) { parts.push(`${name}: no job link to read a log from`); continue }
    const notes = await run($, ['gh', 'api', `repos/{owner}/{repo}/check-runs/${job}/annotations`, '--jq', '.[] | "\\(.path):\\(.start_line) \\(.message)"'], w.cwd)
    const log = await run($, ['gh', 'run', 'view', '--job', job, '--log-failed'], w.cwd, 120_000)
    if (notes.out.trim()) parts.push(`${name} annotations:\n${tail(notes.out, 12)}`)
    if (log.out.trim()) parts.push(`${name} log, last lines:\n${tail(log.out)}`)
  }
  return parts.join('\n\n')
}

// One pass over every watch. The session wakes once per pass, with everything new.
async function poll($: EngineInterface): Promise<void> {
  if (isPolling) return
  isPolling = true
  try {
    const watches = await loadWatches($)
    if (!watches.length) return
    const next: PrWatch[] = []
    const wake: string[] = []
    for (const w of watches) {
      const l = await look($, w)
      const d = decide(w, l)
      wake.push(...d.messages)
      if (d.enrich) {
        const detail = await failureDetail($, d.watch, d.enrich.head, d.enrich.failing)
        if (detail) wake.push(detail)
      }
      if (l.kind === 'waiting') line.set(w.number, `#${w.number} ${l.allPassed ? 'green, merging' : `waiting ${l.waiting.join(',') || l.running.join(',')}`}, review ${l.review}`)
      else if (l.kind === 'failed') line.set(w.number, `#${w.number} failing ${l.failing.join(',')}`)
      if (!d.done) next.push(d.watch)
      else line.delete(w.number)
    }
    await saveWatches($, next)
    showStatus($, next)
    if (wake.length) await $.prompt.submit({ text: `pr-watch:\n${wake.join('\n')}` })
  } finally {
    isPolling = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    sessionCwd = e.cwd
    await $.tool.register({
      name: 'watch_pr',
      description:
        'Follow a pull request until it merges or closes. Replaces running scripts/wait-for.sh in the background: it keeps going across pushes and wakes this session only on a merge, a failed check (with the failing step and log tail), a review verdict, a conflict, or a close. When the PR falls behind main it merges main into the branch from `cwd`, runs the tests and pushes, as wait-for.sh does.',
      inputSchema: {
        type: 'object',
        properties: {
          number: { type: 'integer', description: 'The pull request number.' },
          cwd: { type: 'string', description: 'The worktree that has the PR branch checked out. Default: the session directory.' },
          update: { type: 'boolean', description: 'Merge main into the branch when the PR is behind. Default true.' },
        },
        required: ['number'],
      },
    })
    await $.tool.register({
      name: 'unwatch_pr',
      description: 'Stop watching a pull request.',
      inputSchema: { type: 'object', properties: { number: { type: 'integer' } }, required: ['number'] },
    })
    // A bug in one pass must not end the timer or the session's turn.
    $.clock.every(POLL_MS, () => poll($).catch(() => undefined))
    showStatus($, await loadWatches($))
    return next(e)
  })

  on('tool.call', { tool: WATCH_TOOL }, async ($, e) => {
    const number = parseNumber(e.number)
    if (number === undefined) return { deny: 'watch_pr: number must be a positive integer.' }
    const cwd = typeof e.cwd === 'string' && e.cwd ? e.cwd : sessionCwd
    const view = await run($, ['gh', 'pr', 'view', String(number), '--json', 'state,headRefName,headRefOid'], cwd)
    if (view.code !== 0) return { deny: `watch_pr: cannot read #${number}: ${(view.err || view.out).trim().split('\n').pop()}` }
    const pr = JSON.parse(view.out) as { state: string; headRefName: string; headRefOid: string }
    if (pr.state !== 'OPEN') return { result: `#${number} is already ${pr.state.toLowerCase()}; nothing to watch.` }
    if ((await run($, ['test', '-f', 'scripts/wait-for.sh'], cwd)).code !== 0) return { deny: `watch_pr: ${cwd} has no scripts/wait-for.sh; merge origin/main into it, or pass the cwd of a current worktree.` }
    const branch = (await run($, ['git', 'branch', '--show-current'], cwd)).out.trim()
    const onBranch = branch === pr.headRefName
    const update = e.update !== false && onBranch
    const watches = (await loadWatches($)).filter(w => w.number !== number)
    watches.push({ number, cwd, update, head: pr.headRefOid.slice(0, 8), reported: [], errors: 0 })
    await saveWatches($, watches)
    showStatus($, watches)
    void poll($)
    const note = !onBranch ? ` ${cwd} is on ${branch || 'no branch'}, not ${pr.headRefName}, so the watch will not merge main into it.` : ''
    return { result: `Watching #${number} (${pr.headRefName}) from ${cwd}. You will be woken on a merge, a failed check, a review verdict, a conflict or a close.${note}` }
  })

  on('tool.call', { tool: UNWATCH_TOOL }, async ($, e) => {
    const number = parseNumber(e.number)
    if (number === undefined) return { deny: 'unwatch_pr: number must be a positive integer.' }
    const watches = await loadWatches($)
    const rest = watches.filter(w => w.number !== number)
    await saveWatches($, rest)
    line.delete(number)
    showStatus($, rest)
    return { result: rest.length === watches.length ? `#${number} was not being watched.` : `Stopped watching #${number}.` }
  })
}
