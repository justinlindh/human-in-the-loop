import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { apply, mediaPlan, problems } from '../../scripts/tools/changelog-apply.mjs';

const SCRIPT = resolve(__dirname, '../../scripts/tools/changelog-apply.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'changelog-apply-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const FM = 'https://github.com/justinlindh/human-in-the-loop/blob/feature-media';
const entry = (day, extra = {}) => ({ date: day, headline: `Headline ${day}`, items: [{ area: 'Office', title: 'A thing', body: 'It does a thing.', refs: ['#1'], ...extra }] });
let site;
const readEntries = () => JSON.parse(readFileSync(join(site, 'changelog/entries.json'), 'utf8'));
beforeEach(() => {
  site = mkdtempSync(join(tmp, 'site-'));
  mkdirSync(join(site, 'changelog/media/2026-10-01'), { recursive: true });
  writeFileSync(join(site, 'changelog/media/2026-10-01/old.webp'), 'x');
  writeFileSync(join(site, 'changelog/entries.json'), JSON.stringify([entry('2026-10-05'), entry('2026-10-03'), entry('2026-10-01', { media: [{ src: 'media/2026-10-01/old.webp', kind: 'image' }] })], null, 2));
});
const fetchOk = (url, dest) => { writeFileSync(dest, 'png'); return true; };

describe('problems', () => {
  it('accepts a good entry and names each defect', () => {
    expect(problems(entry('2026-10-06'), '2026-10-06')).toEqual([]);
    expect(problems({ ...entry('2026-10-05') }, '2026-10-06')).toEqual(['date is "2026-10-05", not 2026-10-06']);
    expect(problems({ date: '2026-10-06', headline: '', items: [] }, '2026-10-06')).toEqual(['no headline', 'no items']);
    expect(problems(entry('2026-10-06', { body: ' ' }), '2026-10-06')).toEqual(['item 1 has no body']);
    expect(problems(entry('2026-10-06', { refs: ['12'] }), '2026-10-06')[0]).toMatch(/refs/);
    expect(problems(entry('2026-10-06', { body: `a ${String.fromCharCode(8212)} b` }), '2026-10-06')[0]).toMatch(/em dash/);
    expect(problems(entry('2026-10-06', { title: 'The startup grows' }), '2026-10-06')[0]).toMatch(/startup/);
    expect(problems([], '2026-10-06')).toEqual(['the draft is not an entry object']);
  });
});

describe('mediaPlan', () => {
  it('turns a feature-media link into its raw link and downloads a PR still', () => {
    expect(mediaPlan(`${FM}/office-box.webp?raw=true`)).toEqual({ src: 'https://raw.githubusercontent.com/justinlindh/human-in-the-loop/feature-media/office-box.webp' });
    expect(mediaPlan(`${FM}/moment-box.mp4?raw=true`).drop).toMatch(/not a webp or png/);
    expect(mediaPlan('https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-12/../../x.png?raw=true').drop).toMatch(/\.\./);
    expect(mediaPlan('media/../../etc/x.png', { exists: () => true }).drop).toMatch(/\.\./);
    expect(mediaPlan('https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-12/shot one.png?raw=true')).toEqual({ download: 'https://raw.githubusercontent.com/justinlindh/human-in-the-loop/pr-media/pr-12/shot one.png', name: 'shot-one.png' });
    expect(mediaPlan('https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-12/clip.mp4?raw=true').drop).toMatch(/not a still/);
    expect(mediaPlan('https://example.com/a.png').drop).toMatch(/not a feature-media/);
    expect(mediaPlan('media/2026-10-01/old.webp', { exists: () => true })).toEqual({ src: 'media/2026-10-01/old.webp' });
    expect(mediaPlan('media/none.webp').drop).toBeDefined();
  });
});

describe('apply', () => {
  it('adds a new day in date order and a replaced day stays one entry', () => {
    const add = apply({ site, day: '2026-10-04', draft: entry('2026-10-04') });
    expect(add.entries.map((e) => e.date)).toEqual(['2026-10-05', '2026-10-04', '2026-10-03', '2026-10-01']);
    expect(add.replaced).toBe(false);
    const again = apply({ site, day: '2026-10-03', draft: { ...entry('2026-10-03'), headline: 'New headline' } });
    expect(again.entries.map((e) => e.date)).toEqual(['2026-10-05', '2026-10-03', '2026-10-01']);
    expect(again.entries[1].headline).toBe('New headline');
    expect(again.replaced).toBe(true);
    expect(apply({ site, day: '2026-09-01', draft: entry('2026-09-01') }).entries.at(-1).date).toBe('2026-09-01');
    expect(apply({ site, day: '2026-10-09', draft: entry('2026-10-09') }).entries[0].date).toBe('2026-10-09');
  });

  it('rebuilds the day media folder: downloads a PR still, links a feature-media still, drops the rest', () => {
    const draft = entry('2026-10-01', { media: [
      { src: `${FM}/office-box.webp?raw=true`, kind: 'image', caption: 'The box' },
      { src: 'https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-12/shot.png?raw=true', kind: 'image' },
      { src: `${FM}/moment.mp4?raw=true`, kind: 'image' },
    ] });
    const r = apply({ site, day: '2026-10-01', draft, fetchFile: fetchOk });
    const item = r.entries.find((e) => e.date === '2026-10-01').items[0];
    expect(item.media).toEqual([
      { src: 'https://raw.githubusercontent.com/justinlindh/human-in-the-loop/feature-media/office-box.webp', kind: 'image', caption: 'The box' },
      { src: 'media/2026-10-01/shot.png', kind: 'image' },
    ]);
    expect(readdirSync(join(site, 'changelog/media/2026-10-01'))).toEqual(['shot.png']);
    expect(r.notes).toHaveLength(1);
  });

  it('drops a still that cannot be downloaded and leaves no file behind', () => {
    const r = apply({ site, day: '2026-10-01', draft: entry('2026-10-01', { media: [{ src: 'https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-1/a.png?raw=true', kind: 'image' }] }), fetchFile: () => false });
    expect(r.entries.find((e) => e.date === '2026-10-01').items[0].media).toBeUndefined();
    expect(existsSync(join(site, 'changelog/media/2026-10-01/a.png'))).toBe(false);
    expect(r.notes[0]).toMatch(/could not download/);
  });
});

describe('command line', () => {
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8' });

  it('replaces a day and gives the same file when run twice', () => {
    const draft = join(site, 'draft.json');
    writeFileSync(draft, JSON.stringify(entry('2026-10-03', { body: 'Changed text.' })));
    const a = run(site, '2026-10-03', draft);
    expect(a.status).toBe(0);
    expect(a.stdout).toContain('replaced 2026-10-03');
    const once = readFileSync(join(site, 'changelog/entries.json'), 'utf8');
    expect(run(site, '2026-10-03', draft).status).toBe(0);
    expect(readFileSync(join(site, 'changelog/entries.json'), 'utf8')).toBe(once);
    expect(readEntries().filter((e) => e.date === '2026-10-03')).toHaveLength(1);
  });

  it('refuses bad input and an unusable draft without touching the entries', () => {
    const before = readFileSync(join(site, 'changelog/entries.json'), 'utf8');
    expect(run().status).toBe(2);
    expect(run(site, 'yesterday', 'x.json').status).toBe(2);
    expect(run(site, '2026-10-03', join(site, 'missing.json')).status).toBe(2);
    const draft = join(site, 'bad.json');
    writeFileSync(draft, JSON.stringify({ date: '2026-10-03', headline: 'h', items: [] }));
    const r = run(site, '2026-10-03', draft);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('no items');
    expect(readFileSync(join(site, 'changelog/entries.json'), 'utf8')).toBe(before);
  });
});
