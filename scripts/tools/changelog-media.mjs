// Where a changelog item's stills come from, chosen by rule rather than by the drafting model: the PRs
// the item cites, each with the stills of features it adds (docs/features links and art's `<kind>-<id>`
// stills on the feature-media branch) first, then the stills posted on the PR (body and comments, on
// the pr-media branch, ranked by score), then stills of features it only changed; for an item none of
// whose PRs has a still, a frame cut from a PR's clip. Each comes with a caption (sourcesFor).
// Used by changelog-apply.mjs --media.
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { extractMedia } from './day-changes.mjs';
import { stillsFor } from './changelog-digest.mjs';

const GAME = 'justinlindh/human-in-the-loop';
const RAW = `https://raw.githubusercontent.com/${GAME}/feature-media`;
const PR_MEDIA = new RegExp(`^https://(?:github\\.com/${GAME}/blob|raw\\.githubusercontent\\.com/${GAME})/pr-media/`);
const STILL = /\.(webp|png|jpe?g)(\?raw=true)?$/i;
const CLIP = /\.(mp4|webm|mov)(\?raw=true)?$/i;

// Stills per item, at most, and how many candidates are fetched for it, so a still ranked down after
// fetching (a likely sheet) or turned down by the still check has others behind it.
export const CAP = 3;
export const POOL = 6;
// Wider than this (width over height) reads as a strip or a row of frames, not one scene.
export const WIDE = 2.2;

// A picture's width over height, from ffprobe; null when it can't be read.
export function aspect(file) {
  const r = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  const [w, h] = String(r.stdout ?? '').trim().split(',').map(Number);
  return w > 0 && h > 0 ? w / h : null;
}

// Lower is better: a before/main shot, a contact strip or side-by-side pair (a high-low quality pair too)
// and a phone or tablet capture (a `<w>x<h>t` touch size, or a `<w>x<h>` size under 1200 wide; a desktop
// size such as 1920x1080 is not) are the weaker picks for a changelog still; after/branch and desktop
// shots the stronger. Ties keep the PR's own order.
export function score(url) {
  const n = url.replace(/\?raw=true$/, '').split('/').pop().toLowerCase();
  let s = 0;
  if (/(^|[-_.])(main|before|old|control)([-_.]|$)/.test(n)) s += 4;
  if (/(strip|sheet|contact|grid|diff|pair|before-after|high-low|-vs-|step)/.test(n)) s += 2;
  const size = /(\d{3,4})x\d{3,4}(t?)([-_.]|$)/.exec(n);
  if ((size && (size[2] === 't' || Number(size[1]) < 1200)) || /(phone|small|narrow|ipad|tablet|land|portrait)/.test(n)) s += 1;
  if (/(^|[-_.])(after|branch|new|fixed|desktop)([-_.]|$)/.test(n)) s -= 1;
  return s;
}
const ranked = (list) => list.map((x, i) => ({ x, i, s: score(x.url) })).sort((a, b) => a.s - b.s || a.i - b.i).map((r) => r.x);

