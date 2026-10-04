// `npm run feature-media -- --check`: no rendering. Fails when
//   - an `id:` in docs/features has no media link and no `media: none (<reason>)` on its entry, unless the
//     pair `<file>:<id>` is in coverage-baseline.json (the entries not yet covered); a baseline pair that
//     is covered now is also a failure, so the list only shrinks (`--write-baseline` rewrites it);
//   - a published media link names nothing a manifest can render (see NAMES below);
//   - a manifest item opened at an indexed moment no longer resolves to a pre-tick snapshot (skipped with a
//     note when the event index for this sim code is missing: build it with scripts/events/build.js).
// Entries: a bullet line of a docs/features/*.md file (README and left-out.md excluded). An entry's ids are its
// `id: <x>` code spans.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// FEATURE_MEDIA_DOCS and FEATURE_MEDIA_BASELINE point the check at other files (for trying a change).
const DOCS = process.env.FEATURE_MEDIA_DOCS ?? join(ROOT, 'docs/features');
const BASELINE = process.env.FEATURE_MEDIA_BASELINE ?? join(ROOT, 'scripts/feature-media/coverage-baseline.json');
const MANIFESTS = ['scripts/feature-media/manifest.js', 'scripts/reels/era-manifest.js', 'scripts/capture-manifest.js'];
// Published names that differ from their item id.
const ALIASES = {
  lockdown: 'site-lockdown',
  ...Object.fromEntries(['garage', 'floor', 'hq'].flatMap((s) => ['day', 'night'].map((t) => [`day-night-${s}-${t}`, `2-2-${s}-${t}`]))),
};
const MEDIA_URL = /https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/blob\/feature-media\/([A-Za-z0-9_.-]+?)\.(?:webp|mp4|gif|png)\?raw=true/g;

export const parseEntries = () => {
  const out = [];
  for (const f of readdirSync(DOCS).filter((n) => n.endsWith('.md') && n !== 'README.md' && n !== 'left-out.md').sort()) {
    readFileSync(join(DOCS, f), 'utf8').split('\n').forEach((line, i) => {
      if (!/^\s*- /.test(line)) return;
      const ids = [...line.matchAll(/`id: ([A-Za-z0-9_-]+)`/g)].map((m) => m[1]);
      if (!ids.length) return;
      const names = [...line.matchAll(MEDIA_URL)].map((m) => m[1]);
      out.push({ file: f, line: i + 1, ids: [...new Set(ids)], names, none: /\bmedia: none \([^)]+\)/.test(line), pending: /\bmedia: pending \(#\d+\)/.test(line) });
    });
  }
  return out;
};

export async function check({ writeBaseline = false } = {}) {
  const problems = [];
  const notes = [];
  const itemsByManifest = {};
  for (const m of MANIFESTS) itemsByManifest[m] = (await import(pathToFileURL(join(ROOT, m)).href)).ITEMS;
  const itemIds = new Set(Object.values(itemsByManifest).flat().map((i) => i.id));

  const entries = parseEntries();
  // An id is covered when any entry of its file that carries it is. (A file may repeat an entry.)
  const seen = new Set(), done = new Set();
  for (const e of entries) {
    // `media: pending (#<issue>)`: the thing does not read on video yet; the issue is the owner's fix.
    const covered = e.names.length > 0 || e.none || e.pending;
    for (const id of e.ids) { seen.add(`${e.file}:${id}`); if (covered) done.add(`${e.file}:${id}`); }
    for (const n of e.names) {
      if (!itemIds.has(n) && !itemIds.has(ALIASES[n])) problems.push(`${e.file}:${e.line}: media "${n}" names no manifest item (add the item, or an alias in check.mjs)`);
    }
  }
  const uncovered = new Set([...seen].filter((k) => !done.has(k)));
  const baseline = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : []);
  if (writeBaseline) {
    writeFileSync(BASELINE, `${JSON.stringify([...uncovered].sort(), null, 1)}\n`);
    console.log(`feature-media check: wrote ${uncovered.size} uncovered ids to the baseline`);
    return 0;
  }
  for (const k of [...uncovered].sort()) if (!baseline.has(k)) problems.push(`${k}: no media link and no "media: none (<reason>)" on its entry`);
  for (const k of [...baseline].sort()) if (!uncovered.has(k)) problems.push(`${k}: covered now (or gone); remove it from scripts/feature-media/coverage-baseline.json with --write-baseline`);

  // Moments: every item opened at an indexed moment still resolves.
  const { simHash, readIndex, match, parseQuery } = await import(pathToFileURL(join(ROOT, 'scripts/events/lib.js')).href);
  const idx = readIndex(simHash());
  const moments = Object.entries(itemsByManifest).flatMap(([m, items]) => items.filter((i) => i.moment && m !== 'scripts/capture-manifest.js').map((i) => ({ m, i })));
  if (!idx) notes.push(`no event index for this sim code: ${moments.length} moment queries not checked`);
  else {
    for (const { m, i } of moments) {
      const q = { ...parseQuery(`${i.moment}${i.pre ? ' --pre' : ''}`.split(/\s+/)), snapshot: true };
      const [row] = match(idx.rows, q);
      if (!row) problems.push(`${m} item ${i.id}: moment "${i.moment}" matches no indexed snapshot`);
      else if (i.pre && !row.preTick) problems.push(`${m} item ${i.id}: moment "${i.moment}" has no pre-tick snapshot`);
    }
  }

  for (const n of notes) console.log(`feature-media check: ${n}`);
  for (const p of problems) console.error(`feature-media check: ${p}`);
  const covered = entries.reduce((n, e) => n + (e.names.length || e.none || e.pending ? e.ids.length : 0), 0);
  const pending = entries.filter((e) => e.pending).reduce((n, e) => n + e.ids.length, 0);
  console.log(`feature-media check: ${entries.length} entries, ${covered} id slots covered (${pending} pending), ${uncovered.size} uncovered (${baseline.size} in the baseline), ${problems.length} problems`);
  return problems.length ? 1 : 0;
}
