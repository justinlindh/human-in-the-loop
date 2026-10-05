import { afterAll, describe, expect, it } from 'vitest';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';

const SCRIPT = resolve(__dirname, '../../scripts/feature-media/publish.sh');
const tmp = mkdtempSync(join(toolTmp(), 'fm-publish-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();

// A bare origin holding main and an orphan feature-media, a plain clone of it that carries the script
// (the way a checkout does), and a detached worktree of that clone at feature-media.
function fixture(name) {
  const root = join(tmp, name);
  mkdirSync(root, { recursive: true });
  const origin = join(root, 'origin.git');
  const seed = join(root, 'seed');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '-b', 'main', seed);
  mkdirSync(join(seed, 'scripts/feature-media'), { recursive: true });
  copyFileSync(SCRIPT, join(seed, 'scripts/feature-media/publish.sh'));
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'main');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main');
  git(seed, 'checkout', '-q', '--orphan', 'feature-media');
  git(seed, 'rm', '-rfq', '.');
  writeFileSync(join(seed, 'README'), 'media\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'media');
  git(seed, 'push', '-q', 'origin', 'feature-media');
  const repo = join(root, 'clone');
  git(root, 'clone', '-q', origin, repo);
  git(repo, 'fetch', '-q', 'origin', 'feature-media');
  const wt = join(root, 'wt');
  git(repo, 'worktree', 'add', '-q', '--detach', wt, 'origin/feature-media');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho owner/repo\n');
  chmodSync(join(bin, 'gh'), 0o755);
  const media = join(root, 'still.webp');
  writeFileSync(media, 'not really a webp');
  return { origin, repo, wt, media, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FEATURE_MEDIA_WORKTREE: wt } };
}
const run = (f, cwd = f.repo) => spawnAsync('bash', [join(f.repo, 'scripts/feature-media/publish.sh'), f.media], { cwd, env: f.env, timeout: 120000 });

describe('feature-media publish.sh worktree guard', () => {
  it('publishes from a plain clone, whose git-common-dir is a relative path', async () => {
    const f = fixture('plain');
    const r = await run(f);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('still.webp');
    expect(git(f.origin, 'show', 'feature-media:still.webp')).toBe('not really a webp');
  });

  it('refuses a worktree that belongs to another repository, and leaves it untouched', async () => {
    const f = fixture('other');
    const stranger = fixture('stranger');
    writeFileSync(join(stranger.wt, 'keep.txt'), 'mine\n');
    const r = await run({ ...f, env: { ...f.env, FEATURE_MEDIA_WORKTREE: stranger.wt } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('belongs to another repository');
    expect(readFileSync(join(stranger.wt, 'keep.txt'), 'utf8')).toBe('mine\n');
  });

  it('refuses the checkout it runs from', async () => {
    const f = fixture('self');
    const r = await run({ ...f, env: { ...f.env, FEATURE_MEDIA_WORKTREE: f.repo } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a git worktree of its own');
  });
});
