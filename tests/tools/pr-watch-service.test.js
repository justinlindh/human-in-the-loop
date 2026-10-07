import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { authorLane, failingChecks, findTeam } from '../../scripts/tools/pr-watch-service.mjs';

const SERVICE = resolve(__dirname, '../../scripts/tools/pr-watch-service.mjs');
const MEMBERS = ['team-lead', 'reviewer', 'reviewer2', 'tools', 'tools2', 'integrator', 'sim', 'art', 'ui'];

const run_ = (name, c) => ({ __typename: 'CheckRun', name, status: c === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED', conclusion: c === 'PENDING' ? '' : c });
// `smoke` carries the state given; `commits` always passes.
const pr = (number, branch, over = {}, smoke = 'SUCCESS', review = null) => ({
  number, title: `t${number}`, state: 'OPEN', baseRefName: 'main', isDraft: false, isCrossRepository: false, labels: [], mergeable: 'MERGEABLE',
  headRefOid: `${number}`.padEnd(40, 'a'), headRefName: branch, author: { login: 'justinlindh' },
  statusCheckRollup: [run_('commits', 'SUCCESS'), run_('smoke', smoke), ...(review ? [{ __typename: 'StatusContext', context: 'review', state: review }] : [])],
  ...over,
});

// A fake gh on PATH that answers from world.json: { prs, closed: { n: {state, mergeCommit} }, verdict }.
function setup() {
  const dir = mkdtempSync(join(toolTmp(), 'pr-watch-test-'));
  const fake = join(dir, 'fake-gh.mjs');
  writeFileSync(fake, `import { readFileSync } from 'node:fs';
const w = JSON.parse(readFileSync(${JSON.stringify(join(dir, 'world.json'))}, 'utf8'));
const a = process.argv.slice(2), s = a.join(' ');
if (a[0] === 'pr' && a[1] === 'list') console.log(JSON.stringify(w.prs));
else if (a[0] === 'pr' && a[1] === 'view') { const c = w.prs.find((p) => String(p.number) === a[2]) ?? (w.closed ?? {})[a[2]]; if (!c) process.exit(1); console.log(JSON.stringify(c)); }
else if (s.includes('/protection')) console.log(JSON.stringify({ required_status_checks: { contexts: ['commits', 'smoke', 'review'] } }));
// wait-for's verdict query prints "changes <sha> <login> <url>"; the service's prints "<sha> <login> <url>".
else if (s.includes('/reviews') && s.includes('then "changes"')) console.log(w.verdict ? 'changes ' + w.verdict : '');
else if (s.includes('/reviews') && s.includes('user.login')) console.log(w.verdict ?? '');
else if (s.includes('/comments')) console.log('[]');
else console.log('');
`);
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\nexec node ${fake} "$@"\n`);
  chmodSync(join(dir, 'gh'), 0o755);
  const team = join(dir, 'teams', 'session-x');
  mkdirSync(join(team, 'inboxes'), { recursive: true });
  writeFileSync(join(team, 'config.json'), JSON.stringify({ createdAt: 1, members: MEMBERS.map((name) => ({ name })) }));
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, HITL_TEAMS_DIR: join(dir, 'teams'), HITL_PR_WATCH_STATE: join(dir, 'state.json'),
    HITL_PR_WATCH_LOG: join(dir, 'watch.log'), HITL_PR_SNAPSHOT: join(dir, 'snap.json') };
  const world = (w) => writeFileSync(join(dir, 'world.json'), JSON.stringify(w));
  const once = (...args) => spawnSync(process.execPath, [SERVICE, '--once', ...args], { env, encoding: 'utf8', timeout: 60000 });
  const inbox = (name) => { try { return JSON.parse(readFileSync(join(team, 'inboxes', `${name}.json`), 'utf8')); } catch { return []; } };
  // What a lane's harness does on delivery: empties the inbox.
  const drain = () => { for (const n of MEMBERS) if (existsSync(join(team, 'inboxes', `${n}.json`))) writeFileSync(join(team, 'inboxes', `${n}.json`), '[]'); };
  const told = () => Object.fromEntries(MEMBERS.map((n) => [n, inbox(n).map((m) => m.text)]).filter(([, t]) => t.length));
  const empty = () => writeFileSync(join(dir, 'state.json'), JSON.stringify({ sent: {}, open: {}, assigned: {}, next: 0, pending: [] }));
  return { dir, team, world, once, inbox, drain, told, empty, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const PRS = [
  pr(1, 'tools/a'), pr(2, 'ui/b'),
  pr(3, 'integ/c', {}, 'FAILURE'), pr(4, 'sim/d', {}, 'SUCCESS', 'FAILURE'), pr(5, 'art/e', { mergeable: 'CONFLICTING' }, 'PENDING'),
  pr(6, 'ui/f', { isDraft: true }, 'FAILURE'), pr(7, 'ui/g', { labels: [{ name: 'awaiting-user' }] }, 'FAILURE'),
  pr(8, 'lead/h', {}, 'PENDING'), pr(9, 'sim/i', {}, 'SUCCESS', 'SUCCESS'),
];

describe('pr-watch-service', () => {
  it('tells each lane only what it must act on, once per PR, head and event', () => {
    const t = setup();
    try {
      t.empty();
      t.world({ prs: PRS, verdict: 'abc reviewer2 https://example/review/1' });
      expect(t.once().status).toBe(0);
      const told = t.told();
      expect(Object.keys(told).sort()).toEqual(['art', 'integrator', 'reviewer', 'reviewer2', 'sim']);
      expect(told.reviewer).toEqual([expect.stringMatching(/^PR #1 \(tools\/a\) at 1aaaaaaa is ready for review: t1\. It is assigned to you/)]);
      expect(told.reviewer2).toEqual([expect.stringMatching(/^PR #2 \(ui\/b\) at 2aaaaaaa is ready for review/)]);
      expect(told.integrator).toEqual([expect.stringMatching(/^PR #3 \(integ\/c\) at 3aaaaaaa: required check failed: smoke=failure\./)]);
      expect(told.sim).toEqual([expect.stringMatching(/^PR #4 \(sim\/d\) at 4aaaaaaa: changes requested by reviewer2: https:\/\/example\/review\/1\./)]);
      expect(told.art).toEqual([expect.stringMatching(/^PR #5 \(art\/e\) at 5aaaaaaa conflicts with main\. Merge origin\/main into art\/e/)]);
      // The entry is the one SendMessage writes.
      expect(Object.keys(t.inbox('art')[0]).sort()).toEqual(['from', 'msgV', 'msg_id', 'read', 'summary', 'text', 'timestamp', 'type']);
      expect(t.inbox('art')[0]).toMatchObject({ from: 'pr-watch', msgV: 1, type: 'message', read: false });

      // The same state again tells nobody.
      t.drain();
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({});

      // A new head on #1 goes back to its reviewer, not the other one; #3 merging tells integrator once.
      t.world({ prs: [pr(1, 'tools/a', { headRefOid: '1'.padEnd(40, 'b') }), ...PRS.slice(1).filter((p) => p.number !== 3)], closed: { 3: { state: 'MERGED', mergeCommit: { oid: 'feedface12345678' } } } });
      expect(t.once().status).toBe(0);
      const later = t.told();
      expect(later.reviewer).toEqual([expect.stringMatching(/^PR #1 \(tools\/a\) at 1bbbbbbb is ready/)]);
      expect(later.reviewer2).toBeUndefined();
      expect(later.integrator).toEqual(['PR #3 (integ/c) merged at feedface. Message the teammates its Affects section names who must act now; nothing else to watch.']);
      t.drain();
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({});
      expect(readFileSync(join(t.dir, 'watch.log'), 'utf8')).toMatch(/merged 3:merged -> integrator sent /);
      // A merged PR, once told, leaves no record behind.
      expect(Object.keys(JSON.parse(readFileSync(join(t.dir, 'state.json'), 'utf8')).sent).filter((k) => k.startsWith('3'))).toEqual([]);
    } finally { t.done(); }
  }, 120000);

  it('hands a Dependabot PR to one reviewer with the --allow-bot path, and its failures and conflicts to that reviewer', () => {
    const t = setup();
    try {
      t.empty();
      const bot = { author: { login: 'app/dependabot' } };
      t.world({ prs: [pr(30, 'dependabot/npm_and_yarn/vite-7.1.0', bot, 'PENDING'), pr(31, 'dependabot/github_actions/x', bot, 'FAILURE')] });
      expect(t.once().status).toBe(0);
      const told = t.told();
      expect(Object.keys(told)).toEqual(['reviewer', 'reviewer2']);
      expect(told.reviewer).toEqual([expect.stringMatching(/^PR #30 .* is ready for review: t30\. .*Dependabot: read the diff \(gh pr diff 30\) and the changelogs first, with no install; on a pass, take the --allow-bot path: scripts\/ci-pr\.sh 30 --allow-bot --head 30a{38}, then gh pr merge 30 --auto --merge\.$/)]);
      expect(told.reviewer2).toEqual([
        expect.stringMatching(/^PR #31 .*a Dependabot PR assigned to you\): required check failed: smoke=failure\. Read the failing job \(no install\)/),
        expect.stringMatching(/^PR #31 .*ci-pr\.sh 31 --allow-bot/),
      ]);
      t.drain();
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({});
      // After its pass, #30's check fails and it conflicts: its reviewer hears both, the other reviewer and team-lead nothing.
      t.world({ prs: [pr(30, 'dependabot/npm_and_yarn/vite-7.1.0', { ...bot, mergeable: 'CONFLICTING' }, 'FAILURE', 'SUCCESS'), pr(31, 'dependabot/github_actions/x', bot, 'FAILURE')] });
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({ reviewer: [
        expect.stringMatching(/^PR #30 .*conflicts with main\. Comment "@dependabot rebase"/),
        expect.stringMatching(/^PR #30 .*required check failed: smoke/),
      ] });
    } finally { t.done(); }
  }, 120000);

  it('hands ready PRs to the reviewers the team has now', () => {
    const t = setup();
    const members = (names) => writeFileSync(join(t.team, 'config.json'), JSON.stringify({ createdAt: 1, members: names.map((name) => ({ name })) }));
    try {
      t.empty();
      // One reviewer: both ready PRs go to it.
      members(MEMBERS.filter((n) => n !== 'reviewer2'));
      t.world({ prs: [pr(1, 'tools/a'), pr(2, 'ui/b')] });
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({ reviewer: [expect.stringMatching(/^PR #1 /), expect.stringMatching(/^PR #2 /)] });
      t.drain();
      // That reviewer leaves and reviewer2 joins: both waiting PRs move to reviewer2 and are told again.
      members(MEMBERS.filter((n) => n !== 'reviewer'));
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({ reviewer2: [expect.stringMatching(/^PR #1 \(tools\/a\) at 1aaaaaaa is ready/), expect.stringMatching(/^PR #2 /)] });
      t.drain();
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({});
      // No reviewer at all: team-lead hears it.
      members(MEMBERS.filter((n) => !n.startsWith('reviewer')));
      t.world({ prs: [pr(1, 'tools/a', { headRefOid: '1'.padEnd(40, 'd') })] });
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({ 'team-lead': [expect.stringMatching(/^PR #1 \(tools\/a\) at 1ddddddd is ready/)] });
    } finally { t.done(); }
  }, 120000);

  it('its first pass records the author events already true without sending them, and still hands out ready PRs', () => {
    const t = setup();
    try {
      t.world({ prs: PRS });
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({ reviewer: [expect.stringMatching(/^PR #1 /)], reviewer2: [expect.stringMatching(/^PR #2 /)] });
      expect(readFileSync(join(t.dir, 'watch.log'), 'utf8')).toMatch(/first pass: recorded 3 author event\(s\) already true without sending them/);
      t.drain();
      t.world({ prs: [...PRS, pr(10, 'art/j', {}, 'FAILURE')] });
      expect(t.once().status).toBe(0);
      expect(t.told()).toEqual({ art: [expect.stringMatching(/^PR #10 \(art\/j\) at 10aaaaaa: required check failed/)] });
    } finally { t.done(); }
  }, 120000);

  it('--dry-run prints who would be told what and writes no inbox and no state', () => {
    const t = setup();
    try {
      t.world({ prs: [pr(1, 'tools/a'), pr(3, 'integ/c', {}, 'FAILURE')] });
      const r = t.once('--dry-run');
      expect(r.status).toBe(0);
      expect(r.stdout.split('\n').filter(Boolean)).toEqual([
        expect.stringMatching(/^would tell reviewer: PR #1 /), expect.stringMatching(/^would tell integrator: PR #3 .*smoke=failure/)]);
      expect(t.told()).toEqual({});
      expect(existsSync(join(t.dir, 'state.json'))).toBe(false);
    } finally { t.done(); }
  }, 120000);

  // wait-for.sh on the same PRs, once each (--timeout 0), in a scratch repo with no remote so it reads
  // nothing but the fake gh. Its exit and the service's event agree on every PR the service watches;
  // drafts and awaiting-user PRs are the lead's watcher's, so the service says nothing there.
  it('agrees with wait-for on the same PRs', () => {
    const t = setup();
    const repo = join(t.dir, 'repo');
    mkdirSync(repo);
    spawnSync('git', ['init', '-q', repo]);
    try {
      t.empty();
      const closed = { 20: { number: 20, state: 'MERGED', mergeCommit: { oid: 'beef'.padEnd(40, '0') }, headRefOid: '20'.padEnd(40, 'a'), headRefName: 'art/k', statusCheckRollup: [] },
        21: { number: 21, state: 'CLOSED', mergeCommit: null, headRefOid: '21'.padEnd(40, 'a'), headRefName: 'ui/l', statusCheckRollup: [] } };
      // The service sees 20 and 21 open first, then gone.
      t.world({ prs: [...PRS, pr(20, 'art/k', {}, 'PENDING'), pr(21, 'ui/l', {}, 'PENDING')], verdict: 'abc reviewer2 https://example/review/1' });
      expect(t.once().status).toBe(0);
      t.world({ prs: PRS, closed, verdict: 'abc reviewer2 https://example/review/1' });
      expect(t.once().status).toBe(0);
      const events = {};
      for (const m of MEMBERS.flatMap((n) => t.inbox(n))) events[m.summary.match(/#(\d+)/)[1]] = m.summary.split(' ').pop();
      const waitFor = (n) => spawnSync('bash', [resolve(__dirname, '../../scripts/wait-for.sh'), String(n), '--no-update', '--timeout', '0', '--poll', '1'],
        { cwd: repo, encoding: 'utf8', timeout: 60000, env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))), PATH: `${t.dir}:${process.env.PATH}`, HITL_WAIT_SNAPSHOT: '0' } }).status;
      const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21].map((n) => [n, waitFor(n), events[n] ?? 'none']);
      expect(rows).toEqual([
        [1, 0, 'ready'], [2, 0, 'ready'], [3, 2, 'failed'], [4, 2, 'changes'], [5, 3, 'conflict'],
        [6, 2, 'none'], [7, 2, 'none'], [8, 124, 'none'], [9, 0, 'none'], [20, 0, 'merged'], [21, 6, 'closed'],
      ]);
    } finally { t.done(); }
  }, 300000);

  it('exits 2 on bad options and when no team lists the reviewers', () => {
    const t = setup();
    try {
      expect(t.once('--interval', '5').status).toBe(2);
      expect(t.once('--nope').status).toBe(2);
      rmSync(join(t.team, 'config.json'));
      const r = t.once();
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/no team in .* lists team-lead/);
    } finally { t.done(); }
  }, 120000);
});

describe('pr-watch-service parts', () => {
  it('finds the newest team that lists team-lead, whatever its directory is called, with its reviewers', () => {
    const dir = mkdtempSync(join(toolTmp(), 'pr-watch-teams-'));
    try {
      const mk = (name, createdAt, members) => { mkdirSync(join(dir, name)); writeFileSync(join(dir, name, 'config.json'), JSON.stringify({ createdAt, members: members.map((n) => ({ name: n })) })); };
      mk('session-old', 1, MEMBERS); mk('session-new', 5, ['team-lead', 'reviewer2', 'sim', 'reviewer']); mk('other-project', 9, ['lead', 'worker']);
      expect(findTeam(dir)).toMatchObject({ dir: join(dir, 'session-new'), reviewers: ['reviewer', 'reviewer2'] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('names the author lane from the branch, and a tools/ branch from the worktree that has it', () => {
    const wts = new Map([['tools/x', '/src/gamedev-tools2'], ['tools/y', '/src/gamedev-tools'], ['tools/z', '/src/gamedev-tools2-scratch']]);
    expect(authorLane('tools/x', MEMBERS, wts)).toBe('tools2');
    expect(authorLane('tools/z', MEMBERS, wts)).toBe('tools2');
    expect(authorLane('tools/y', MEMBERS, wts)).toBe('tools');
    expect(authorLane('tools/nowhere', MEMBERS, wts)).toBe('tools');
    expect(authorLane('integ/a', MEMBERS)).toBe('integrator');
    expect(authorLane('lead/a', MEMBERS)).toBe('team-lead');
    expect(authorLane('sim/a', MEMBERS)).toBe('sim');
    expect(authorLane('codex/a', MEMBERS)).toBe('team-lead');
    expect(authorLane('dependabot/npm/x', MEMBERS)).toBe(null);
  });

  it('reports a failed required check only once nothing on the head is running', () => {
    const p = (...runs) => ({ statusCheckRollup: runs.map(([n, c]) => run_(n, c)) });
    expect(failingChecks(p(['commits', 'SUCCESS'], ['smoke', 'FAILURE']), ['commits', 'smoke'])).toEqual(['smoke=failure']);
    expect(failingChecks(p(['commits', 'PENDING'], ['smoke', 'FAILURE']), ['commits', 'smoke'])).toEqual([]);
    expect(failingChecks(p(['commits', 'SUCCESS'], ['balance', 'FAILURE']), ['commits', 'smoke'])).toEqual([]);
  });
});
