import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { apply, fingerprint, keepFrom, mediaPlan, problems, recordOf } from '../../scripts/tools/changelog-apply.mjs';

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
  it('downloads a feature-media still and a PR still into the day folder', () => {
    expect(mediaPlan(`${FM}/office-box.webp?raw=true`)).toEqual({ download: 'https://raw.githubusercontent.com/justinlindh/human-in-the-loop/feature-media/office-box.webp', name: 'office-box.webp' });
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
      { src: 'media/2026-10-01/office-box.webp', kind: 'image', caption: 'The box' },
      { src: 'media/2026-10-01/shot.png', kind: 'image' },
    ]);
    expect(readdirSync(join(site, 'changelog/media/2026-10-01')).sort()).toEqual(['office-box.webp', 'shot.png']);
    expect(r.notes).toHaveLength(1);
  });

  it('drops a still that cannot be downloaded and leaves no file behind', () => {
    const r = apply({ site, day: '2026-10-01', draft: entry('2026-10-01', { media: [{ src: 'https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-1/a.png?raw=true', kind: 'image' }] }), fetchFile: () => false });
    expect(r.entries.find((e) => e.date === '2026-10-01').items[0].media).toBeUndefined();
    expect(existsSync(join(site, 'changelog/media/2026-10-01/a.png'))).toBe(false);
    expect(r.notes[0]).toMatch(/could not download/);
  });
});

describe('apply with items to keep', () => {
  const day = '2026-10-01';
  const art = { area: 'Art', title: 'New art', body: 'Stills.', media: [{ src: `media/${day}/art.webp`, kind: 'image' }, { src: `media/${day}/old.webp`, kind: 'image' }] };
  beforeEach(() => writeFileSync(join(site, `changelog/media/${day}/art.webp`), 'a'));

  it('keeps the items and headline it was given, with their stills, and leaves out a drafted item of the same title', () => {
    const draft = { date: day, headline: 'Drafted', items: [
      { area: 'Art', title: 'New art', body: 'A rewrite.', refs: [] },
      { area: 'UI', title: 'A button', body: 'It clicks.', refs: ['#2'], media: [{ src: `${FM}/old.webp?raw=true`, kind: 'image' }, { src: `${FM}/new.webp?raw=true`, kind: 'image' }] },
    ] };
    let fetched = [];
    const r = apply({ site, day, draft, keep: { headline: 'Curated', items: [art] }, fetchFile: (url, dest) => { fetched.push(url); return fetchOk(url, dest); } });
    const e = r.entries.find((x) => x.date === day);
    expect(e.headline).toBe('Curated');
    expect(e.items.map((i) => [i.title, i.body])).toEqual([['New art', 'Stills.'], ['A button', 'It clicks.']]);
    // old.webp is the kept item's: linked, not fetched over.
    expect(e.items[1].media.map((m) => m.src)).toEqual([`media/${day}/old.webp`, `media/${day}/new.webp`]);
    expect(fetched).toEqual(['https://raw.githubusercontent.com/justinlindh/human-in-the-loop/feature-media/new.webp']);
    expect(readFileSync(join(site, `changelog/media/${day}/old.webp`), 'utf8')).toBe('x');
    expect(readdirSync(join(site, `changelog/media/${day}`)).sort()).toEqual(['art.webp', 'new.webp', 'old.webp']);
    expect(r.notes).toEqual(['left out the drafted "New art": the entry keeps its own']);
  });

  it('with no kept headline the drafted one is used, and a file nothing shows is removed', () => {
    writeFileSync(join(site, `changelog/media/${day}/spare.webp`), 's');
    const r = apply({ site, day, draft: entry(day), keep: { items: [art] } });
    expect(r.entries.find((x) => x.date === day).headline).toBe(`Headline ${day}`);
    expect(readdirSync(join(site, `changelog/media/${day}`)).sort()).toEqual(['art.webp', 'old.webp']);
  });

  it('takes --keep on the command line and refuses a bad keep file', () => {
    const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8' });
    const draft = join(site, 'draft.json'), keep = join(site, 'keep.json');
    writeFileSync(draft, JSON.stringify(entry(day)));
    writeFileSync(keep, JSON.stringify({ headline: 'Curated', items: [art] }));
    const r = run(site, day, draft, '--keep', keep);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`replaced ${day}: 2 item(s), 1 kept as published`);
    expect(readEntries().find((x) => x.date === day).items[0]).toEqual(art);
    writeFileSync(keep, '{"headline":"x"}');
    expect(run(site, day, draft, '--keep', keep).status).toBe(2);
    expect(run(site, day, draft, '--keep').status).toBe(2);
  });
});