// A caption a reader can check the still against: the feature's name for a feature still, the link's own
// words for a posted still that has them, else the PR's summary (its title past `type(scope): `).
const summary = (title = '') => { const s = title.replace(/^\w+(\([^)]*\))?!?:\s*/, '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : ''; };
const words = (label = '') => (/\s/.test(label.trim()) && !/\.(png|webp|jpe?g|gif|mp4)$/i.test(label.trim()) ? label.trim() : '');
const tidy = (c) => { const t = c.replace(/\s+/g, ' ').trim(); return /startup/i.test(t) ? '' : t.length > 110 ? `${t.slice(0, 107).replace(/\s+\S*$/, '')} ...` : t; };

// The stills and clips posted on a PR, from gh: its body and every comment (pr-media.sh posts there).
export function ghPrMedia(n) {
  const r = spawnSync('gh', ['pr', 'view', String(n), '-R', GAME, '--json', 'body,comments'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 60000 });
  if (r.status !== 0) return [];
  try { const j = JSON.parse(r.stdout); return extractMedia([j.body, ...(j.comments ?? []).map((c) => c.body)].join('\n')); } catch { return []; }
}

// For each PR of the day (day-changes.mjs output), its stills and clips in the order to pick them:
// Map<number, { stills: [{ url, caption }], clips: [{ url, caption }] }>. Stills of a feature the PR adds
// come first, then the stills posted on the PR (ranked), then stills of features it only changed (an
// entry it touched in passing shows something else). `featureFiles` lists the feature-media branch's files.
export function sourcesFor(dayChanges, day, featureFiles = [], { prMedia = ghPrMedia } = {}) {
  const d = dayChanges.days.find((x) => x.date === day) ?? { prs: [] };
  const out = new Map();
  for (const pr of d.prs) {
    const added = [], changed = [];
    for (const f of pr.features ?? []) {
      if (f.status === 'removed') continue;
      const to = f.status === 'added' ? added : changed;
      // One form for a feature-media link (a blob link and the raw one are the same file).
      for (const m of f.media ?? []) if (m.kind === 'still') to.push({ url: m.url.replace(new RegExp(`^https://github\\.com/${GAME}/blob/feature-media/([^?]+)(\\?raw=true)?$`), `${RAW}/$1`), caption: tidy(f.title ?? '') });
      for (const name of stillsFor(f.ids, featureFiles)) to.push({ url: `${RAW}/${name}`, caption: tidy(f.title ?? '') });
    }
    const posted = prMedia(pr.number).filter((m) => PR_MEDIA.test(m.url)).map((m) => ({ url: m.url, caption: tidy(words(m.label) || summary(pr.title)) }));
    const seen = new Set();
    // `weak`: a still of a feature the PR only changed, taken only once no cited PR has a stronger one.
    const stills = [...added, ...ranked(posted.filter((m) => STILL.test(m.url))), ...changed.map((m) => ({ ...m, weak: true }))].filter((m) => !seen.has(m.url) && seen.add(m.url));
    const clips = ranked(posted.filter((m) => CLIP.test(m.url)));
    out.set(pr.number, { stills, clips });
  }
  return out;
}

// The media for one item from the PRs it cites ("#123"), up to `cap`: stills taken in turn across its
// PRs, so each PR shows, the weak ones (features a PR only changed) only after every PR's others; with
// no still on offer, one clip per PR to cut a frame from. [{ url, caption, kind: 'still' | 'clip', pr }].
export function pickMedia(refs = [], sources, cap = CAP) {
  const prs = [...new Set(refs.map((r) => Number(String(r).replace('#', ''))))].filter((n) => sources.has(n));
  const out = [], seen = new Set();
  for (const weak of [false, true]) {
    const lists = prs.map((n) => ({ n, list: sources.get(n).stills.filter((m) => !!m.weak === weak) }));
    for (let more = true; more && out.length < cap;) {
      more = false;
      for (const l of lists) {
        while (l.list.length && seen.has(l.list[0].url)) l.list.shift();
        if (!l.list.length || out.length >= cap) continue;
        const { weak: _, ...m } = l.list.shift(); seen.add(m.url); out.push({ ...m, kind: 'still', pr: l.n }); more = true;
      }
    }
  }
  if (out.length) return out;
  for (const n of prs) {
    const c = sources.get(n).clips[0];
    if (c && out.length < cap) out.push({ ...c, kind: 'clip', pr: n });
  }
  return out;
}

const run = (cmd, args) => spawnSync('nice', ['-n', '10', 'timeout', '120', cmd, ...args], { encoding: 'utf8' });
const ok = (f) => existsSync(f) && statSync(f).size > 0;

// A still as webp no wider than 1280 px; false when ffmpeg can't (the caller keeps the original).
export function toWebp(src, dest) {
  const tmp = `${dest}.part.webp`;
  const r = run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', "scale='min(1280,iw)':-2", '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', tmp]);
  if (r.status !== 0 || !ok(tmp)) { rmSync(tmp, { force: true }); return false; }
  renameSync(tmp, dest);
  return true;
}

// A frame from the middle of a clip, as webp no wider than 1280 px; false when it can't be cut.
export function clipFrame(clip, dest) {
  const p = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', clip]);
  const dur = Number(p.stdout?.trim());
  const at = Number.isFinite(dur) && dur > 0 ? dur / 2 : 0;
  const tmp = `${dest}.part.webp`;
  const r = run('ffmpeg', ['-v', 'error', '-y', '-ss', at.toFixed(2), '-i', clip, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libwebp', '-quality', '82', tmp]);
  if (r.status !== 0 || !ok(tmp)) { rmSync(tmp, { force: true }); return false; }
  renameSync(tmp, dest);
  return true;
}

// Areas whose items are not about something on screen, so a missing still is not flagged.
export const UNSEEN = /^(sound|audio|music|economy|balance|behind the scenes|fixes|performance)$/i;
