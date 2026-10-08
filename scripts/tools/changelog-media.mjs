// Where a changelog item's stills come from, chosen by rule rather than by the drafting model: the PRs
// the item cites, each with its feature-media stills (docs/features links and art's `<kind>-<id>`
// stills on the feature-media branch) first, then the stills posted on the PR (body and comments, on
// the pr-media branch), and, for an item none of whose PRs has a still, a frame cut from a PR's clip.
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

// Stills per item, at most.
export const CAP = 3;

// Lower is better: a before/main shot, a contact strip or side-by-side pair and a phone-sized shot are the weaker picks
// for a changelog still; after/branch shots the stronger. Ties keep the PR's own order.
export function score(url) {
  const n = url.replace(/\?raw=true$/, '').split('/').pop().toLowerCase();
  let s = 0;
  if (/(^|[-_.])(main|before|old|control)([-_.]|$)/.test(n)) s += 4;
  if (/(strip|sheet|contact|grid|diff|pair|before-after|-vs-|step)/.test(n)) s += 2;
  if (/(390x844|phone|small|narrow|ipad|land|portrait)/.test(n)) s += 1;
  if (/(^|[-_.])(after|branch|new|fixed)([-_.]|$)/.test(n)) s -= 1;
  return s;
}
const ranked = (urls) => urls.map((u, i) => ({ u, i, s: score(u) })).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.u);

// The stills and clips posted on a PR, from gh: its body and every comment (pr-media.sh posts there).
export function ghPrMedia(n) {
  const r = spawnSync('gh', ['pr', 'view', String(n), '-R', GAME, '--json', 'body,comments'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 60000 });
  if (r.status !== 0) return [];
  try { const j = JSON.parse(r.stdout); return extractMedia([j.body, ...(j.comments ?? []).map((c) => c.body)].join('\n')); } catch { return []; }
}

// For each PR of the day (day-changes.mjs output), its ranked stills and clips:
// Map<number, { stills: [url], clips: [url] }>. `featureFiles` lists the feature-media branch's files.
export function sourcesFor(dayChanges, day, featureFiles = [], { prMedia = ghPrMedia } = {}) {
  const d = dayChanges.days.find((x) => x.date === day) ?? { prs: [] };
  const out = new Map();
  for (const pr of d.prs) {
    const feature = [];
    for (const f of pr.features ?? []) {
      if (f.status === 'removed') continue;
      // One form for a feature-media link (a blob link and the raw one are the same file).
      for (const m of f.media ?? []) if (m.kind === 'still') feature.push(m.url.replace(new RegExp(`^https://github\\.com/${GAME}/blob/feature-media/([^?]+)(\\?raw=true)?$`), `${RAW}/$1`));
      for (const name of stillsFor(f.ids, featureFiles)) feature.push(`${RAW}/${name}`);
    }
    const posted = prMedia(pr.number).filter((m) => PR_MEDIA.test(m.url));
    const stills = [...new Set([...feature, ...ranked(posted.filter((m) => STILL.test(m.url)).map((m) => m.url))])];
    const clips = ranked(posted.filter((m) => CLIP.test(m.url)).map((m) => m.url));
    out.set(pr.number, { stills, clips });
  }
  return out;
}

// The media for one item from the PRs it cites ("#123"), up to `cap`: stills taken in turn across its
// PRs, so each PR shows; with no still on offer, one clip per PR to cut a frame from.
// [{ url, kind: 'still' | 'clip', pr }].
export function pickMedia(refs = [], sources, cap = CAP) {
  const prs = [...new Set(refs.map((r) => Number(String(r).replace('#', ''))))].filter((n) => sources.has(n));
  const out = [], seen = new Set();
  const lists = prs.map((n) => ({ n, list: [...sources.get(n).stills] }));
  for (let more = true; more && out.length < cap;) {
    more = false;
    for (const l of lists) {
      while (l.list.length && seen.has(l.list[0])) l.list.shift();
      if (!l.list.length || out.length >= cap) continue;
      const u = l.list.shift(); seen.add(u); out.push({ url: u, kind: 'still', pr: l.n }); more = true;
    }
  }
  if (out.length) return out;
  for (const n of prs) {
    const c = sources.get(n).clips[0];
    if (c && out.length < cap) out.push({ url: c, kind: 'clip', pr: n });
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
