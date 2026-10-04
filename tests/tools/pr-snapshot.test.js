import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ensureFresh, interval, read, signature, trimComments } from '../../scripts/tools/pr-snapshot.mjs';

const SCRIPT = resolve('scripts/tools/pr-snapshot.mjs');
const pr = (number, over = {}) => ({ number, title: `pr ${number}`, state: 'OPEN', isDraft: false, headRefName: 'x/y', headRefOid: `h${number}`, baseRefName: 'main', mergeStateStatus: 'CLEAN', mergeable: 'MERGEABLE', labels: [], statusCheckRollup: [], comments: [], ...over });

let dir, file;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pr-snapshot-')); file = join(dir, 'snap.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('interval', () => {
  const MIN = 60000;
  it('jitters the requested age by 10 percent', () => {
    expect(interval({ requestedMs: 60000, changedAt: 0, now: 1000, rand: () => 0 })).toBe(54000);
    expect(interval({ requestedMs: 60000, changedAt: 0, now: 1000, rand: () => 1 })).toBe(66000);
  });
  it('stretches to 120 s once nothing changed for 20 minutes, and never shrinks a longer request', () => {
    expect(interval({ requestedMs: 60000, changedAt: 0, now: 20 * MIN, rand: () => 0.5 })).toBe(120000);
    expect(interval({ requestedMs: 60000, changedAt: 0, now: 20 * MIN - 1, rand: () => 0.5 })).toBe(60000);
    expect(interval({ requestedMs: 300000, changedAt: 0, now: 30 * MIN, rand: () => 0.5 })).toBe(300000);
  });
  it('has a floor, so a tiny request cannot hammer gh', () => {
    expect(interval({ requestedMs: 1000, changedAt: 0, now: 0, rand: () => 0.5 })).toBe(15000);
  });
});

describe('signature and comments', () => {
  it('changes with a new head, a check result, a label, a merge state, a draft flip or auto-merge', () => {
    const base = signature(pr(1, { statusCheckRollup: [{ name: 'test', conclusion: 'SUCCESS' }] }));
    for (const over of [{ headRefOid: 'other' }, { statusCheckRollup: [{ name: 'test', conclusion: 'FAILURE' }] }, { labels: [{ name: 'ci-rerun' }] }, { mergeStateStatus: 'BEHIND' }, { isDraft: true }, { autoMergeRequest: { enabledAt: 'x' } }]) {
      expect(signature(pr(1, { statusCheckRollup: [{ name: 'test', conclusion: 'SUCCESS' }], ...over }))).not.toBe(base);
    }
  });
  it('does not change with the title or updatedAt', () => {
    expect(signature(pr(1, { title: 'a', updatedAt: '1' }))).toBe(signature(pr(1, { title: 'b', updatedAt: '2' })));
  });
  it('keeps only the newest Local CI comment and the newest owner record', () => {
    const c = [{ body: '### Local CI: FAIL old' }, { body: 'chat' }, { body: '### Local CI: PASS new' }, { body: '<!-- hitl-owner\nowner: a' }, { body: '<!-- hitl-owner\nowner: b' }];
    expect(trimComments(c).map((x) => x.body)).toEqual(['### Local CI: PASS new', '<!-- hitl-owner\nowner: b']);
    expect(trimComments(undefined)).toEqual([]);
  });
});

