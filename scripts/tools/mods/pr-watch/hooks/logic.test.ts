import { describe, expect, test } from 'claude-code/testing'

import { decide, describeLocalCi, jobOfLink, looksLikeTimeout, parseLocalCi, parseLook, parseNumber, tail, type PrWatch } from './logic'

const watch = (over: Partial<PrWatch> = {}): PrWatch => ({ number: 9, cwd: '/w', update: true, head: '', reported: [], errors: 0, ...over })
const say = (s: string) => `[wait-for 12:00:00] ${s}`

describe('parseLook', () => {
  test('a merged PR', () => {
    expect(parseLook(0, say('#9 merged'), 9)).toEqual({ kind: 'merged' })
  })
  test('a PR closed without merging', () => {
    expect(parseLook(6, say('#9 was closed without merging'), 9)).toEqual({ kind: 'closed' })
  })
  test('failing checks name the head and each check', () => {
    const l = parseLook(2, say('#9 at abcd1234: failing: test=failure local-ci=failure'), 9)
    expect(l).toEqual({ kind: 'failed', head: 'abcd1234', failing: ['test=failure', 'local-ci=failure'] })
  })
  test('a quiet look is the timeout with the waiting line', () => {
    const out = `${say('#9 at abcd1234: waiting on: test local-ci, review none, running: test tools')}\n${say('timed out waiting on #9')}`
    expect(parseLook(124, out, 9)).toEqual({ kind: 'waiting', head: 'abcd1234', review: 'none', waiting: ['test', 'local-ci'], running: ['test', 'tools'], allPassed: false })
  })
  test('everything passed and only the merge is left', () => {
    const out = `${say('#9 at abcd1234: waiting on: nothing, review success, running: none')}\n${say('timed out waiting on #9')}`
    const l = parseLook(124, out, 9)
    expect(l).toMatchObject({ kind: 'waiting', review: 'success', allPassed: true })
  })
  test('a timeout from the timeout command, with no waiting line, is an error', () => {
    expect(parseLook(124, '', 9).kind).toBe('error')
  })
  test('conflict, failed tests and a wrong worktree', () => {
    expect(parseLook(4, say('merging origin/main into x/y conflicts; resolve it by hand'), 9).kind).toBe('conflict')
    expect(parseLook(5, say('tests failed after merging main; the merge is committed locally but not pushed'), 9).kind).toBe('tests-failed')
    expect(parseLook(7, say("this worktree isn't a clean checkout of x/y at abcd1234; update it by hand"), 9).kind).toBe('wrong-worktree')
  })
  test('another PR number in the output is not this one', () => {
    expect(parseLook(0, say('#10 merged'), 9).kind).toBe('error')
  })
})

