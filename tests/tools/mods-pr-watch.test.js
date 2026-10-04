import { describe, it, expect } from 'vitest';
import { register } from '../../scripts/tools/mods/pr-watch/hooks/register.ts';

// Runs the mod's hooks against a fake engine: state in memory, `$.process.run` answered by `answer`
// (argv, cwd) => { code, out, err }, every prompt the mod submits recorded.
function engine(answer) {
  const hooks = [];
  register((event, matcher, hook) => hooks.push({ event, matcher: hook ? matcher : undefined, hook: hook ?? matcher }));
  const state = new Map(), prompts = [], statuses = [], tools = [], timers = [], calls = [];
  const $ = {
    state: {
      get: async (ref) => ({ value: state.get(ref.key), version: 0 }),
      set: async (ref, value) => { state.set(ref.key, value); return { isSet: true, version: 1 }; },
    },
    tool: { register: async (t) => { tools.push(t.name); return { tool: `mcp__pr-watch__${t.name}` }; } },
    clock: { every: (ms, fn) => { timers.push({ ms, fn }); return { cancel() {} }; } },
    env: { get: async () => '/home/test' },
    fs: { read: async (path) => { calls.push(['read', path]); return 'step output 1\nstep output 2'; } },
    ui: { status: (s) => statuses.push(s) },
    prompt: { submit: async ({ text }) => { prompts.push(text); return {}; } },
    process: {
      run: async (argv, init = {}) => {
        calls.push([argv, init.cwd]);
        const r = (await answer(argv, init.cwd)) ??{ code: 1, out: '', err: 'unanswered' };
        return { exitCode: r.code, stdout: r.out, stderr: r.err };
      },
    },
  };
  const run = async (event, e, matcherTool) => {
    const h = hooks.find((x) => x.event === event && (matcherTool ? x.matcher?.tool === matcherTool : true));
    return h.hook($, e, async (x) => x ?? e);
  };
  return { $, state, prompts, statuses, tools, timers, calls, run };
}

