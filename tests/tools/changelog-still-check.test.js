import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { judge, parseReply, prompt } from '../../scripts/tools/changelog-still-check.mjs';

const SCRIPT = resolve(__dirname, '../../scripts/tools/changelog-still-check.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'still-check-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const DAY = '2026-10-07';
const m = (n, caption) => ({ src: `media/${DAY}/${n}.webp`, kind: 'image', ...(caption ? { caption } : {}) });

describe('prompt and reply', () => {
  it('shows each item with its text and each still by full path', () => {
    const p = prompt([{ area: 'Interface', title: 'First person', body: 'Walk the office.', media: [m('a'), m('b')] }], '/site/changelog');
    expect(p).toContain('Item 1: Interface: First person\nWalk the office.\nStills:\n  1. /site/changelog/media/2026-10-07/a.webp\n  2. /site/changelog/media/2026-10-07/b.webp');
    expect(p).toMatch(/first write in "shows" what is actually in the picture, starting with the camera/);
    expect(p).toMatch(/needs an eye-level still, so an overhead one fails it/);
    expect(p).toMatch(/nearly the same as a still of the same item you already passed/);
    expect(p).toMatch(/contact sheet, a grid, a strip/);
  });
  it('reads the verdict from claude\'s JSON output or from plain text, and says when there is none', () => {
    const v = { items: [{ item: 1, stills: [] }] };
    expect(parseReply(JSON.stringify({ result: `Sure:\n${JSON.stringify(v)}`, total_cost_usd: 0.031 }))).toEqual({ verdict: v, cost: 0.031 });
    expect(parseReply(JSON.stringify(v))).toEqual({ verdict: v, cost: 0 });
    expect(parseReply(JSON.stringify({ result: 'I cannot see images.', total_cost_usd: 0.01 }))).toEqual({ verdict: null, cost: 0.01 });
    expect(parseReply('{"other": 1}').verdict).toBe(null);
  });
});

describe('judge', () => {
  it('keeps passing stills in order up to the cap with the model\'s caption, and gives reasons for the rest', () => {
    const items = [{ title: 'A', media: [m('a1', 'old'), m('a2'), m('a3'), m('a4'), m('a5')] }];
    const lines = judge(items, { items: [{ item: 1, stills: [
      { still: 1, pass: false, reason: 'a grid of four' },
      { still: 2, pass: true, caption: `A desk ${String.fromCharCode(8212)} up close` },
      { still: 3, pass: true, caption: 'The startup office' },
      { still: 4, pass: true, caption: 'Players at the table' },
      { still: 5, pass: true, caption: 'One too many' },
    ] }] }, 3);
    expect(items[0].media).toEqual([m('a2', 'A desk , up close'), m('a3'), m('a4', 'Players at the table')]);
    expect(lines).toEqual([
      `turned down: A: media/${DAY}/a1.webp: a grid of four`,
      `kept: A: media/${DAY}/a2.webp (A desk , up close)`,
      `kept: A: media/${DAY}/a3.webp ()`,
      `kept: A: media/${DAY}/a4.webp (Players at the table)`,
      `turned down: A: media/${DAY}/a5.webp: passes, but the item already has 3`,
    ]);
  });
  it('turns down a still the verdict leaves out, and trims an item the verdict leaves out', () => {
    const items = [{ title: 'A', media: [m('a1'), m('a2')] }, { title: 'B', media: [m('b1'), m('b2'), m('b3'), m('b4')] }];
    const lines = judge(items, { items: [{ item: 1, stills: [{ still: 2, pass: true, caption: 'x' }] }] }, 3);
    expect(items[0].media.map((x) => x.src)).toEqual([`media/${DAY}/a2.webp`]);
    expect(lines[0]).toBe(`turned down: A: media/${DAY}/a1.webp: not judged`);
    expect(items[1].media).toHaveLength(3);
    expect(lines.filter((l) => l.endsWith('[not checked]'))).toHaveLength(3);
  });
});

describe('command line', () => {
  let site;
  const stub = join(tmp, 'claude-stub.sh');
  writeFileSync(stub, `#!/usr/bin/env bash\necho "$*" >> "$STUB_LOG"\n[ -n "$STUB_FAIL" ] && exit 3\nprintf '%s' "$STUB_REPLY"\n`);
  chmodSync(stub, 0o755);
  const run = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, CL_CLAUDE: stub, STUB_LOG: join(tmp, 'log'), ...env } });
  const day = () => JSON.parse(readFileSync(join(site, 'changelog/entries.json'), 'utf8')).find((e) => e.date === DAY);
  beforeEach(() => {
    site = mkdtempSync(join(tmp, 'site-'));
    mkdirSync(join(site, 'changelog/media', DAY), { recursive: true });
    for (const n of ['k1', 'a1', 'a2', 'b1']) writeFileSync(join(site, 'changelog/media', DAY, `${n}.webp`), n);
    writeFileSync(join(site, 'changelog/entries.json'), JSON.stringify([{ date: DAY, headline: 'H', items: [
      { area: 'Art', title: 'Kept', body: 'Curated.', media: [m('k1', 'by hand')] },
      { area: 'Office', title: 'A', body: 'Cooler.', refs: ['#1'], media: [m('a1'), m('a2')] },
      { area: 'Interface', title: 'B', body: 'First person.', refs: ['#2'], media: [m('b1')] },
    ] }]));
    writeFileSync(join(site, 'keep.json'), JSON.stringify({ items: [{ title: 'Kept' }] }));
    rmSync(join(tmp, 'log'), { force: true });
  });

  it('applies the verdict, never touches a kept item, lists an item left bare, and clears turned-down files', () => {
    const reply = JSON.stringify({ result: JSON.stringify({ items: [
      { item: 1, stills: [{ still: 1, pass: true, caption: 'The cooler' }, { still: 2, pass: false, reason: 'a strip' }] },
      { item: 2, stills: [{ still: 1, pass: false, reason: 'an overhead view, not first person' }] },
    ] }), total_cost_usd: 0.04 });
    const r = run([site, DAY, '--keep', join(site, 'keep.json'), '--budget', '0.5'], { STUB_REPLY: reply });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').filter(Boolean)).toEqual([
      'check: looked at 3 still(s) for 2 item(s), $0.04',
      `kept: A: media/${DAY}/a1.webp (The cooler)`,
      `turned down: A: media/${DAY}/a2.webp: a strip`,
      `turned down: B: media/${DAY}/b1.webp: an overhead view, not first person`,
      'wanted: Interface: B (#2)',
    ]);
    expect(day().items.map((i) => [i.title, i.media])).toEqual([['Kept', [m('k1', 'by hand')]], ['A', [m('a1', 'The cooler')]], ['B', undefined]]);
    expect(readdirSync(join(site, 'changelog/media', DAY)).sort()).toEqual(['a1.webp', 'k1.webp']);
    const call = readFileSync(join(tmp, 'log'), 'utf8');
    expect(call).toMatch(/--model sonnet --tools Read --permission-mode dontAsk --strict-mcp-config --add-dir \S+\/changelog\/media\/2026-10-07 --no-session-persistence --max-budget-usd 0.5 --output-format json/);
    expect(call).not.toContain('k1.webp');
  });

  it('lets the rules\' picks stand, trimmed, when the run fails, the reply is no verdict, the budget is spent or --trim-only', () => {
    for (const [args, env, says] of [
      [[], { STUB_FAIL: '1' }, /^check: not run, the run failed \(exit 3\)/],
      [[], { STUB_REPLY: JSON.stringify({ result: 'no', total_cost_usd: 0.01 }) }, /^check: the reply was not a verdict \(\$0\.01\)/],
      [['--budget', '0.01'], {}, /^check: not run, \$0\.01 of the budget left/],
      [['--trim-only'], {}, /^check: not run \(--trim-only\)/],
    ]) {
      const r = run([site, DAY, '--cap', '1', ...args], env);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(says);
      expect(day().items.map((i) => (i.media ?? []).length)).toEqual([1, 1, 1]);
    }
    expect(existsSync(join(site, 'changelog/media', DAY, 'a2.webp'))).toBe(false);
  });

  it('refuses bad usage and a missing day', () => {
    expect(run([]).status).toBe(2);
    expect(run([site, 'today']).status).toBe(2);
    expect(run([site, DAY, '--cap', '0']).status).toBe(2);
    expect(run([site, DAY, '--budget', '-1']).status).toBe(2);
    expect(run([site, '2026-01-01', '--trim-only']).status).toBe(1);
  });
});
