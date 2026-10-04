import { describe, it, expect } from 'vitest';
import { register } from '../../scripts/tools/mods/hitl-guards/hooks/register.ts';

// The mod's Bash hooks against a fake engine: a session in /w, `$.process.run` answered by `answer`, the load
// read from a list, `$.clock.sleep` counted instead of waited. `bash(command)` runs the Bash chain the way the
// engine does and returns what the last hook answers; `ran` is the commands the chain let through.
function engine({ loads = ['10 10 10 1/1 1\n'], answer = () => undefined } = {}) {
  const hooks = [];
  register((event, matcher, hook) => hooks.push({ event, matcher: hook ? matcher : undefined, hook: hook ?? matcher }));
  const ran = [], statuses = [], calls = [];
  let sleeps = 0, reads = 0;
  const $ = {
    session: { cwd: async () => '/w' },
    env: { get: async () => '/home/u' },
    ui: { status: (s) => statuses.push(s) },
    clock: { sleep: async () => { sleeps++; } },
    fs: {
      read: async (path) => {
        if (path === '/proc/loadavg') return loads[Math.min(reads++, loads.length - 1)];
        throw new Error('no such file');
      },
      stat: async () => { throw new Error('no such file'); },
      list: async () => { throw new Error('no such dir'); },
    },
    process: {
      run: async (argv) => {
        calls.push(argv.join(' '));
        const r = answer(argv) ?? { exitCode: 1, stdout: '', stderr: '' };
        return { exitCode: 0, stdout: '', stderr: '', ...r };
      },
    },
  };
  const bashHooks = hooks.filter((h) => h.event === 'tool.call' && h.matcher?.tool === 'Bash');
  const bash = (command, output = 'ok') => {
    const chain = (i, e) => (i === bashHooks.length ? Promise.resolve({ text: output, _command: e.command }) : bashHooks[i].hook($, e, Object.assign((x) => chain(i + 1, x ?? e), { signal: undefined })));
    return chain(0, { tool: 'Bash', command }).then((r) => { ran.push(r._command ?? null); return r; });
  };
  return { bash, ran, statuses, calls, get sleeps() { return sleeps; } };
}

const CREATED = 'https://github.com/me/repo/pull/77\n';
const view = (info) => (argv) => (argv[1] === 'pr' && argv[2] === 'view' ? { stdout: JSON.stringify(info) } : argv[1] === 'pr' && argv[2] === 'merge' ? { exitCode: 0 } : argv[0] === 'git' ? { stdout: '/w\n' } : undefined);

describe('holding a render for the load', () => {
  it('waits while the load is at 40 or more, then runs the render and says how long it held', async () => {
    const t = engine({ loads: ['45 40 30 1/1 1', '44 40 30 1/1 1', '12 30 30 1/1 1'] });
    const r = await t.bash('node blender/checks/golden.mjs');
    expect(t.sleeps).toBe(2);
    expect(r.text).toBe('ok');
    expect(r.context.join('\n')).toContain('held 30 s');
    expect(t.statuses.at(-1)).toBeUndefined();
  });

  it('refuses after ten minutes of a load that never drops', async () => {
    const t = engine({ loads: ['60 50 40 1/1 1'] });
    const r = await t.bash('npm run capture -- --only x');
    expect(r.deny).toMatch(/load is still 60 after 10 min/);
    expect(t.sleeps).toBe(40);
  });

  it('does not hold a command that only mentions a render, or any command below the limit', async () => {
    const heavy = engine({ loads: ['90 80 70 1/1 1'] });
    expect((await heavy.bash('grep -n capture scripts/capture.js')).text).toBe('ok');
    expect(heavy.sleeps).toBe(0);
    const calm = engine({ loads: ['3 3 3 1/1 1'] });
    expect((await calm.bash('node blender/checks/stage.mjs')).context).toBeUndefined();
    expect(calm.sleeps).toBe(0);
  });

  it('runs the render when the load cannot be read', async () => {
    // An empty list makes the fake's read of /proc/loadavg return nothing to parse.
    const t = engine({ loads: [] });
    expect((await t.bash('node blender/checks/stage.mjs')).text).toBe('ok');
    expect(t.sleeps).toBe(0);
  });
});

describe('auto-merge after gh pr create', () => {
  it('turns it on when the PR has none and is neither a draft nor held', async () => {
    const t = engine({ answer: view({ isDraft: false, autoMergeRequest: null, labels: [] }) });
    const r = await t.bash('gh pr create --title t --body b', CREATED);
    expect(t.calls).toContain('gh pr merge 77 --auto --merge');
    expect(r.context.join('\n')).toContain('auto-merge was off on #77; turned it on');
  });

  it('leaves a PR that has it, a draft, and one labelled awaiting-user or codex alone', async () => {
    for (const info of [{ isDraft: false, autoMergeRequest: { enabledAt: 'x' }, labels: [] }, { isDraft: true, autoMergeRequest: null, labels: [] }, { isDraft: false, autoMergeRequest: null, labels: [{ name: 'awaiting-user' }] }, { isDraft: false, autoMergeRequest: null, labels: [{ name: 'codex' }] }]) {
      const t = engine({ answer: view(info) });
      const r = await t.bash('gh pr create --title t --body b', CREATED);
      expect(t.calls.some((c) => c.includes('pr merge')), JSON.stringify(info)).toBe(false);
      expect(r.context).toBeUndefined();
    }
  });

  it('asks about nothing for --draft, for another command, or when the create printed no PR', async () => {
    for (const [command, output] of [['gh pr create --draft --title t', CREATED], ['gh pr view 77', CREATED], ['gh pr create --title t', 'error: nothing to compare']]) {
      const t = engine({ answer: view({ isDraft: false, autoMergeRequest: null, labels: [] }) });
      await t.bash(command, output);
      expect(t.calls.some((c) => c.includes('pr view 77') || c.includes('pr merge')), command).toBe(false);
    }
  });

  it('says so when turning it on fails, and does not break the create', async () => {
    const t = engine({ answer: (argv) => (argv[2] === 'merge' ? { exitCode: 1, stderr: 'not allowed' } : view({ isDraft: false, autoMergeRequest: null, labels: [] })(argv)) });
    const r = await t.bash('gh pr create --title t --body b', CREATED);
    expect(r.text).toBe(CREATED);
    expect(r.context.join('\n')).toContain('turning it on failed: not allowed');
  });
});

describe('local paths in gh pr text', () => {
  it('reach the command as repo-relative paths', async () => {
    const t = engine({ answer: (argv) => (argv.join(' ') === 'git rev-parse --show-toplevel' ? { stdout: '/home/u/src/gamedev-tools2\n' } : undefined) });
    const r = await t.bash('gh pr comment 5 --body "see /home/u/src/gamedev-tools2/docs/toolkit/x.md"');
    expect(r._command).toBe('gh pr comment 5 --body "see docs/toolkit/x.md"');
  });
});
