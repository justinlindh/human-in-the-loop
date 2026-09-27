import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'loop-report-test-'));
const script = process.env.LOOP_REPORT_SCRIPT || resolve('scripts/perf/loop-report.js');
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const ts = (second) => new Date(Date.UTC(2020, 0, 1) + second * 1000).toISOString();
const row = (second, extra = {}) => ({ ts: ts(second), worktree: 'fixture', branch: 'HEAD', sha: 'abc12345', pid: 1, ...extra });
const run = (second, extra = {}) => row(second, { kind: 'run', tool: 'ci-pr', wall_s: 100, exit: 0, ...extra });
const cache = (second, extra = {}) => row(second, { kind: 'cache', tool: 'golden', cache: 'miss', input: 'base-key', ...extra });
function report(rows, args = [], torn = false) {
  const file = join(dir, 'timings.jsonl');
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (torn ? '\n{"ts":' : '\n'));
  const result = spawnSync(process.execPath, [script, '--file', file, ...args, '--json'], { encoding: 'utf8', env: { ...process.env, HITL_TIMINGS: 'off' }, timeout: 10000 });
  expect(result.status, result.stderr).toBe(0);
  const start = result.stdout.indexOf('\n{');
  return { text: result.stdout, data: start < 0 ? null : JSON.parse(result.stdout.slice(start)) };
}

