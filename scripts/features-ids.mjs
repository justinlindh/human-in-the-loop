#!/usr/bin/env node
// Checks docs/features.md against the game's data, both ways:
//   - every required id has an entry (`id: <x>` in a bullet), unless a bullet in the "Ids left out on
//     purpose" section names it as a code span in its subject (before the first ": ");
//   - every `id: <x>` in the file exists somewhere in the data.
// Required ids: events with a stage, a grant or a leaves prop; items; perks; moment KINDS; quick
// posts; prompt template ids; music night genres; eras. Some ids are shared by several kinds
// (pizza, coffee, chatgbt), so an id counts by presence, whatever kind the entry is about.
// Usage: node scripts/features-ids.mjs [--doc <features.md>] [--root <checkout>]
//   --doc   the file to check (default docs/features.md under --root)
//   --root  the checkout whose data defines the ids (default this script's own)
// Exit 0 when both directions hold, 1 with the list when not, 2 when the file or data can't be read.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const root = resolve(opt('root', join(dirname(fileURLToPath(import.meta.url)), '..')));
const docPath = resolve(opt('doc', join(root, 'docs/features.md')));
if (!existsSync(docPath)) { console.log(`features-ids: no ${docPath}; nothing to check`); process.exit(0); }
const doc = readFileSync(docPath, 'utf8');
const load = (rel) => import(pathToFileURL(join(root, rel)).href);

// Keys of a top-level object literal in a module we can't import (render code imports three).
const objectKeys = (rel, name) => {
  const src = readFileSync(join(root, rel), 'utf8');
  const m = src.match(new RegExp(`const ${name} = \\{\\n([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`${rel}: no const ${name} = { ... };`);
  return [...m[1].matchAll(/^ {2}([A-Za-z_][\w]*):/gm)].map((x) => x[1]);
};
const arrayStrings = (rel, name) => {
  const src = readFileSync(join(root, rel), 'utf8');
  const m = src.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  if (!m) throw new Error(`${rel}: no const ${name} = [ ... ]`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
const hasKey = (v, keys, depth = 0) => {
  if (!v || typeof v !== 'object' || depth > 4) return false;
  if (Array.isArray(v)) return v.some((x) => hasKey(x, keys, depth + 1));
  return Object.entries(v).some(([k, x]) => (keys.includes(k) && x != null) || hasKey(x, keys, depth + 1));
};

let required, known;
try {
  const { EVENTS } = await load('src/data/events.js');
  const { ITEMS } = await load('src/data/items.js');
  const { POST_IDS } = await load('src/data/posts.js');
  const { PROMPT_IDS } = await load('src/data/prompts.js');
  const { ERA_IDS } = await load('src/data/eras.js');
  const { MUSIC_NIGHT } = await load('src/audio/manifest.js');
  required = {
    'staged event': Object.values(EVENTS).filter((e) => hasKey(e, ['stage', 'grant', 'leaves'])).map((e) => e.id),
    item: Object.keys(ITEMS),
    perk: objectKeys('src/render/perks.js', 'PERKS'),
    'moment kind': arrayStrings('src/render/moments.js', 'KINDS'),
    'quick post': POST_IDS,
    'prompt template': PROMPT_IDS,
    'music night genre': Object.keys(MUSIC_NIGHT),
    era: ERA_IDS,
  };
  // Every id the data defines, of any kind: the keys of exported id-keyed maps, and every id or key
  // field in exported data, plus the required ids above.
  known = new Set(Object.values(required).flat());
  const collect = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 5) return;
    if (Array.isArray(v)) { v.forEach((x) => collect(x, depth + 1)); return; }
    for (const f of ['id', 'key']) if (typeof v[f] === 'string') known.add(v[f]);
    for (const x of Object.values(v)) collect(x, depth + 1);
  };
  for (const f of readdirSync(join(root, 'src/data')).filter((n) => n.endsWith('.js') && !n.endsWith('.test.js'))) {
    const mod = await load(`src/data/${f}`);
    for (const v of Object.values(mod)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k, x] of Object.entries(v)) if (x && typeof x === 'object') known.add(k);
      }
      collect(v, 0);
    }
  }
} catch (e) {
  console.log(`features-ids: could not read the data: ${e.message}`);
  process.exit(2);
}

// The file's own ids: `id: <x>` code spans; the exceptions: code spans in the left-out section.
const sections = doc.split(/^## /m);
const leftOut = sections.find((s) => /^Ids left out on purpose/.test(s)) ?? '';
const body = sections.filter((s) => s !== leftOut).join('\n## ');
const inDoc = new Set([...body.matchAll(/`id: ([^`\s]+)`/g)].map((m) => m[1]));
// An exception is a code span in a left-out bullet's subject: the text before its first ": ", up to
// any "other than" (which names ids that do have entries).
const excepted = new Set();
for (const line of leftOut.split('\n').filter((l) => /^\s*- /.test(l))) {
  let end = line.length, inSpan = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '`') inSpan = !inSpan;
    else if (!inSpan && line.startsWith(': ', i)) { end = i; break; }
  }
  const subject = line.slice(0, end).split(/\bother than\b/)[0];
  for (const m of subject.matchAll(/`([^`\s]+)`/g)) excepted.add(m[1]);
}

const missing = [];
for (const [kind, ids] of Object.entries(required)) {
  for (const id of new Set(ids)) if (!inDoc.has(id) && !excepted.has(id)) missing.push(`${kind} ${id}`);
}
const unknown = [...inDoc].filter((id) => !known.has(id)).sort();

if (missing.length) {
  console.log(`features-ids: ${missing.length} id(s) with no entry in ${docPath.replace(`${root}/`, '')} (add \`id: <x>\` to the bullet that shows it, or name it under "Ids left out on purpose"):`);
  for (const m of missing) console.log(`  ${m}`);
}
if (unknown.length) {
  console.log(`features-ids: ${unknown.length} id(s) in the file that the data doesn't define (a typo, or a renamed or removed id):`);
  for (const id of unknown) console.log(`  ${id}`);
}
const total = Object.values(required).reduce((n, ids) => n + new Set(ids).size, 0);
if (!missing.length && !unknown.length) {
  console.log(`features-ids: ok: ${inDoc.size} ids in the file, all defined; ${total} required ids covered (${excepted.size} named as left out)`);
}
process.exit(missing.length || unknown.length ? 1 : 0);
