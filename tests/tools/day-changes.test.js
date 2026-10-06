import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { build, buildEffectsIndex, classify, effectsFor, dayOf, entriesFromDiff, extractMedia, parseEntry, parseRange, parseTitle, trimBody } from '../../scripts/tools/day-changes.mjs';

const SCRIPT = resolve(__dirname, '../../scripts/tools/day-changes.mjs');
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('days', () => {
  it('parses a day, a range and since-first, and refuses bad input', () => {
    expect(parseRange('2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-05' });
    expect(parseRange('2026-10-01..2026-10-05')).toEqual({ from: '2026-10-01', to: '2026-10-05' });
    expect(parseRange(null, { sinceFirst: true, today: '2026-10-09' })).toEqual({ from: '2026-09-23', to: '2026-10-09' });
    expect(() => parseRange('2026-13-01')).toThrow(/not a day/);
    expect(() => parseRange('2026-02-30')).toThrow(/not a day/);
    expect(() => parseRange('yesterday')).toThrow(/not a day/);
    expect(() => parseRange('2026-10-05..2026-10-01')).toThrow(/backwards/);
  });

  it('puts a merge time on the day of the zone asked for', () => {
    expect(dayOf('2026-10-06T01:48:35Z', 'America/Los_Angeles')).toBe('2026-10-05');
    expect(dayOf('2026-10-06T01:48:35Z', 'UTC')).toBe('2026-10-06');
  });
});

describe('classify', () => {
  it('keeps feat and fix in the player scopes, and any PR that touched docs/features', () => {
    expect(parseTitle('feat(art)!: x y')).toEqual({ type: 'feat', scope: 'art', breaking: true });
    expect(parseTitle('wip stuff')).toBeNull();
    for (const s of ['art', 'ui', 'sim', 'audio', 'pacing']) expect(classify({ title: `fix(${s}): a b` })).toEqual({ visible: true, reason: `fix(${s})` });
    expect(classify({ title: 'docs(docs): a b', touchesFeatures: true })).toEqual({ visible: true, reason: 'docs/features' });
  });

  it('skips tooling, CI, tests, perf and untitled PRs, saying why', () => {
    expect(classify({ title: 'fix(tools): a b' })).toEqual({ visible: false, reason: 'scope tools' });
    expect(classify({ title: 'fix(capture): a b' })).toEqual({ visible: false, reason: 'scope capture' });
    expect(classify({ title: 'fix(capture): a b', touchesFeatures: true })).toEqual({ visible: true, reason: 'docs/features' });
    expect(classify({ title: 'feat(integ): a b' })).toEqual({ visible: false, reason: 'scope integ' });
    expect(classify({ title: 'perf(art): a b' })).toEqual({ visible: false, reason: 'type perf' });
    expect(classify({ title: 'test(sim): a b' })).toEqual({ visible: false, reason: 'type test' });
    expect(classify({ title: 'feat: a b' })).toEqual({ visible: false, reason: 'no scope' });
    expect(classify({ title: 'Update thing' }).reason).toMatch(/Conventional/);
    expect(classify({ title: 'feat(tools): a b' }, { scopes: ['tools'] }).visible).toBe(true);
  });
});

