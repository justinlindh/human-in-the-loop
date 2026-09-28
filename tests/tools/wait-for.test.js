import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/wait-for.sh');

// A fake gh answers `pr view` from a queue of JSON files (the last one repeats), `api` with the comment
// list, and `issue view` with issue.json. HEAD_SHA in a reply becomes the work clone's current commit.
const FAKE_GH = `#!/usr/bin/env bash
d="$FAKE_GH_DIR"
case "$1 $2" in
  "pr view")
    n=$(cat "$d/n" 2>/dev/null || echo 0); f="$d/pr-$n.json"
    [ -f "$f" ] || f="$(ls "$d"/pr-*.json | sort -V | tail -1)"; echo $((n + 1)) > "$d/n"
    sed "s/HEAD_SHA/$(git -C "$WORK" rev-parse HEAD)/" "$f" ;;
  "issue view") cat "$d/issue.json" ;;
  api*) cat "$d/comments.json" ;;
esac
`;

// Child processes get no GIT_* variables from whatever runs the tests (a git hook sets GIT_DIR and
// GIT_INDEX_FILE), so every git command here can only reach the scratch repos.
const cleanEnv = (extra = {}) => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...extra,
});
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() }).trim();

let root, work, bin, ghDir;
const green = { state: 'OPEN', headRefOid: 'HEAD_SHA', headRefName: 'feature', mergeStateStatus: 'CLEAN', mergeable: 'MERGEABLE', statusCheckRollup: [
  { __typename: 'StatusContext', context: 'local-ci', state: 'SUCCESS' },
  { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
] };
const replies = (...list) => list.forEach((r, i) => writeFileSync(join(ghDir, `pr-${i}.json`), JSON.stringify(r)));
const run = (...args) => spawnSync('bash', [SCRIPT, ...args], { cwd: work, encoding: 'utf8', timeout: 60000,
  env: cleanEnv({ PATH: `${bin}:${process.env.PATH}`, FAKE_GH_DIR: ghDir, WORK: work }) });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wait-for-'));
  bin = join(root, 'bin'); ghDir = join(root, 'gh'); mkdirSync(bin); mkdirSync(ghDir);
  writeFileSync(join(bin, 'gh'), FAKE_GH); chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(join(ghDir, 'comments.json'), JSON.stringify([{ body: '### Local CI: FAIL', html_url: 'https://example.test/c/1' }]));
  const origin = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  work = join(root, 'work');
  git(root, 'clone', '-q', origin, work);
  writeFileSync(join(work, 'a.txt'), 'one\n'); git(work, 'add', '.'); git(work, 'commit', '-qm', 'base'); git(work, 'push', '-q', 'origin', 'HEAD:main');
  git(work, 'switch', '-qc', 'feature'); writeFileSync(join(work, 'b.txt'), 'feature\n'); git(work, 'add', '.'); git(work, 'commit', '-qm', 'feature');
  git(work, 'push', '-q', '-u', 'origin', 'feature');
}, 60000);
afterEach(() => rmSync(root, { recursive: true, force: true }));

// Moves main ahead from a second clone; `file` decides whether the PR branch will conflict.
function advanceMain(file, text) {
  const other = join(root, 'other');
  git(root, 'clone', '-q', '-b', 'main', join(root, 'origin.git'), other);
  writeFileSync(join(other, file), text); git(other, 'add', '.'); git(other, 'commit', '-qm', 'main moves'); git(other, 'push', '-q', 'origin', 'main');
}