describe('ensureFresh', () => {
  const counted = (lists) => { const calls = []; return { calls, fetchPrs: () => { calls.push(1); return lists[Math.min(calls.length - 1, lists.length - 1)]; } }; };

  it('fetches once, then serves the file until the interval passes', async () => {
    const { calls, fetchPrs } = counted([[pr(1)]]);
    let t = 1_000_000;
    const opts = { file, fetchPrs, now: () => t, rand: () => 0.5 };
    expect((await ensureFresh(opts)).prs.map((p) => p.number)).toEqual([1]);
    t += 30000; await ensureFresh(opts);
    t += 29000; await ensureFresh(opts);
    expect(calls.length).toBe(1);
    t += 2000; await ensureFresh(opts);
    expect(calls.length).toBe(2);
  });

  it('moves changedAt only when something a watcher reads changed', async () => {
    const { fetchPrs } = counted([[pr(1)], [pr(1, { title: 'renamed' })], [pr(1, { headRefOid: 'new' })]]);
    let t = 1_000_000;
    const opts = { file, fetchPrs, now: () => t, rand: () => 0.5 };
    const a = await ensureFresh(opts); t += 100000;
    const b = await ensureFresh(opts); t += 100000;
    const c = await ensureFresh(opts);
    expect([b.changedAt === a.changedAt, c.changedAt > b.changedAt, c.fetchedAt > b.fetchedAt]).toEqual([true, true, true]);
  });

  it('backs off to 120 s after 20 quiet minutes', async () => {
    const { calls, fetchPrs } = counted([[pr(1)]]);
    let t = 1_000_000;
    const opts = { file, fetchPrs, now: () => t, rand: () => 0.5 };
    await ensureFresh(opts);
    t += 21 * 60000; await ensureFresh(opts);
    expect(calls.length).toBe(2);
    t += 90000; await ensureFresh(opts);
    expect(calls.length).toBe(2);
    t += 40000; await ensureFresh(opts);
    expect(calls.length).toBe(3);
  });

  it('returns the old snapshot as stale when gh fails, and null with nothing to return', async () => {
    let t = 1_000_000, ok = true;
    const fetchPrs = () => { if (!ok) throw new Error('gh: network'); return [pr(1)]; };
    const opts = { file, fetchPrs, now: () => t, rand: () => 0.5 };
    expect(await ensureFresh({ ...opts, file: join(dir, 'none.json'), fetchPrs: () => { throw new Error('x'); } })).toBeNull();
    await ensureFresh(opts);
    ok = false; t += 200000;
    const s = await ensureFresh(opts);
    expect([s.isStale, s.error, s.prs.length]).toEqual([true, 'gh: network', 1]);
  });

  it('force fetches even when fresh, and never leaves its lock behind', async () => {
    const { calls, fetchPrs } = counted([[pr(1)]]);
    const opts = { file, fetchPrs, now: () => 5, rand: () => 0.5 };
    await ensureFresh(opts); await ensureFresh({ ...opts, force: true });
    expect(calls.length).toBe(2);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it('trims comments in what it writes', async () => {
    const { fetchPrs } = counted([[pr(1, { comments: [{ body: 'chat' }, { body: '### Local CI: PASS' }] })]]);
    await ensureFresh({ file, fetchPrs, now: () => 5 });
    expect(read(file).prs[0].comments).toEqual([{ body: '### Local CI: PASS' }]);
  });
});

// The CLI against a stand-in gh that counts its calls.
describe('pr-snapshot.mjs', () => {
  let bin, counter, env;
  beforeEach(() => {
    bin = join(dir, 'bin'); counter = join(dir, 'calls');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\necho x >>"${counter}"\n[ -n "$GH_SLEEP" ] && sleep "$GH_SLEEP"\n[ -n "$GH_FAIL" ] && { echo "gh: down" >&2; exit 1; }\ncat "${join(dir, 'prs.json')}"\n`);
    chmodSync(join(bin, 'gh'), 0o755);
    writeFileSync(join(dir, 'prs.json'), JSON.stringify([pr(7), pr(8, { statusCheckRollup: [{ name: 'test', conclusion: 'SUCCESS' }] })]));
    env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HITL_PR_SNAPSHOT: file };
  });
  const run = (args = [], extra = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...env, ...extra }, timeout: 60000 });
  const calls = () => (existsSync(counter) ? readFileSync(counter, 'utf8').split('\n').filter(Boolean).length : 0);

  it('prints the snapshot, and one PR with its signature', () => {
    const all = JSON.parse(run().stdout);
    expect([all.prs.map((p) => p.number), all.isStale, all.ageSeconds]).toEqual([[7, 8], false, 0]);
    const one = JSON.parse(run(['--pr', '8']).stdout);
    expect(one.pr.number).toBe(8);
    expect(one.signature).toBe(signature(one.pr));
    expect(calls()).toBe(1);
  });

  it('exits 1 for a PR that is not open, and 2 for bad arguments', () => {
    expect(run(['--pr', '99']).status).toBe(1);
    expect(run(['--pr', 'abc']).status).toBe(2);
    expect(run(['--max-age', '0']).status).toBe(2);
    expect(run(['--nope']).status).toBe(2);
  });

  it('exits 1 with nothing to show when gh is down, and serves the old snapshot as stale afterwards', () => {
    expect(run([], { GH_FAIL: '1' }).status).toBe(1);
    expect(run().status).toBe(0);
    const stale = run(['--refresh'], { GH_FAIL: '1' });
    const out = JSON.parse(stale.stdout);
    expect([stale.status, out.isStale, out.error, out.prs.length]).toEqual([0, true, 'gh: down', 2]);
  });

  it('several readers at once cost one gh call', async () => {
    const children = Array.from({ length: 5 }, () => new Promise((res) => { const c = spawn(process.execPath, [SCRIPT], { env: { ...env, GH_SLEEP: '1' }, stdio: ['ignore', 'pipe', 'ignore'] }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', (code) => res({ code, out })); }));
    const results = await Promise.all(children);
    expect(results.map((r) => r.code)).toEqual([0, 0, 0, 0, 0]);
    expect(results.every((r) => JSON.parse(r.out).prs.length === 2)).toBe(true);
    expect(calls()).toBe(1);
  }, 60000);

  it('a refresher killed mid-fetch leaves a lock the next reader clears', async () => {
    const victim = spawn(process.execPath, [SCRIPT], { env: { ...env, GH_SLEEP: '30' }, stdio: 'ignore' });
    for (let i = 0; i < 100 && !existsSync(`${file}.lock`); i++) await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(`${file}.lock`)).toBe(true);
    victim.kill('SIGKILL');
    await new Promise((r) => victim.on('close', r));
    const r = run();
    expect([r.status, JSON.parse(r.stdout).prs.length]).toEqual([0, 2]);
    expect(existsSync(`${file}.lock`)).toBe(false);
  }, 60000);
});