describe('apply with media chosen by rule', () => {
  const day = '2026-10-01';
  const PM = 'https://github.com/justinlindh/human-in-the-loop/blob/pr-media';
  const art = { area: 'Art', title: 'Kept', body: 'Hand-made.', media: [{ src: `media/${day}/old.webp`, kind: 'image' }] };
  const sources = new Map([
    [5, { stills: [`${PM}/pr-5/after.png?raw=true`, `${FM}/old.webp?raw=true`], clips: [] }],
    [6, { stills: [], clips: [`${PM}/pr-6/walk.mp4?raw=true`] }],
  ]);
  const convert = (src, dest) => { writeFileSync(dest, `webp:${readFileSync(src, 'utf8')}`); return true; };
  const frame = (src, dest) => { writeFileSync(dest, 'frame'); return true; };

  it('ignores the draft\'s media, takes the cited PRs\', cuts a frame for a clip-only PR, and flags an on-screen item left bare', () => {
    const fetched = [];
    const draft = { date: day, headline: 'H', items: [
      { area: 'UI', title: 'Five', body: 'b', refs: ['#5'], media: [{ src: `${FM}/model-pick.webp?raw=true`, kind: 'image' }] },
      { area: 'Office', title: 'Six', body: 'b', refs: ['#6'] },
      { area: 'Office', title: 'Bare', body: 'b', refs: ['#7'] },
      { area: 'Sound', title: 'Hum', body: 'b', refs: [] },
    ] };
    const r = apply({ site, day, draft, keep: { items: [art] }, sources, convert, frame, fetchFile: (url, dest) => { fetched.push(url); return fetchOk(url, dest); } });
    const e = r.entries.find((x) => x.date === day);
    expect(e.items.map((i) => [i.title, (i.media ?? []).map((m) => m.src)])).toEqual([
      ['Kept', [`media/${day}/old.webp`]],
      ['Five', [`media/${day}/5-after.webp`, `media/${day}/old.webp`]],
      ['Six', [`media/${day}/6-walk-frame.webp`]],
      ['Bare', []], ['Hum', []],
    ]);
    // The kept item's old.webp is linked by the feature still of the same name, never fetched over.
    expect(fetched).toEqual(['https://raw.githubusercontent.com/justinlindh/human-in-the-loop/pr-media/pr-5/after.png', 'https://raw.githubusercontent.com/justinlindh/human-in-the-loop/pr-media/pr-6/walk.mp4']);
    expect(readFileSync(join(site, `changelog/media/${day}/old.webp`), 'utf8')).toBe('x');
    expect(readFileSync(join(site, `changelog/media/${day}/5-after.webp`), 'utf8')).toBe('webp:png');
    expect(readdirSync(join(site, `changelog/media/${day}`)).sort()).toEqual(['5-after.webp', '6-walk-frame.webp', 'old.webp']);
    expect(r.attached.map((a) => [a.title, a.srcs.length])).toEqual([['Five', 2], ['Six', 1], ['Bare', 0], ['Hum', 0]]);
    expect(r.wanted.map((w) => w.title)).toEqual(['Bare']);
  });

  it('keeps the original still when it cannot be made webp, and drops what cannot be fetched', () => {
    const draft = { date: day, headline: 'H', items: [{ area: 'UI', title: 'Five', body: 'b', refs: ['#5', '#6'] }] };
    const r = apply({ site, day, draft, sources, convert: () => false, frame: () => false, fetchFile: (url, dest) => !/old\.webp/.test(url) && fetchOk(url, dest) });
    expect(r.entries.find((x) => x.date === day).items[0].media).toEqual([{ src: `media/${day}/5-after.png`, kind: 'image' }]);
    expect(r.notes).toEqual([expect.stringMatching(/could not download .*old\.webp/)]);
    expect(readdirSync(join(site, `changelog/media/${day}`))).toEqual(['5-after.png']);
  });
});

describe('the record of what this tool wrote', () => {
  const entryOf = (items, headline = 'Mine') => ({ date: '2026-10-01', headline, items });
  const a = { area: 'UI', title: 'A', body: 'Text.', refs: ['#1'], media: [{ src: 'media/x/1.webp', kind: 'image' }] };
  const b = { area: 'Art', title: 'B', body: 'Curated.', refs: [] };
  it('records what it wrote, less what it kept, and a redraft keeps the rest', () => {
    const rec = recordOf(entryOf([b, a], 'Mine'), { items: [b] });
    expect(rec).toEqual({ headline: 'Mine', titles: ['A'], prints: { A: fingerprint(a) } });
    expect(keepFrom(entryOf([b, a]), rec)).toEqual({ headline: null, items: [b] });
    // A kept headline is not the tool's.
    expect(recordOf(entryOf([a], 'Theirs'), { headline: 'Theirs', items: [] }).headline).toBe(null);
  });
  it('keeps an item of its own that was edited by hand since: new text or new stills', () => {
    const rec = recordOf(entryOf([a]));
    expect(keepFrom(entryOf([{ ...a, body: 'Fixed by hand.' }]), rec).items).toHaveLength(1);
    expect(keepFrom(entryOf([{ ...a, media: [...a.media, { src: 'media/x/2.webp', kind: 'image' }] }]), rec).items).toHaveLength(1);
    expect(keepFrom(entryOf([{ ...a, refs: ['#2'] }]), rec).items).toHaveLength(0);
  });
  it('reads an older record of titles only, and with no record keeps everything', () => {
    expect(keepFrom(entryOf([a, b]), { headline: 'Mine', titles: ['A'] })).toEqual({ headline: null, items: [b] });
    expect(keepFrom(entryOf([a, b]), null)).toEqual({ headline: 'Mine', items: [a, b] });
  });
  it('keep and record on the command line', () => {
    const run = (...x) => spawnSync(process.execPath, [SCRIPT, ...x], { encoding: 'utf8' });
    const pub = join(site, 'pub.json'), rec = join(site, 'rec.json');
    writeFileSync(pub, JSON.stringify(entryOf([b, a])));
    writeFileSync(rec, JSON.stringify(recordOf(entryOf([a]))));
    const k = run('keep', pub, rec);
    expect(k.status, k.stderr).toBe(0);
    expect(JSON.parse(k.stdout)).toEqual({ headline: null, items: [b] });
    expect(JSON.parse(run('keep', pub, join(site, 'missing.json')).stdout).items).toHaveLength(2);
    const r = run('record', site, '2026-10-03');
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).titles).toEqual(['A thing']);
    expect(run('record', site, '2026-01-01').status).toBe(1);
    expect(run('keep').status).toBe(2);
    expect(run(site, '2026-10-03', pub, '--stills', 'x').status).toBe(2);
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
