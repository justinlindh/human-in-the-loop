// Puts one day's drafted changelog entry into the site's changelog/entries.json, replacing that day's
// entry if there is one, so running a day again leaves exactly one entry for it.
//
//   node scripts/tools/changelog-apply.mjs <site-checkout> <day> <draft.json> [--keep <keep.json>]
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
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

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

// Applies the draft to the entries list and the media folder; returns { entries, notes }.
export function apply({ site, day, draft, keep = null, fetchFile = defaultFetch }) {
  const root = join(site, 'changelog');
  const file = join(root, 'entries.json');
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  const dir = join(root, 'media', day);
  const notes = [];
  const kept = keep?.items ?? [];
  const keptTitles = new Set(kept.map((i) => i.title));
  const keptSrcs = new Set(kept.flatMap((i) => (i.media ?? []).map((m) => m.src)));
  const entry = { date: draft.date, headline: keep?.headline ?? draft.headline.trim(), items: [...kept] };
  for (const i of draft.items) {
    const item = { area: i.area.trim(), title: i.title.trim(), body: i.body.trim(), refs: i.refs ?? [] };
    if (keptTitles.has(item.title)) { notes.push(`left out the drafted "${item.title}": the entry keeps its own`); continue; }
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
  return { entries: rest, notes, replaced: rest.length === entries.length };
}

function main(argv) {
  const usage = 'usage: changelog-apply.mjs <site-checkout> <YYYY-MM-DD> <draft.json> [--keep <keep.json>]';
  const k = argv.indexOf('--keep');
  const keepFile = k >= 0 ? argv[k + 1] : null;
  if (k >= 0 && !keepFile) { console.error(usage); return 2; }
  const [site, day, draftFile, extra] = k >= 0 ? argv.filter((_, i) => i !== k && i !== k + 1) : argv;
  if (!site || !/^\d{4}-\d\d-\d\d$/.test(day || '') || !draftFile || extra) { console.error(usage); return 2; }
  let draft, keep = null;
  try { draft = JSON.parse(readFileSync(draftFile, 'utf8')); } catch (e) { console.error(`changelog-apply: the draft is not JSON: ${e.message}`); return 2; }
  if (keepFile) {
    try { keep = JSON.parse(readFileSync(keepFile, 'utf8')); } catch (e) { console.error(`changelog-apply: the keep file is not JSON: ${e.message}`); return 2; }
    if (!Array.isArray(keep?.items)) { console.error('changelog-apply: the keep file has no items list'); return 2; }
  }
  const bad = problems(draft, day);
  if (bad.length) { console.error(`changelog-apply: the draft cannot be used:\n- ${bad.join('\n- ')}`); return 2; }
  try {
    const { entries, notes, replaced } = apply({ site, day, draft, keep });
    for (const n of notes) console.error(`changelog-apply: ${n}`);
    writeFileSync(join(site, 'changelog', 'entries.json'), `${JSON.stringify(entries, null, 2)}\n`);
    const n = entries.find((e) => e.date === day).items.length;
    console.log(`changelog-apply: ${replaced ? 'replaced' : 'added'} ${day}: ${n} item(s)${keep ? `, ${keep.items.length} kept as published` : ''}`);
    return 0;
  } catch (e) { console.error(`changelog-apply: ${e.message}`); return 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