describe('body and media', () => {
  const body = `Author: art

## What
The hammer goes through the screen.
It shatters on either answer.

## Checklist
- [x] Tests added

- **Gates run:** sweep clean.

## Changes to how the game plays
None.

Affects: ui

Fixes #12
<!-- hidden -->
![shot](https://example.com/a.png) and https://example.com/b.mp4`;

  it('drops the template boilerplate and keeps what the PR says', () => {
    const t = trimBody(body);
    expect(t).toContain('The hammer goes through the screen.');
    expect(t).not.toMatch(/Author:|Checklist|Gates run|Affects|Fixes #|hidden|Changes to how/);
  });

  it('drops commit trailers', () => {
    expect(trimBody('A clock.\n\nCo-Authored-By: Someone <a@b.c>\nClaude-Session: https://x.test/s\nhttps://claude.ai/code/session_1')).toBe('A clock.');
  });

  it('cuts a long body at a line end', () => {
    const long = `${'A line of text about the change.\n'.repeat(40)}`;
    const t = trimBody(long, 100);
    expect(t.length).toBeLessThanOrEqual(110);
    expect(t.endsWith('...')).toBe(true);
  });

  it('finds the stills and clips in a body once each', () => {
    expect(extractMedia(body)).toEqual([
      { label: 'shot', url: 'https://example.com/a.png', kind: 'still' },
      { label: '', url: 'https://example.com/b.mp4', kind: 'clip' },
    ]);
    expect(extractMedia('see https://example.com/page')).toEqual([]);
  });
});

describe('docs/features entries', () => {
  it('reads ids, media links and the media note of a bullet', () => {
    const e = parseEntry('- ★ **The Box**: a cube. `id: the_box` Media: [clip](https://x.test/a.mp4?raw=true) ([preview](https://x.test/a.gif?raw=true)); item `m`.', 'docs/features/nods.md');
    expect(e.title).toBe('The Box');
    expect(e.ids).toEqual(['the_box']);
    expect(e.media.map((m) => [m.label, m.kind])).toEqual([['clip', 'clip'], ['preview', 'preview']]);
    expect(parseEntry('- **Tabs**: a joke. `id: tabs` media: none (text only)', 'f').mediaNote).toBe('media: none (text only)');
  });
});

describe('docs/effects', () => {
  const docs = {
    'README.md': '# Effects\n',
    'decisions.md': '# Decisions\n\n## The Box `the_box`\n\nrival · weight 2\n\n| Choice | Effects |\n|---|---|\n| Build your own | cash -$500 |\n\n## Other `other`\n\ntext\n',
    'office.md': '# Items\n\n| Item | Kind | Effects |\n|---|---|---|\n| Disk Duplicator | shop | L1 $3,000: duplication cost relief +10% |\n| Potted Plant | furniture | L1 $150 |\n',
  };
  const index = buildEffectsIndex({ docs, names: new Map([['disk_duplicator', 'Disk Duplicator']]) });

  it('finds a decision by its id and an item row by the name behind its id', () => {
    const d = effectsFor(['the_box'], index);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ id: 'the_box', kind: 'decision', name: 'The Box', file: 'docs/effects/decisions.md' });
    expect(d[0].text).toContain('Build your own');
    expect(d[0].text).not.toContain('Other');
    const r = effectsFor(['disk_duplicator'], index);
    expect(r).toEqual([expect.objectContaining({ id: 'disk_duplicator', kind: 'row', name: 'Disk Duplicator', columns: { Item: 'Disk Duplicator', Kind: 'shop', Effects: 'L1 $3,000: duplication cost relief +10%' } })]);
  });

  it('is empty for an id with no effects entry, and without an index', () => {
    expect(effectsFor(['banner_company'], index)).toEqual([]);
    expect(effectsFor(['the_box'], null)).toEqual([]);
  });

  it('puts the effects on each feature entry of a day', () => {
    const feat = '- **Duplicator**: a machine. `id: disk_duplicator` media: none (x)\n- **Banner**: blue. `id: banner_company` media: none (x)\n';
    const entries = entriesFromDiff(`+++ b/docs/features/office.md\n${feat.split('\n').filter(Boolean).map((l) => `+${l}`).join('\n')}\n`);
    expect(entries.map((e) => effectsFor(e.ids, index).length)).toEqual([1, 0]);
  });
});

