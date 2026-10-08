// Puts one day's drafted changelog entry into the site's changelog/entries.json, replacing that day's
// entry if there is one, so running a day again leaves exactly one entry for it.
//
//   node scripts/tools/changelog-apply.mjs <site-checkout> <day> <draft.json> [--keep <keep.json>]
//        [--media <day-changes.json> [--stills <feature-media file list>]]
//   node scripts/tools/changelog-apply.mjs keep <published-entry.json> [<record.json>]
//   node scripts/tools/changelog-apply.mjs record <site-checkout> <day> [--keep <keep.json>]
//
// --media chooses each drafted item's stills by rule instead of taking the draft's: up to three from
// the PRs the item cites (changelog-media.mjs), made webp, or a frame from a PR clip when none of them
// has a still. stdout then lists each item's stills (`media: <title>: ...`) and each item about
// something on screen left without one (`wanted: <area>: <title> (<refs>)`).
// `keep` prints what a redraft keeps of a published entry given this tool's record for the day, and
// `record` prints that record for the day's entry as it now stands (headline, titles and a fingerprint
// of each item's text and media, so an item edited by hand counts as not this tool's).
//
// The draft is one entry: { date, headline, items: [{ area, title, body, refs: [], media: [{ src,
// kind: "image", caption }] }] }. It is checked against the site's own rules (strings present, the date
// is the day, no em dash, no "startup", stills only) and its media is made shippable: a still on the
// feature-media branch or from a PR's media branch is downloaded to changelog/media/<day>/ and linked
// by that path; clips, GIFs and anything unreachable
// are dropped and reported on stderr.
// --keep names what the day's entry must keep as it is ({ headline?, items: [...] }, the parts of a
// published entry this tool did not write): those items come first, unchanged with their media, a
// drafted item with the same title is left out, and a kept headline wins over the drafted one.
// Afterwards the day's media folder holds only the files the entry shows, so a spare file never ships
// and a kept item's still is never deleted. Entries stay newest first. Exit 0 and a one-line summary
// on stdout; 2 when the draft or the options are unusable (the reasons on stderr), 1 on a read or
// write failure.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { aspect, CAP, clipFrame, pickMedia, POOL, sourcesFor, toWebp, UNSEEN, WIDE } from './changelog-media.mjs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

const GAME = 'justinlindh/human-in-the-loop';
const STILL = /\.(webp|png|jpe?g)$/i;
const EM_DASH = String.fromCharCode(8212);