describe('decide', () => {
  const waiting = (head: string, review = 'none') => ({ kind: 'waiting' as const, head, review, waiting: ['test'], running: [], allPassed: false })

  test('waiting wakes nobody and follows a new head', () => {
    const d = decide(watch({ head: 'aaaa' }), waiting('bbbb'))
    expect(d.messages).toEqual([])
    expect(d.watch.head).toBe('bbbb')
    expect(d.done).toBe(false)
  })
  test('a merge wakes once and ends the watch', () => {
    const d = decide(watch(), { kind: 'merged' })
    expect(d.messages).toEqual(['#9 merged.'])
    expect(d.done).toBe(true)
  })
  test('a close without merging ends the watch', () => {
    expect(decide(watch(), { kind: 'closed' })).toMatchObject({ done: true, messages: ['#9 was closed without merging.'] })
  })
  test('a failure wakes once per head and failing set, then again after a push', () => {
    const fail = (head: string, f: string[]) => ({ kind: 'failed' as const, head, failing: f })
    const first = decide(watch(), fail('aaaa', ['test=failure']))
    expect(first.messages).toHaveLength(1)
    expect(first.enrich).toEqual({ head: 'aaaa', failing: ['test=failure'] })
    const again = decide(first.watch, fail('aaaa', ['test=failure']))
    expect(again.messages).toEqual([])
    expect(again.enrich).toBeUndefined()
    const more = decide(again.watch, fail('aaaa', ['test=failure', 'local-ci=failure']))
    expect(more.messages).toHaveLength(1)
    const pushed = decide(more.watch, fail('bbbb', ['test=failure']))
    expect(pushed.messages).toHaveLength(1)
  })
  test('a review verdict wakes once per head', () => {
    const pass = decide(watch(), waiting('aaaa', 'success'))
    expect(pass.messages).toEqual(['#9 review verdict on aaaa: passed.'])
    expect(decide(pass.watch, waiting('aaaa', 'success')).messages).toEqual([])
    expect(decide(pass.watch, waiting('bbbb', 'none')).messages).toEqual([])
  })
  test('a failed review is a verdict, not a check failure to fetch logs for', () => {
    const d = decide(watch(), { kind: 'failed', head: 'aaaa', failing: ['review=failure'] })
    expect(d.messages).toEqual(['#9 review verdict on aaaa: failed.'])
    expect(d.enrich).toBeUndefined()
  })
  test('a conflict wakes once per head', () => {
    const c = { kind: 'conflict' as const, detail: 'x' }
    const d = decide(watch({ head: 'aaaa' }), c)
    expect(d.messages).toHaveLength(1)
    expect(decide(d.watch, c).messages).toEqual([])
  })
  test('errors wake only on the third in a row, and a good look resets the count', () => {
    const e = { kind: 'error' as const, detail: 'exit 1: gh' }
    let w = watch()
    const woke: number[] = []
    for (let i = 0; i < 4; i++) { const d = decide(w, e); w = d.watch; woke.push(d.messages.length) }
    expect(woke).toEqual([0, 0, 1, 0])
    expect(decide(w, waiting('aaaa')).watch.errors).toBe(0)
  })
  test('the reported list stays bounded', () => {
    let w = watch()
    for (let i = 0; i < 100; i++) w = decide(w, { kind: 'failed', head: `h${i}`, failing: ['test=failure'] }).watch
    expect(w.reported.length).toBeLessThanOrEqual(60)
  })
})

const table = (rows: string) => `### Local CI: FAIL\n\nHead \`abc\`.\n\n| step | result | seconds |\n|---|---|---|\n${rows}`

describe('Local CI comment', () => {
  const body = table('| deps | pass | 1 |\n| render-checks | FAIL | 1200 |\n| golden | FAIL | 80 |\n| phone-check | pass | 349 |')
  test('reads the verdict and rows', () => {
    const p = parseLocalCi(body)
    expect(p.verdict).toBe('FAIL')
    expect(p.rows).toHaveLength(4)
    expect(p.rows[1]).toEqual({ step: 'render-checks', result: 'FAIL', seconds: 1200 })
  })
  test('a failure at the step limit is a timeout, other failures are not', () => {
    const rows = parseLocalCi(body).rows
    expect(looksLikeTimeout(rows[1])).toBe(true)
    expect(looksLikeTimeout(rows[2])).toBe(false)
    expect(looksLikeTimeout(rows[3])).toBe(false)
  })
  test('the description names failed steps, flags the timeout and points at the kept logs', () => {
    const text = describeLocalCi(body, 9, 'abcdef0123')
    expect(text).toContain('render-checks: FAIL after 1200s (the step limit: a ci-rerun candidate)')
    expect(text).toContain('golden: FAIL after 80s')
    expect(text).toContain('pr9-abcdef0')
    expect(text).not.toContain('deps')
  })
  test('a machine error says so', () => {
    expect(describeLocalCi(body.replace('FAIL\n', 'ERROR (the machine, not the code)\n'), 9, 'abcdef0')).toContain('ci-rerun label')
  })
})

describe('helpers', () => {
  test('tail keeps the last lines and caps the size', () => {
    expect(tail('a\nb\nc', 2)).toBe('b\nc')
    expect(tail('x'.repeat(5000), 30, 100)).toHaveLength(100)
  })
  test('job id from a check link', () => {
    expect(jobOfLink('https://github.com/o/r/actions/runs/123/job/456')).toBe('456')
    expect(jobOfLink('https://example.com')).toBeUndefined()
  })
  test('parseNumber takes positive integers and digit strings only', () => {
    expect([parseNumber(12), parseNumber('12'), parseNumber(0), parseNumber(-1), parseNumber(1.5), parseNumber('x'), parseNumber(undefined)]).toEqual([12, 12, undefined, undefined, undefined, undefined, undefined])
  })
})