describe('loop report recorded evidence', () => {
  it('keeps different PRs on one launcher SHA out of the same candidate group', () => {
    const { data, text } = report([run(1, { pr: 10 }), run(2, { pr: 11 }), run(3, { pr: 10 })]);
    expect(data.repeats).toHaveLength(1);
    expect(data.repeats[0].runs).toBe(2);
    expect(data.repeats[0].recorded.pr).toBe(10);
    expect(data.repeats[0].cache_identity).toBe('unverified');
    expect(text).not.toMatch(/identical inputs|could have saved/);
  });

  it('separates recorded arguments, GL mode, seeds and gate moments on the same checkout', () => {
    const configs = [
      { tool: 'clip', args: '--rig', gl: 'gpu' },
      { tool: 'clip', args: '--rig', gl: 'software' },
      { tool: 'clip', args: '', gl: 'gpu' },
      { tool: 'clip', gl: 'gpu' },
      { tool: 'balance', seeds: 100, bots: 'balanced' },
      { tool: 'balance', seeds: 200, bots: 'balanced' },
      { tool: 'gates', moment: 'printer' },
      { tool: 'gates', moment: 'standup' },
      { tool: 'probe', mode: 'gpu' },
      { tool: 'probe', mode: 'software' },
    ];
    const { data } = report(configs.flatMap((c, i) => [run(i, c), run(i + 100, c)]));
    expect(data.repeats).toHaveLength(configs.length);
    expect(data.repeats.every((r) => r.runs === 2)).toBe(true);
  });

  it('keeps parent and child durations separate and uses chronological subsequent runs', () => {
    const rows = [run(30, { pr: 10, wall_s: 70 }), run(10, { pr: 10, wall_s: 100 }),
      run(25, { kind: 'step', tool: 'ci-local', step: 'test:fast', pr: 10, wall_s: 20 }),
      run(5, { kind: 'step', tool: 'ci-local', step: 'test:fast', pr: 10, wall_s: 40 })];
    const { data, text } = report(rows);
    expect(data.repeats.map((r) => r.subsequent_s)).toEqual([70, 20]);
    expect(report([...rows].reverse()).data).toEqual(data);
    expect(text).not.toMatch(/of repeats|cache saving/i);
    expect(text).toContain('Do not add parent and child durations');
    expect(data.tools.find((r) => r.what === 'ci-pr').total_s).toBe(170);
    expect(data.slowest[0].wall_s).toBe(100);
  });

  it('keeps missing checkout identity visible even for a singleton', () => {
    const { data, text } = report([run(1, { sha: undefined })]);
    expect(data.identity.missing_sha).toBe(1);
    expect(data.unidentified[0]).toMatchObject({ what: 'ci-pr', runs: 1, total_s: 100 });
    expect(text).toContain('Missing checkout identity');
    expect(text).toContain('unverified');
  });

  it('does not promote a matching truncated argument prefix or missing SHA to cache identity', () => {
    const args = '--only=' + 'x'.repeat(113);
    const { data } = report([run(1, { tool: 'clip', args }), run(2, { tool: 'clip', args }),
      run(3, { tool: 'clip', args, worktree: 'another-fixture' }),
      run(4, { sha: undefined }), run(5, { sha: undefined })]);
    expect(data.repeats).toHaveLength(2);
    expect(data.repeats.every((r) => r.cache_identity === 'unverified' && r.runs === 2)).toBe(true);
    expect(data.identity.missing_sha).toBe(2);
    expect(data.identity.note).toContain('truncated');
  });

  it('separates CI admission, GPU, software and unknown modes, with tails and timeouts', () => {
    const lock = (mode, wait_s, timed_out = 0) => row(wait_s, { kind: 'lock', mode, for: 'job', wait_s, timed_out });
    const { data, text } = report([lock('ci-run', 100), lock('ci', 300, 1), lock('gpu', 2), lock('gpu', 10, 1), lock('software', 20), lock('other', 7), lock(undefined, 3)]);
    expect(data.lock_classes.find((r) => r.what === 'CI admission')).toMatchObject({ waits: 2, total_s: 400, median_s: 200, p90_s: 280, max_s: 300, timeouts: 1 });
    expect(data.lock_classes.find((r) => r.what === 'GPU render')).toMatchObject({ waits: 2, total_s: 12, timeouts: 1 });
    expect(data.lock_classes.find((r) => r.what === 'Software render').total_s).toBe(20);
    expect(data.lock_classes.filter((r) => r.what.startsWith('Unknown')).map((r) => r.total_s).sort()).toEqual([3, 7]);
    expect(text).not.toContain('Render lock waits (');
    expect(text).toContain('Queue duration alone does not justify capacity changes');
  });

  it('separates golden units and excludes disabled and unknown outcomes from enabled rates', () => {
    const { data } = report([
      cache(1, { cache: 'hit' }), cache(70), cache(140, { cache: 'off', input: undefined }),
      cache(210, { scene: 'char-lineup', cache: 'hit' }),
      cache(280, { scene: 'char-lineup', cache: 'off', input: null }),
      cache(350, { scene: 'char-lineup', cache: 'unknown' }),
    ]);
    expect(data.cache).toHaveLength(2);
    expect(data.cache.find((r) => r.unit === 'whole-run')).toMatchObject({ enabled: 2, hits: 1, misses: 1, disabled: 1, hit_rate: 0.5 });
    expect(data.cache.find((r) => r.unit === 'scene')).toMatchObject({ enabled: 1, hits: 1, disabled: 1, unknown: 1, hit_rate: 1 });
    expect(report([cache(1, { cache: 'off' })]).data.cache[0].hit_rate).toBeNull();
  });

  it('deduplicates only matching recorded context and outcomes, labels the time heuristic', () => {
    const rows = [cache(1, { scene: 'char-lineup' }), cache(2, { scene: 'char-lineup', pid: 2 }),
      cache(3, { scene: 'prop-lineup' }), cache(4, { scene: 'char-lineup', args: '--update' }),
      cache(5, { scene: 'char-lineup', gl: 'gpu' }), cache(6, { scene: 'char-lineup', pr: 10 }),
      cache(7, { scene: 'char-lineup', cache: 'hit' }), cache(61, { scene: 'char-lineup' }),
      cache(8, { scene: 'char-lineup', input: null }), cache(9, { scene: 'char-lineup', input: null })];
    const { data, text } = report([...rows].reverse());
    expect(data.cache[0]).toMatchObject({ raw_lookups: 10, lookups: 9, deduplicated: 1, hits: 1 });
    expect(text).toContain('60-second heuristic');
    expect(text).toContain('scene base key');
    expect(report(rows).data.cache).toEqual(data.cache);
  });

  it('preserves torn-line, since, top, JSON, empty-window and missing-file behavior', () => {
    const { data, text } = report([run(1), run(2), run(3, { tool: 'clip' })], ['--since', ts(2), '--top', '1'], true);
    expect(text).toContain('2 records');
    expect(data.slowest).toHaveLength(1);
    expect(data.tools).toHaveLength(2);
    expect(report([run(1)], ['--since', ts(2)]).text).toContain('nothing logged');
    const now = new Date().toISOString();
    expect(report([run(1), run(2, { ts: now })], ['--since', '24h']).data.tools[0].runs).toBe(1);
    expect(report([run(1), run(2, { ts: now })], ['--since', '7d']).data.tools[0].runs).toBe(1);
    const result = spawnSync(process.execPath, [script, '--file', join(dir, 'missing')], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no timing log');
  });
});