const WATCH = 'mcp__pr-watch__watch_pr', UNWATCH = 'mcp__pr-watch__unwatch_pr';
const say = (s) => `[wait-for 00:00:00] ${s}`;
const waitFor = (args) => args[0] === 'timeout' && args.includes('scripts/wait-for.sh');
const waiting = (head, review = 'none') => ({ code: 124, out: `${say(`#9 at ${head}: waiting on: test, review ${review}, running: test`)}\n${say('timed out waiting on #9')}` });

function prView(extra = {}) {
  const pr = { state: 'OPEN', headRefName: 'tools/x', headRefOid: 'aaaa1111bbbb', ...extra };
  return (argv) => (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view' ? { code: 0, out: JSON.stringify(pr) } : argv[0] === 'git' ? { code: 0, out: 'tools/x\n' } : argv[0] === 'test' ? { code: 0, out: '' } : undefined);
}

describe('pr-watch session start', () => {
  it('registers the two tools and one timer, and shows nothing while nothing is watched', async () => {
    const t = engine(() => undefined);
    await t.run('session.start', { cwd: '/w' });
    expect(t.tools).toEqual(['watch_pr', 'unwatch_pr']);
    expect(t.timers).toHaveLength(1);
    expect(t.statuses.at(-1)).toBeUndefined();
  });
});

describe('watch_pr input', () => {
  it('refuses a number that is not a positive integer', async () => {
    const t = engine(() => undefined);
    for (const number of [0, -3, 1.5, 'abc', undefined]) {
      const r = await t.run('tool.call', { tool: WATCH, number }, WATCH);
      expect(r.deny, String(number)).toMatch(/positive integer/);
    }
    expect(t.state.get('watches')).toBeUndefined();
  });
  it('refuses a PR gh cannot read', async () => {
    const t = engine((argv) => (argv[0] === 'gh' ? { code: 1, out: '', err: 'Could not resolve to a PullRequest with the number of 99999.' } : undefined));
    const r = await t.run('tool.call', { tool: WATCH, number: 99999 }, WATCH);
    expect(r.deny).toMatch(/cannot read #99999: Could not resolve/);
    expect(t.state.get('watches')).toBeUndefined();
  });
  it('does not watch a PR that is already merged', async () => {
    const t = engine(prView({ state: 'MERGED' }));
    const r = await t.run('tool.call', { tool: WATCH, number: 9 }, WATCH);
    expect(r.result).toMatch(/already merged/);
    expect(t.state.get('watches')).toBeUndefined();
  });
  it('refuses a worktree without scripts/wait-for.sh', async () => {
    const t = engine((argv, cwd) => (argv[0] === 'test' ? { code: 1, out: '' } : prView()(argv, cwd)));
    const r = await t.run('tool.call', { tool: WATCH, number: 9, cwd: '/old' }, WATCH);
    expect(r.deny).toMatch(/\/old has no scripts\/wait-for\.sh; merge origin\/main/);
    expect(t.state.get('watches')).toBeUndefined();
  });
  it('watches without branch updates from a worktree on another branch, and says so', async () => {
    const t = engine((argv, cwd) => (argv[0] === 'git' ? { code: 0, out: 'other\n' } : waitFor(argv) ? waiting('aaaa1111') : prView()(argv, cwd)));
    const r = await t.run('tool.call', { tool: WATCH, number: 9, cwd: '/elsewhere' }, WATCH);
    expect(r.result).toMatch(/not tools\/x, so the watch will not merge main/);
    expect(t.state.get('watches')[0]).toMatchObject({ number: 9, cwd: '/elsewhere', update: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(t.calls.find(([a]) => Array.isArray(a) && waitFor(a))[0]).toContain('--no-update');
  });
});

describe('polling a watch', () => {
  // The wait-for answer is whatever `t.look` holds; `other` answers the gh calls around it.
  async function watching(other = () => undefined) {
    const cur = { look: waiting('aaaa1111') };
    const t = engine((argv, cwd) => (waitFor(argv) ? cur.look : other(argv, cwd) ?? prView()(argv, cwd)));
    await t.run('session.start', { cwd: '/w' });
    await t.run('tool.call', { tool: WATCH, number: 9 }, WATCH);
    await new Promise((r) => setTimeout(r, 0));
    t.cur = cur;
    return t;
  }
  const tick = async (t) => { await t.timers[0].fn(); };

  it('stays quiet while waiting, across a push', async () => {
    const t = await watching();
    await tick(t);
    t.cur.look = waiting('bbbb2222');
    await tick(t);
    expect(t.prompts).toEqual([]);
    expect(t.state.get('watches')[0].head).toBe('bbbb2222');
    expect(t.statuses.at(-1)).toMatch(/#9 waiting test/);
  });

  it('wakes once on a failed check with the log tail, and again only for a new failure', async () => {
    const comment = '### Local CI: FAIL\n\n| step | result | seconds |\n|---|---|---|\n| render-checks | FAIL | 1200 |\n| deps | pass | 1 |\n';
    const t = await watching((argv) => (argv.includes('comments') ? { code: 0, out: comment } : undefined));
    t.cur.look = { code: 2, out: say('#9 at aaaa1111: failing: local-ci=failure') };
    await tick(t);
    expect(t.prompts).toHaveLength(1);
    expect(t.prompts[0]).toContain('#9 at aaaa1111: failing local-ci=failure');
    expect(t.prompts[0]).toContain('render-checks: FAIL after 1200s (the step limit: a ci-rerun candidate)');
    expect(t.prompts[0]).toContain('step output 2');
    expect(t.calls.some(([a, path]) => a === 'read' && path.endsWith('/.cache/hitl-ci/failed/pr9-aaaa111/render-checks.log'))).toBe(true);
    await tick(t);
    expect(t.prompts).toHaveLength(1);
    t.cur.look = { code: 2, out: say('#9 at cccc3333: failing: local-ci=failure') };
    await tick(t);
    expect(t.prompts).toHaveLength(2);
  });

  it('reads a failing GitHub check from its job annotations and log', async () => {
    const t = await watching((argv) => {
      if (argv.includes('checks')) return { code: 0, out: JSON.stringify([{ name: 'test', link: 'https://github.com/o/r/actions/runs/1/job/77' }]) };
      if (argv[1] === 'api') return { code: 0, out: 'tests/a.test.js:5 expected 1 to be 2\n' };
      if (argv[1] === 'run') return { code: 0, out: 'FAIL tests/a.test.js\nAssertionError\n' };
    });
    t.cur.look = { code: 2, out: say('#9 at aaaa1111: failing: test=failure') };
    await tick(t);
    expect(t.prompts[0]).toContain('test annotations:\ntests/a.test.js:5 expected 1 to be 2');
    expect(t.prompts[0]).toContain('test log, last lines:\nFAIL tests/a.test.js');
  });

  it('wakes on a review verdict and on a conflict', async () => {
    const t = await watching();
    t.cur.look = waiting('aaaa1111', 'success');
    await tick(t);
    expect(t.prompts).toEqual(['pr-watch:\n#9 review verdict on aaaa1111: passed.']);
    t.cur.look = { code: 4, out: say('merging origin/main into tools/x conflicts; resolve it by hand') };
    await tick(t);
    expect(t.prompts[1]).toContain('conflicts');
  });

  it('wakes on a merge and drops the watch', async () => {
    const t = await watching();
    t.cur.look = { code: 0, out: say('#9 merged') };
    await tick(t);
    expect(t.prompts).toEqual(['pr-watch:\n#9 merged.']);
    expect(t.state.get('watches')).toEqual([]);
    expect(t.statuses.at(-1)).toBeUndefined();
    await tick(t);
    expect(t.prompts).toHaveLength(1);
  });

  it('wakes when the PR is closed without merging', async () => {
    const t = await watching();
    t.cur.look = { code: 6, out: say('#9 was closed without merging') };
    await tick(t);
    expect(t.prompts[0]).toContain('closed without merging');
    expect(t.state.get('watches')).toEqual([]);
  });

  it('keeps a watch through a gh outage and mentions it on the third failed look', async () => {
    const t = await watching();
    t.cur.look = { code: 124, out: '' };
    await tick(t); await tick(t);
    expect(t.prompts).toEqual([]);
    await tick(t);
    expect(t.prompts[0]).toMatch(/last 3 looks failed/);
    expect(t.state.get('watches')).toHaveLength(1);
  });

  // A look that is still running while the session adds, replaces or removes a watch.
  async function slowLook() {
    let release;
    const gate = new Promise((r) => { release = r; });
    const t = engine((argv, cwd) => (waitFor(argv) ? gate.then(() => waiting('aaaa1111')) : prView()(argv, cwd)));
    await t.run('session.start', { cwd: '/w' });
    await t.run('tool.call', { tool: WATCH, number: 9 }, WATCH);
    // watch_pr starts the first pass, which now waits on the gate.
    await new Promise((r) => setTimeout(r, 0));
    return { t, release };
  }
  const numbers = (t) => t.state.get('watches').map((w) => w.number);

  it('keeps a watch added while a look is running', async () => {
    const { t, release } = await slowLook();
    await t.run('tool.call', { tool: WATCH, number: 10 }, WATCH);
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(numbers(t).sort((a, b) => a - b)).toEqual([9, 10]);
  });

  it('keeps a watch removed while a look is running removed', async () => {
    const { t, release } = await slowLook();
    await t.run('tool.call', { tool: UNWATCH, number: 9 }, UNWATCH);
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(numbers(t)).toEqual([]);
  });

  it('keeps a watch replaced while a look is running as the session stored it', async () => {
    const { t, release } = await slowLook();
    await t.run('tool.call', { tool: WATCH, number: 9, cwd: '/other' }, WATCH);
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(t.state.get('watches')).toHaveLength(1);
    expect(t.state.get('watches')[0].cwd).toBe('/other');
  });

  it('unwatch_pr stops it', async () => {
    const t = await watching();
    expect((await t.run('tool.call', { tool: UNWATCH, number: 9 }, UNWATCH)).result).toBe('Stopped watching #9.');
    expect((await t.run('tool.call', { tool: UNWATCH, number: 9 }, UNWATCH)).result).toBe('#9 was not being watched.');
    expect((await t.run('tool.call', { tool: UNWATCH, number: 'x' }, UNWATCH)).deny).toMatch(/positive integer/);
  });
});