describe('a merged PR against a real repository', () => {
  const dir = mkdtempSync(join(toolTmp(), 'day-changes-test-'));
  const g = (...a) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  const gitOut = (a) => { const r = g(...a); return r.status === 0 ? r.stdout : null; };
  const oids = {};

  beforeAll(() => {
    g('init', '-q', '-b', 'main');
    mkdirSync(join(dir, 'docs/features'), { recursive: true });
    writeFileSync(join(dir, 'docs/features/nods.md'), '# Nods\n\n- **Stapler**: red. `id: stapler` media: pending (#1)\n- **Banner**: blue. `id: banner` media: none (text)\n');
    g('add', '-A'); g('commit', '-qm', 'base');
    const merge = (branch, edit, name) => {
      g('checkout', '-q', '-b', branch);
      edit();
      g('add', '-A'); g('commit', '-qm', branch);
      g('checkout', '-q', 'main');
      g('merge', '--no-ff', '-qm', `Merge ${branch}`, branch);
      oids[name] = g('rev-parse', 'HEAD').stdout.trim();
    };
    merge('art/features', () => writeFileSync(join(dir, 'docs/features/nods.md'),
      '# Nods\n\n- **Stapler**: red and shiny. `id: stapler` Media: [still](https://x.test/s.webp?raw=true)\n- **Box**: a cube. `id: box` media: none (text)\n'), 'features');
    merge('tools/plain', () => writeFileSync(join(dir, 'README.md'), 'x\n'), 'plain');
    // Two commits made straight on main (the early history was merged by hand), one player-facing.
    mkdirSync(join(dir, 'src/ui'), { recursive: true });
    writeFileSync(join(dir, 'src/ui/hud.js'), 'x\n');
    g('add', '-A'); g('commit', '-qm', 'Add the HUD\n\nA clock and a cash counter.', '--date=2026-10-05T12:00:00-07:00');
    writeFileSync(join(dir, 'notes.txt'), 'x\n');
    g('add', '-A'); g('commit', '-qm', 'Notes', '--date=2026-10-05T13:00:00-07:00');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reports added, changed and removed entries of the merge, with media', () => {
    const diff = gitOut(['diff', '--no-color', '-U0', `${oids.features}^1`, oids.features, '--', 'docs/features']);
    const e = entriesFromDiff(diff);
    expect(e.map((x) => [x.status, x.title])).toEqual([['changed', 'Stapler'], ['added', 'Box'], ['removed', 'Banner']]);
    expect(e[0].media).toEqual([{ label: 'still', url: 'https://x.test/s.webp?raw=true', kind: 'still' }]);
    expect(e[0].ids).toEqual(['stapler']);
  });

  it('builds a day: visible PRs with their entries, the rest skipped with a reason, days by zone', () => {
    const prs = [
      { number: 1, title: 'feat(ui): shiny stapler', body: '## What\nA shinier stapler.\n\nAuthor: x', mergedAt: '2026-10-06T01:00:00Z', mergeCommit: { oid: oids.features }, url: 'u1', author: { login: 'a' } },
      { number: 2, title: 'fix(tools): readme', body: '', mergedAt: '2026-10-06T02:00:00Z', mergeCommit: { oid: oids.plain }, url: 'u2', author: { login: 'b' } },
      { number: 3, title: 'fix(art): gone commit', body: '', mergedAt: '2026-10-06T03:00:00Z', mergeCommit: { oid: '0'.repeat(40) }, url: 'u3', author: { login: 'c' } },
    ];
    const gh = () => JSON.stringify(prs);
    const out = build({ from: '2026-10-05', to: '2026-10-06' }, { tz: 'America/Los_Angeles', gh, git: gitOut, ref: 'main' });
    expect(out.days.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-06']);
    const d5 = out.days[0];
    expect(d5.prs.map((p) => p.number)).toEqual([1, 3]);
    expect(d5.prs[0]).toMatchObject({ reason: 'feat(ui)', body: 'A shinier stapler.', author: 'a' });
    expect(d5.prs[0].features).toHaveLength(3);
    expect(d5.prs[0].features.map((f) => f.effects)).toEqual([[], [], []]);
    const fx = build({ from: '2026-10-05', to: '2026-10-05' }, { tz: 'America/Los_Angeles', gh, git: gitOut, ref: 'main', effects: buildEffectsIndex({ docs: { 'office.md': '| Item | Effects |\n|---|---|\n| Box | L1 $1 |\n' }, names: new Map([['box', 'Box']]) }) });
    expect(fx.days[0].prs[0].features.find((f) => f.title === 'Box').effects).toEqual([expect.objectContaining({ name: 'Box', kind: 'row' })]);
    expect(d5.prs[1].featuresUnavailable).toBe(true);
    expect(d5.skipped).toContainEqual({ number: 2, title: 'fix(tools): readme', reason: 'scope tools' });
    // The repository's own commits are dated now, so other direct commits may share the day.
    expect(d5.direct).toContainEqual(expect.objectContaining({ subject: 'Add the HUD', body: 'A clock and a cash counter.', areas: ['ui'], features: [] }));
    expect(d5.skipped).toContainEqual(expect.objectContaining({ title: 'Notes', reason: 'direct commit, no player-facing paths' }));
    expect(out.days[1]).toMatchObject({ prs: [], direct: [] });
    const utc = build({ from: '2026-10-06', to: '2026-10-06' }, { tz: 'UTC', gh, git: gitOut, ref: 'main' });
    expect(utc.days[0].prs).toHaveLength(2);
  });
});

describe('command line', () => {
  it('writes a large result to a pipe in full', () => {
    const bin = mkdtempSync(join(toolTmp(), 'day-changes-gh-'));
    try {
      const prs = Array.from({ length: 400 }, (_, i) => ({ number: i + 1, title: `feat(ui): thing ${i}`, body: `## What\n${'A long line about the change. '.repeat(40)}`, mergedAt: '2026-10-05T20:00:00Z', mergeCommit: { oid: '0'.repeat(40) }, url: `u${i}`, author: { login: 'a' } }));
      writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify(prs)}\nEOF\n`, { mode: 0o755 });
      const r = spawnSync(process.execPath, [SCRIPT, '2026-10-05', '--tz', 'UTC', '--no-fetch', '--body-chars', '2000'], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, maxBuffer: 64 << 20 });
      expect(r.status).toBe(0);
      expect(r.stdout.length).toBeGreaterThan(300000);
      expect(JSON.parse(r.stdout).days[0].prs).toHaveLength(400);
    } finally { rmSync(bin, { recursive: true, force: true }); }
  });

  it('refuses a missing day, a bad day, a backwards range, a day with --since-first and a bad zone', () => {
    for (const args of [[], ['yesterday'], ['2026-10-05..2026-10-01'], ['--since-first', '2026-10-05'], ['2026-10-05', '--tz', 'Mars/Base'], ['2026-10-05', '--body-chars', '0'], ['2026-10-05', '--nope']]) {
      const r = cli(...args, '--no-fetch');
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toMatch(/day-changes:/);
    }
    const two = cli('2026-10-04', '2026-10-05', '--no-fetch');
    expect(two.status).toBe(2);
    expect(two.stderr).toContain('2026-10-04..2026-10-05');
    expect(cli('2026-10-04', '--no-fetch', '--tz', 'Mars/Base').status).toBe(2);
  });
});