// The reasons a draft cannot be used; [] when it can.
export function problems(entry, day) {
  const out = [];
  const str = (v) => typeof v === 'string' && v.trim() !== '';
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['the draft is not an entry object'];
  if (entry.date !== day) out.push(`date is ${JSON.stringify(entry.date)}, not ${day}`);
  if (!str(entry.headline)) out.push('no headline');
  if (!Array.isArray(entry.items) || entry.items.length === 0) out.push('no items');
  for (const [n, i] of (Array.isArray(entry.items) ? entry.items : []).entries()) {
    for (const k of ['area', 'title', 'body']) if (!str(i?.[k])) out.push(`item ${n + 1} has no ${k}`);
    if (i?.refs !== undefined && !(Array.isArray(i.refs) && i.refs.every((r) => /^#\d+$/.test(r)))) out.push(`item ${n + 1} refs must be like "#123"`);
    if (i?.media !== undefined && !Array.isArray(i.media)) out.push(`item ${n + 1} media must be a list`);
  }
  const text = JSON.stringify(entry);
  if (text.includes(EM_DASH) || /\\u2014/i.test(text)) out.push('an em dash (use a comma, a colon or two sentences)');
  if (/startup/i.test(text)) out.push('the word "startup" (say company or lab)');
  return out;
}

// How one media link is shipped: { src } for a link or a file already in place, { download, name } for a
// still to fetch, or { drop: reason }.
export function mediaPlan(src, { exists = () => false } = {}) {
  const s = String(src || '');
  if (s.includes('..')) return { drop: `${s} has a .. in its path` };
  const feature = new RegExp(`^https://(?:github\\.com/${GAME}/blob|raw\\.githubusercontent\\.com/${GAME})/feature-media/([\\w.-]+)(?:\\?raw=true)?$`).exec(s);
  if (feature) return /\.(webp|png)$/i.test(feature[1]) ? { download: `https://raw.githubusercontent.com/${GAME}/feature-media/${feature[1]}`, name: feature[1] } : { drop: `${feature[1]} is not a webp or png still` };
  const pr = new RegExp(`^https://(?:github\\.com/${GAME}/blob|raw\\.githubusercontent\\.com/${GAME})/pr-media/(.+?)(?:\\?raw=true)?$`).exec(s);
  if (pr) {
    const name = basename(pr[1]).replace(/[^\w.-]/g, '-');
    return STILL.test(name) ? { download: `https://raw.githubusercontent.com/${GAME}/pr-media/${pr[1]}`, name } : { drop: `${name} is not a still` };
  }
  if (/^media\//.test(s) && STILL.test(s) && exists(s)) return { src: s };
  return { drop: `${s || '(empty)'} is not a feature-media or PR media still` };
}

const defaultFetch = (url, dest) => {
  const r = spawnSync('curl', ['-fsSL', '--max-time', '60', '-o', dest, url], { encoding: 'utf8' });
  return r.status === 0 && existsSync(dest) && statSync(dest).size > 0;
};

// A pr-media or feature-media link as the raw URL to download.
const rawUrl = (u) => u.replace(/\?raw=true$/, '').replace(new RegExp(`^https://github\\.com/${GAME}/blob/`), `https://raw.githubusercontent.com/${GAME}/`);

// Applies the draft to the entries list and the media folder; returns { entries, notes, attached, wanted }.
// With `sources` (changelog-media.mjs sourcesFor), each drafted item's media is chosen by rule from the
// PRs it cites (pickMedia) and the draft's own media is ignored: stills are fetched and made webp, and a
// clip, when no cited PR has a still, gives a frame from its middle. Up to POOL candidates are fetched,
// one much wider than tall goes behind the rest, and the first `cap` are kept (the still check passes a
// larger cap and makes the final cut itself). `attached` lists what each item got; `wanted` the items
// about something on screen left with no still.
export function apply({ site, day, draft, keep = null, sources = null, cap = CAP, fetchFile = defaultFetch, convert = toWebp, frame = clipFrame, ratio = aspect }) {
  const root = join(site, 'changelog');
  const file = join(root, 'entries.json');
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  const dir = join(root, 'media', day);
  const notes = [], attached = [], wanted = [];
  const kept = keep?.items ?? [];
  const keptTitles = new Set(kept.map((i) => i.title));
  const keptSrcs = new Set(kept.flatMap((i) => (i.media ?? []).map((m) => m.src)));
  const entry = { date: draft.date, headline: keep?.headline ?? draft.headline.trim(), items: [...kept] };
  // Fetches url to media/<day>/<name> (webp when convert can), or links a kept item's file of that
  // name; returns its src or null.
  const place = (url, name, { clip = false } = {}) => {
    const webp = name.replace(/\.[^.]+$/, '.webp');
    for (const n of [webp, name]) if (keptSrcs.has(`media/${day}/${n}`) && existsSync(join(dir, n))) return `media/${day}/${n}`;
    mkdirSync(dir, { recursive: true });
    const part = join(dir, `${name}.part`);
    if (!fetchFile(url, part)) { rmSync(part, { force: true }); return null; }
    try {
      if (clip) return frame(part, join(dir, webp)) ? `media/${day}/${webp}` : null;
      if (convert(part, join(dir, webp))) return `media/${day}/${webp}`;
      renameSync(part, join(dir, name));
      return `media/${day}/${name}`;
    } finally { rmSync(part, { force: true }); }
  };
  for (const i of draft.items) {
    const item = { area: i.area.trim(), title: i.title.trim(), body: i.body.trim(), refs: i.refs ?? [] };
    if (keptTitles.has(item.title)) { notes.push(`left out the drafted "${item.title}": the entry keeps its own`); continue; }
    if (sources) {
      let media = [];
      for (const p of pickMedia(item.refs, sources, Math.max(cap, POOL))) {
        const base = basename(rawUrl(p.url)).replace(/[^\w.-]/g, '-');
        const feature = /\/feature-media\//.test(p.url);
        const name = p.kind === 'clip' ? `${p.pr}-${base.replace(/\.[^.]+$/, '')}-frame.webp` : feature ? base : `${p.pr}-${base}`;
        const src = place(rawUrl(p.url), name, { clip: p.kind === 'clip' });
        if (!src) notes.push(`dropped media: could not ${p.kind === 'clip' ? 'cut a frame from' : 'download'} ${p.url}`);
        else if (media.some((m) => m.src === src)) notes.push(`skipped media: ${p.url} is the same file as ${src}, already shown`);
        else media.push({ src, kind: 'image', ...(p.caption ? { caption: p.caption } : {}) });
      }
      // A picture much wider than tall is likely a strip or a row of frames: it goes behind the others.
      const wide = new Set(media.filter((m) => (ratio(join(root, m.src)) ?? 1) > WIDE).map((m) => m.src));
      for (const s of wide) notes.push(`ranked down a likely sheet (wider than ${WIDE}:1): ${s}`);
      media = [...media.filter((m) => !wide.has(m.src)), ...media.filter((m) => wide.has(m.src))].slice(0, cap);
      if (media.length) item.media = media;
      attached.push({ title: item.title, srcs: media.map((m) => m.src) });
      if (!media.length && !UNSEEN.test(item.area)) wanted.push(item);
      entry.items.push(item);
      continue;
    }
    const media = [];
    for (const m of i.media ?? []) {
      const plan = mediaPlan(m.src, { exists: (p) => existsSync(join(root, p)) });
      let src = plan.src;
      if (plan.download) {
        const at = `media/${day}/${plan.name}`;
        // A kept item's still is linked, never fetched over; a download lands beside its name first.
        if (keptSrcs.has(at) && existsSync(join(root, at))) src = at;
        else {
          mkdirSync(dir, { recursive: true });
          const part = join(dir, `${plan.name}.part`);
          if (fetchFile(plan.download, part)) { renameSync(part, join(dir, plan.name)); src = at; }
          else { rmSync(part, { force: true }); plan.drop = `could not download ${plan.download}`; }
        }
      }
      if (!src) { notes.push(`dropped media: ${plan.drop}`); continue; }
      media.push({ src, kind: 'image', ...(m.caption ? { caption: String(m.caption).trim() } : {}) });
    }
    if (media.length) item.media = media;
    entry.items.push(item);
  }
  // The day's folder keeps only what the entry shows.
  const shown = new Set(entry.items.flatMap((i) => (i.media ?? []).map((m) => m.src)));
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) if (!shown.has(`media/${day}/${f}`)) rmSync(join(dir, f), { recursive: true, force: true });
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
  }
  const rest = entries.filter((e) => e.date !== day);
  const at = rest.findIndex((e) => e.date < day);
  rest.splice(at < 0 ? rest.length : at, 0, entry);
  return { entries: rest, notes, attached, wanted, replaced: rest.length === entries.length };
}

// An item's text and media, so an item edited by hand after it was published is told from the one
// this tool wrote even when its title is the same.
export const fingerprint = (i) => createHash('sha256').update(JSON.stringify([i.area, i.title, i.body, (i.media ?? []).map((m) => m.src)])).digest('hex').slice(0, 16);

// What a redraft keeps of a published entry, given this tool's record for the day ({ headline, titles,
// prints? }, or null): every item and the headline it did not write. An item is the tool's when its
// fingerprint matches the record's (a record with no prints: when its title is listed).
export function keepFrom(published, ours) {
  const o = ours ?? { headline: null, titles: [] };
  const mine = (i) => (o.prints ? o.prints[i.title] === fingerprint(i) : (o.titles ?? []).includes(i.title));
  return { headline: published.headline === o.headline ? null : published.headline, items: published.items.filter((i) => !mine(i)) };
}

// The record of what this tool wrote in a day's entry: everything but what `keep` kept.
export function recordOf(entry, keep = null) {
  const keptTitles = new Set((keep?.items ?? []).map((i) => i.title));
  const items = entry.items.filter((i) => !keptTitles.has(i.title));
  return { headline: keep?.headline ? null : entry.headline, titles: items.map((i) => i.title), prints: Object.fromEntries(items.map((i) => [i.title, fingerprint(i)])) };
}

const USAGE = `usage: changelog-apply.mjs <site-checkout> <YYYY-MM-DD> <draft.json> [--keep <keep.json>] [--media <day-changes.json> [--stills <feature-media list>] [--cap <n>]]
       changelog-apply.mjs keep <published-entry.json> [<record.json>]     (what a redraft keeps, as JSON)
       changelog-apply.mjs record <site-checkout> <YYYY-MM-DD> [--keep <keep.json>]   (what this tool wrote, as JSON)`;
const readJson = (f, what) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { throw Object.assign(new Error(`${what} is not JSON: ${e.message}`), { code: 2 }); } };

function main(argv) {
  let a;
  try { a = parseArgs({ args: argv, allowPositionals: true, options: { keep: { type: 'string' }, media: { type: 'string' }, stills: { type: 'string' }, cap: { type: 'string' } } }); }
  catch (e) { console.error(`changelog-apply: ${e.message}\n${USAGE}`); return 2; }
  const { values: v, positionals: p } = a;
  try {
    const keep = v.keep ? readJson(v.keep, 'the keep file') : null;
    if (keep && !Array.isArray(keep.items)) { console.error('changelog-apply: the keep file has no items list'); return 2; }
    if (p[0] === 'keep') {
      if (!p[1] || p.length > 3) { console.error(USAGE); return 2; }
      console.log(JSON.stringify(keepFrom(readJson(p[1], 'the published entry'), p[2] && existsSync(p[2]) ? readJson(p[2], 'the record') : null)));
      return 0;
    }
    if (p[0] === 'record') {
      if (!p[1] || !/^\d{4}-\d\d-\d\d$/.test(p[2] || '') || p.length > 3) { console.error(USAGE); return 2; }
      const e = readJson(join(p[1], 'changelog', 'entries.json'), 'entries.json').find((x) => x.date === p[2]);
      if (!e) { console.error(`changelog-apply: no ${p[2]} entry in ${p[1]}`); return 1; }
      console.log(JSON.stringify(recordOf(e, keep)));
      return 0;
    }
    const [site, day, draftFile] = p;
    const cap = v.cap === undefined ? CAP : Number(v.cap);
    if (!site || !/^\d{4}-\d\d-\d\d$/.test(day || '') || !draftFile || p.length > 3 || (v.stills && !v.media) || (v.cap !== undefined && !v.media) || !(Number.isInteger(cap) && cap >= 1)) { console.error(USAGE); return 2; }
    const draft = readJson(draftFile, 'the draft');
    const bad = problems(draft, day);
    if (bad.length) { console.error(`changelog-apply: the draft cannot be used:\n- ${bad.join('\n- ')}`); return 2; }
    const sources = v.media ? sourcesFor(readJson(v.media, 'the day-changes file'), day, v.stills ? readFileSync(v.stills, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : []) : null;
    const { entries, notes, attached, wanted, replaced } = apply({ site, day, draft, keep, sources, cap });
    for (const n of notes) console.error(`changelog-apply: ${n}`);
    writeFileSync(join(site, 'changelog', 'entries.json'), `${JSON.stringify(entries, null, 2)}\n`);
    const n = entries.find((e) => e.date === day).items.length;
    console.log(`changelog-apply: ${replaced ? 'replaced' : 'added'} ${day}: ${n} item(s)${keep ? `, ${keep.items.length} kept as published` : ''}`);
    for (const x of attached) console.log(`changelog-apply: media: ${x.title}: ${x.srcs.join(', ') || '(none)'}`);
    for (const w of wanted) console.log(`changelog-apply: wanted: ${w.area}: ${w.title} (${w.refs.join(' ') || 'no PRs'})`);
    return 0;
  } catch (e) { console.error(`changelog-apply: ${e.message}`); return e.code === 2 ? 2 : 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
