// Pure parts of pr-watch: reading one look at a PR (scripts/wait-for.sh run once), deciding what is
// worth waking the session for, and reading the Local CI comment.

export type PrWatch = {
  number: number
  cwd: string
  update: boolean
  head: string
  reported: string[]
  errors: number
}

export type Look =
  | { kind: 'merged' }
  | { kind: 'closed' }
  | { kind: 'failed'; head: string; failing: string[] }
  | { kind: 'conflict' | 'tests-failed' | 'wrong-worktree'; detail: string }
  | { kind: 'waiting'; head: string; review: string; waiting: string[]; running: string[]; allPassed: boolean }
  | { kind: 'error'; detail: string }

export type Decision = {
  watch: PrWatch
  messages: string[]
  done: boolean
  // A failing check worth fetching logs for.
  enrich?: { head: string; failing: string[] }
}

// One look is `wait-for.sh <pr> --merged --timeout 0`: it reads GitHub once, merges main into the
// branch when due, and leaves through its timeout (124) when nothing has happened.
export function parseLook(exitCode: number, stdout: string, pr: number): Look {
  const text = stdout.trim()
  const lines = text.split('\n')
  const last = lines[lines.length - 1] ?? ''
  const at = (re: RegExp) => lines.map(l => re.exec(l)).filter((m): m is RegExpExecArray => m !== null).pop()

  if (exitCode === 0 && new RegExp(`#${pr} merged`).test(text)) return { kind: 'merged' }
  if (exitCode === 6) return { kind: 'closed' }
  if (exitCode === 2) {
    const m = at(new RegExp(`#${pr} at (\\w+): failing: (.*)$`))
    if (m) return { kind: 'failed', head: m[1], failing: m[2].trim().split(/\s+/) }
  }
  if (exitCode === 4) return { kind: 'conflict', detail: last }
  if (exitCode === 5) return { kind: 'tests-failed', detail: lines.slice(-6).join('\n') }
  if (exitCode === 7) return { kind: 'wrong-worktree', detail: last }
  if (exitCode === 124 && text.includes(`timed out waiting on #${pr}`)) {
    const m = at(new RegExp(`#${pr} at (\\w+): waiting on: (.*?), review (\\w+), running: ([^,]*)`))
    if (m) {
      const list = (s: string) => (s === 'nothing' || s === 'none' ? [] : s.trim().split(/\s+/))
      const waiting = list(m[2]), running = list(m[4])
      return { kind: 'waiting', head: m[1], review: m[3], waiting, running, allPassed: waiting.length === 0 && running.length === 0 }
    }
    return { kind: 'waiting', head: '', review: 'none', waiting: [], running: [], allPassed: false }
  }
  return { kind: 'error', detail: `exit ${exitCode}: ${last || '(no output)'}` }
}

const VERDICTS = new Set(['success', 'failure', 'error'])
const REPORTED_KEEP = 60

// What a look changes: the next state of the watch, and the lines that should wake the session.
// Each fact is reported once (by key), so a failure that stands across polls wakes the lane once and
// a new head starts fresh.
export function decide(watch: PrWatch, look: Look): Decision {
  const w: PrWatch = { ...watch, reported: [...watch.reported] }
  const messages: string[] = []
  const once = (key: string, text: string): boolean => {
    if (w.reported.includes(key)) return false
    w.reported.push(key)
    if (w.reported.length > REPORTED_KEEP) w.reported.shift()
    messages.push(text)
    return true
  }
  const n = w.number

  if (look.kind === 'merged') return { watch: w, messages: [`#${n} merged.`], done: true }
  if (look.kind === 'closed') return { watch: w, messages: [`#${n} was closed without merging.`], done: true }

  if (look.kind === 'error') {
    w.errors += 1
    if (w.errors === 3) messages.push(`#${n}: the last 3 looks failed (${look.detail}). Still watching; check gh and the worktree.`)
    return { watch: w, messages, done: false }
  }
  w.errors = 0

  if (look.kind === 'conflict' || look.kind === 'tests-failed' || look.kind === 'wrong-worktree') {
    const what = {
      conflict: 'merging main into the branch conflicts; resolve it by hand',
      'tests-failed': 'main merged into the branch but the tests failed, so nothing was pushed',
      'wrong-worktree': 'the watch cannot update the branch from this worktree',
    }[look.kind]
    once(`${look.kind}:${w.head}`, `#${n}: ${what}.\n${look.detail}`)
    return { watch: w, messages, done: false }
  }

  if (look.head) w.head = look.head
  const head = look.head

  if (look.kind === 'failed') {
    const review = look.failing.filter(f => f.startsWith('review='))
    const checks = look.failing.filter(f => !f.startsWith('review='))
    if (review.length) once(`review:${head}:failure`, `#${n} review verdict on ${head}: failed.`)
    if (checks.length && once(`failed:${head}:${checks.join(' ')}`, `#${n} at ${head}: failing ${checks.join(' ')}.`)) {
      return { watch: w, messages, done: false, enrich: { head, failing: checks } }
    }
    return { watch: w, messages, done: false }
  }

  if (VERDICTS.has(look.review)) once(`review:${head}:${look.review}`, `#${n} review verdict on ${head}: ${look.review === 'success' ? 'passed' : 'failed'}.`)
  return { watch: w, messages, done: false }
}

export type CiRow = { step: string; result: string; seconds: number }

// The step table of the newest "### Local CI" comment.
export function parseLocalCi(body: string): { verdict: string; rows: CiRow[] } {
  const verdict = /^### Local CI: ?(.*)$/m.exec(body)?.[1]?.trim() ?? ''
  const rows: CiRow[] = []
  for (const line of body.split('\n')) {
    const m = /^\| ([^|]+) \| ([^|]+) \| (\d+) \|$/.exec(line)
    if (m && m[1].trim() !== 'step') rows.push({ step: m[1].trim(), result: m[2].trim(), seconds: Number(m[3]) })
  }
  return { verdict, rows }
}

// The wall limits CI puts on a step (timeout 600, 900, 1200): a failure that ran exactly that long
// is the limit, not the code.
const LIMITS = [600, 900, 1200]
export const looksLikeTimeout = (row: CiRow): boolean => /^(fail|error)/i.test(row.result) && LIMITS.some(l => Math.abs(row.seconds - l) <= 5)

export function failedSteps(rows: readonly CiRow[]): CiRow[] {
  return rows.filter(r => /^(fail|error)/i.test(r.result))
}

export function describeLocalCi(body: string, number: number, head: string): string {
  const { verdict, rows } = parseLocalCi(body)
  const bad = failedSteps(rows)
  if (!bad.length) return `Local CI ${verdict || '(no step table)'}`
  const lines = bad.map(r => `- ${r.step}: ${r.result} after ${r.seconds}s${looksLikeTimeout(r) ? ' (the step limit: a ci-rerun candidate)' : ''}`)
  if (verdict.startsWith('ERROR')) lines.push('The machine failed, not the code; auto CI retries once, then add the ci-rerun label.')
  return `Local CI ${verdict}:\n${lines.join('\n')}\nKept logs: ~/.cache/hitl-ci/failed/pr${number}-${head.slice(0, 7)}/<step>.log`
}

export function tail(text: string, lines = 30, chars = 2500): string {
  const t = text.trimEnd().split('\n').slice(-lines).join('\n')
  return t.length > chars ? t.slice(t.length - chars) : t
}

// `/actions/runs/<run>/job/<job>` in a check's link.
export function jobOfLink(link: string): string | undefined {
  return /\/job\/(\d+)/.exec(link)?.[1]
}

export function parseNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined
}
