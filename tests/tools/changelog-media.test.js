import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { CAP, clipFrame, pickMedia, score, sourcesFor, toWebp } from '../../scripts/tools/changelog-media.mjs';

const tmp = mkdtempSync(join(toolTmp(), 'changelog-media-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const PM = 'https://github.com/justinlindh/human-in-the-loop/blob/pr-media';
const FM = 'https://github.com/justinlindh/human-in-the-loop/blob/feature-media';
const RAW = 'https://raw.githubusercontent.com/justinlindh/human-in-the-loop/feature-media';

describe('sourcesFor', () => {
  const urls = (list) => list.map((m) => m.url);
  it('puts stills of features a PR adds first, then its posted stills ranked, then stills of features it only changed', () => {
    const data = { days: [{ date: '2026-10-07', prs: [
      { number: 1, title: 'feat(art): foosball players stand at the handles', features: [
        { status: 'changed', title: 'The printout', ids: ['mission_test_support'], media: [] },
        { status: 'added', title: 'Foosball table', ids: ['foosball'], media: [{ kind: 'still', url: `${FM}/office-foosball.webp?raw=true` }, { kind: 'clip', url: `${FM}/m.mp4?raw=true` }] },
        { status: 'removed', title: 'Old', ids: ['old'], media: [{ kind: 'still', url: `${FM}/old.webp?raw=true` }] }] },
      { number: 2, title: 'fix(ui): plant', features: [{ status: 'added', title: 'Potted plant', ids: ['plant'], media: [] }] },
      { number: 3, title: 'feat(art): first-person walk', features: [] },
    ] }] };
    const posted = {
      1: [{ kind: 'still', url: `${PM}/pr-1/foosball-main.png?raw=true`, label: 'foosball-main' }, { kind: 'still', url: `${PM}/pr-1/foosball-branch.png?raw=true`, label: 'Players at the handles' }, { kind: 'still', url: 'https://example.com/x.png' }],
      2: [{ kind: 'still', url: `${PM}/pr-2/preview.gif?raw=true` }],
      3: [{ kind: 'clip', url: `${PM}/pr-3/before.mp4?raw=true` }, { kind: 'clip', url: `${PM}/pr-3/walk.mp4?raw=true` }],
    };
    const s = sourcesFor(data, '2026-10-07', ['office-plant.webp', 'office-desk.webp', 'decision-mission_test_support.webp'], { prMedia: (n) => posted[n] });
    expect(s.get(1).stills).toEqual([
      { url: `${RAW}/office-foosball.webp`, caption: 'Foosball table' },
      { url: `${PM}/pr-1/foosball-branch.png?raw=true`, caption: 'Players at the handles' },
      { url: `${PM}/pr-1/foosball-main.png?raw=true`, caption: 'Foosball players stand at the handles' },
      { url: `${RAW}/decision-mission_test_support.webp`, caption: 'The printout', weak: true },
    ]);
    expect(s.get(1).clips).toEqual([]);
    expect(s.get(2)).toEqual({ stills: [{ url: `${RAW}/office-plant.webp`, caption: 'Potted plant' }], clips: [] });
    expect(urls(s.get(3).clips)).toEqual([`${PM}/pr-3/walk.mp4?raw=true`, `${PM}/pr-3/before.mp4?raw=true`]);
    expect(s.get(3).clips[0].caption).toBe('First-person walk');
    // A feature's blob link to a still and the id's still on the branch are one file.
    const both = sourcesFor({ days: [{ date: 'd', prs: [{ number: 4, features: [{ status: 'changed', ids: ['foosball'], media: [{ kind: 'still', url: `${FM}/office-foosball.webp?raw=true` }] }] }] }] }, 'd', ['office-foosball.webp'], { prMedia: () => [] });
    expect(urls(both.get(4).stills)).toEqual([`${RAW}/office-foosball.webp`]);
  });

  it('ranks before, main, strip, pair and phone or tablet shots below after, branch and desktop shots', () => {
    expect(score('a/hud-after.png')).toBeLessThan(score('a/hud.png'));
    expect(score('a/fp-walk-desktop.png')).toBeLessThan(score('a/fp-walk.png'));
    // A crop ranks ahead of the full frame it comes from, a phone one too.
    expect(score('a/1775-crop-desk.png')).toBeLessThan(score('a/1775-b-button.png'));
    expect(score('a/menu-crop-390x844t.png')).toBe(0);
    expect(score('a/cropped.png')).toBe(0);
    expect(score('a/hud.png')).toBeLessThan(score('a/hud-390x844.png'));
    for (const n of ['fp-walk-820x1180t.png', 'hint-placed-1180x820.png', 'd-chart-390x844t.png', 'hud-ipad.png', 'hud-1920x1080t.png']) expect(score(`a/${n}`), n).toBe(1);
    // A desktop size is not a phone or tablet capture.
    for (const n of ['hud-1920x1080.png', 'hud-1280x800.png']) expect(score(`a/${n}`), n).toBe(0);
    expect(score('a/hud-390x844.png')).toBeLessThan(score('a/hud-strip.png'));
    expect(score('a/fp-walk-high-low.png')).toBe(score('a/hud-strip.png'));
    expect(score('a/hud-strip.png')).toBeLessThan(score('a/hud-main.png'));
  });
});

describe('pickMedia', () => {
  const m = (...u) => u.map((url) => ({ url, caption: `c-${url}` }));
  const sources = new Map([
    [1, { stills: m('a1', 'a2', 'a3', 'a4'), clips: m('ac') }],
    [2, { stills: m('b1', 'a1'), clips: [] }],
    [3, { stills: [], clips: m('c1', 'c2') }],
    [4, { stills: [], clips: m('d1') }],
  ]);
  it('takes stills in turn across the cited PRs, up to the cap, without repeats', () => {
    expect(CAP).toBe(3);
    expect(pickMedia(['#1', '#2'], sources).map((p) => p.url)).toEqual(['a1', 'b1', 'a2']);
    expect(pickMedia(['#2', '#1'], sources).map((p) => [p.url, p.pr])).toEqual([['b1', 2], ['a1', 1], ['a2', 1]]);
    expect(pickMedia(['#1'], sources, 2).map((p) => p.url)).toEqual(['a1', 'a2']);
  });
  it('falls back to one clip per PR when no cited PR has a still, and gives nothing for unknown PRs', () => {
    expect(pickMedia(['#3', '#4'], sources)).toEqual([{ url: 'c1', caption: 'c-c1', kind: 'clip', pr: 3 }, { url: 'd1', caption: 'c-d1', kind: 'clip', pr: 4 }]);
    expect(pickMedia(['#1'], sources)[0]).toEqual({ url: 'a1', caption: 'c-a1', kind: 'still', pr: 1 });
  });
  it('takes a still of a feature a PR only changed only after every cited PR\'s own stills', () => {
    const s = new Map([
      [7, { stills: [{ url: 'printout', caption: 'The printout', weak: true }], clips: [] }],
      [8, { stills: m('cooler-a', 'cooler-b'), clips: [] }],
    ]);
    expect(pickMedia(['#7', '#8'], s).map((p) => p.url)).toEqual(['cooler-a', 'cooler-b', 'printout']);
    expect(pickMedia(['#7', '#8'], s, 2).map((p) => p.url)).toEqual(['cooler-a', 'cooler-b']);
    expect(pickMedia(['#7'], s)).toEqual([{ url: 'printout', caption: 'The printout', kind: 'still', pr: 7 }]);
    expect(pickMedia(['#3', '#1'], sources).map((p) => p.kind)).toEqual(['still', 'still', 'still']);
    expect(pickMedia(['#99'], sources)).toEqual([]);
    expect(pickMedia([], sources)).toEqual([]);
  });
});

// A machine without ffmpeg (the hosted smoke runner) skips the real conversion; the run keeps the
// original still there, which the apply tests cover.
const hasFfmpeg = ['ffmpeg', 'ffprobe'].every((c) => spawnSync(c, ['-version']).status === 0);
describe('ffmpeg steps', () => {
  const ff = (...a) => spawnSync('ffmpeg', ['-v', 'error', '-y', ...a]).status === 0;
  it.skipIf(!hasFfmpeg)('makes a wide still a webp no wider than 1280 px, and cuts a webp frame from a clip', () => {
    const png = join(tmp, 'wide.png'), clip = join(tmp, 'c.mp4');
    expect(ff('-f', 'lavfi', '-i', 'testsrc=size=2000x1000:rate=1', '-frames:v', '1', png)).toBe(true);
    expect(ff('-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=4', '-pix_fmt', 'yuv420p', clip)).toBe(true);
    const w = join(tmp, 'wide.webp'), f = join(tmp, 'frame.webp');
    expect(toWebp(png, w)).toBe(true);
    expect(readFileSync(w).subarray(8, 12).toString()).toBe('WEBP');
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', w], { encoding: 'utf8' });
    expect(Number(probe.stdout.trim())).toBe(1280);
    expect(clipFrame(clip, f)).toBe(true);
    expect(readFileSync(f).subarray(8, 12).toString()).toBe('WEBP');
  });
  it('reports false and leaves nothing when the input is not media', () => {
    const bad = join(tmp, 'bad.png');
    spawnSync('sh', ['-c', `printf nope > ${bad}`]);
    expect(toWebp(bad, join(tmp, 'bad.webp'))).toBe(false);
    expect(clipFrame(bad, join(tmp, 'bad-frame.webp'))).toBe(false);
    expect(existsSync(join(tmp, 'bad.webp')) || existsSync(join(tmp, 'bad-frame.webp')) || existsSync(join(tmp, 'bad.webp.part.webp'))).toBe(false);
  });
});