// Each case shells out to git and bash several times, so a loaded machine gets a minute, not the default 10 to 20 s.
describe('scripts/wait-for.sh', { timeout: 60000 }, () => {
  it('exits 0 once local-ci and every GitHub check pass on the head', () => {
    replies({ ...green, statusCheckRollup: [{ __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: '' }] }, green);
    const r = run('7', '--poll', '0');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/every GitHub check passed/);
  });

  it('exits 2 on a failing check and links the Local CI comment', () => {
    replies({ ...green, statusCheckRollup: [{ __typename: 'StatusContext', context: 'local-ci', state: 'FAILURE' }] });
    const r = run('7', '--poll', '0');
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/local-ci=failure/);
    expect(r.stdout).toContain('https://example.test/c/1');
  });

  it('merges main into a PR that fell behind, tests, pushes, then waits on the new head', () => {
    advanceMain('c.txt', 'main\n');
    replies({ ...green, mergeStateStatus: 'BEHIND' }, green);
    const r = run('7', '--poll', '0', '--test', 'true');
    expect(r.status).toBe(0);
    expect(git(work, 'log', '-1', '--format=%s')).toMatch(/^Merge/);
    expect(git(work, 'rev-parse', 'origin/feature')).toBe(git(work, 'rev-parse', 'HEAD'));
  });

  it('does not push when the tests fail after merging main', () => {
    advanceMain('c.txt', 'main\n');
    const before = git(work, 'rev-parse', 'origin/feature');
    replies({ ...green, mergeStateStatus: 'BEHIND' });
    const r = run('7', '--poll', '0', '--test', 'false');
    expect(r.status).toBe(5);
    git(work, 'fetch', '-q');
    expect(git(work, 'rev-parse', 'origin/feature')).toBe(before);
  });

  it('aborts a conflicting merge and says so', () => {
    advanceMain('b.txt', 'main edits the same file\n');
    replies({ ...green, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' });
    const r = run('7', '--poll', '0', '--test', 'true');
    expect(r.status).toBe(4);
    expect(git(work, 'status', '--porcelain')).toBe('');
  });

  it('only reports a PR that is behind with --no-update', () => {
    replies({ ...green, mergeStateStatus: 'BEHIND' });
    const r = run('7', '--poll', '0', '--no-update');
    expect(r.status).toBe(3);
  });

  it('refuses to update from a worktree that is not on the PR branch', () => {
    git(work, 'switch', '-q', 'main');
    replies({ ...green, headRefName: 'feature', headRefOid: 'deadbeef', mergeStateStatus: 'BEHIND' });
    const r = run('7', '--poll', '0', '--test', 'true');
    expect(r.status).toBe(7);
  });

  it('keeps waiting with --merged until the PR merges', () => {
    replies(green, green, { ...green, state: 'MERGED' });
    const r = run('7', '--poll', '0', '--merged');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/#7 merged/);
  });

  it('waits on an old local-ci failure while the PR carries ci-rerun, then follows the rerun', () => {
    const failed = { ...green, statusCheckRollup: [{ __typename: 'StatusContext', context: 'local-ci', state: 'FAILURE' }] };
    replies({ ...failed, labels: [{ name: 'ci-rerun' }] },
      { ...green, statusCheckRollup: [{ __typename: 'StatusContext', context: 'local-ci', state: 'PENDING' }] }, green);
    const r = run('7', '--poll', '0');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/local-ci rerun asked/);
    expect(r.stdout).not.toMatch(/failing/);
  });

  it('still fails on another check while ci-rerun is on', () => {
    replies({ ...green, labels: [{ name: 'ci-rerun' }], statusCheckRollup: [
      { __typename: 'StatusContext', context: 'local-ci', state: 'FAILURE' },
      { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' },
    ] });
    const r = run('7', '--poll', '0');
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/test=failure/);
    expect(r.stdout).not.toMatch(/local-ci=failure/);
  });

  it('warns once when auto-CI has not picked up the head', () => {
    replies({ ...green, statusCheckRollup: [] }, { ...green, statusCheckRollup: [] }, green);
    const r = run('7', '--poll', '0', '--pickup', '0');
    expect(r.status).toBe(0);
    expect(r.stdout.match(/auto-CI hasn't reported/g)).toHaveLength(1);
  });

  it('--issue with a pull request number stops when it merges', () => {
    writeFileSync(join(ghDir, 'issue.json'), JSON.stringify({ state: 'MERGED' }));
    const r = run('--issue', '9', '--poll', '0', '--timeout', '0');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/#9 merged/);
  });

  it('touches only its scratch repos even when run with a git hook\'s GIT_* variables set', () => {
    const saved = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
    process.env.GIT_DIR = join(root, 'not-a-repo');
    process.env.GIT_INDEX_FILE = join(root, 'not-an-index');
    process.env.GIT_WORK_TREE = root;
    try {
      advanceMain('c.txt', 'main\n');
      replies({ ...green, mergeStateStatus: 'BEHIND' }, green);
      const r = run('7', '--poll', '0', '--test', 'true');
      expect(r.status).toBe(0);
      expect(git(work, 'rev-parse', 'origin/feature')).toBe(git(work, 'rev-parse', 'HEAD'));
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  it('waits for an issue to close', () => {
    writeFileSync(join(ghDir, 'issue.json'), JSON.stringify({ state: 'CLOSED' }));
    const r = run('--issue', '9', '--poll', '0');
    expect(r.status).toBe(0);
  });
});
