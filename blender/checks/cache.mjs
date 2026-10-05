// Skip a render check whose inputs have not changed since it last passed in full.
//
// inputHash(check, extra) hashes everything a headless render can depend on: the game's source,
// public assets, the page shell and build config, the lockfile, the versions actually installed
// (three, vite, playwright, and the Chromium build Playwright launches), these check scripts and
// their reference images, the Node version, and `extra` (a check's own flags).
// A clean full pass records <hash>.pass under ~/.cache/hitl-ci/<check>/ with the commit it ran on.
// Any error reading inputs or the cache means "render": the cache can only skip, never fail.
// HITL_NO_CHECK_CACHE=1 turns it off.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { logTiming } from '../../scripts/lib/timing.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INPUTS = ['src', 'public', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json', 'blender/checks'];
const SKIP = /(^|\/)(node_modules|\.git)(\/|$)|\.(actual|diff)\.png$/;

function files(p, out) {
  const abs = join(ROOT, p);
  if (!existsSync(abs)) { out.push(`${p}:missing`); return; }
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const name of readdirSync(abs).sort()) {
      const rel = `${p}/${name}`;
      if (!SKIP.test(rel)) files(rel, out);
    }
  } else out.push(p);
}

export function inputHash(check, extra = '') {
  if (process.env.HITL_NO_CHECK_CACHE === '1') return null;
  try {
    const h = createHash('sha256');
    h.update(`${check}\n${extra}\n${process.version}\n${installed()}\n`);
    const list = [];
    for (const p of INPUTS) files(p, list);
    for (const f of list) {
      h.update(`${f}\n`);
      if (!f.endsWith(':missing')) h.update(readFileSync(join(ROOT, f)));
    }
    return h.digest('hex').slice(0, 32);
  } catch (e) {
    skipped(check, `could not build the key: ${e.message}`);
    return null;
  }
}

// What node_modules and the browser cache actually hold, which a stale install can make differ
// from the lockfile.
function installed() {
  const version = (pkg) => JSON.parse(readFileSync(join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  return ['three', 'vite', 'playwright'].map((p) => `${p}@${version(p)}`).concat(`chromium:${chromium.executablePath()}`).join(' ');
}

// HITL_CHECK_CACHE_DIR moves the whole cache (tests use a scratch one).
const dir = (check) => join(process.env.HITL_CHECK_CACHE_DIR || join(homedir(), '.cache', 'hitl-ci'), check);

// A pass that cannot be recorded says so on stderr, so a cache that never hits is not silent.
const skipped = (check, why) => console.error(`${check}: cache: skipped (${why})`);

// The commit a previous clean pass recorded for this hash, or null.
// Each lookup goes to the team's timing log as a hit or a miss.
export function passedAt(check, hash) {
  if (!hash) { logTiming({ kind: 'cache', tool: check, cache: 'off' }); return null; }
  let at = null;
  try {
    const f = join(dir(check), `${hash}.pass`);
    at = existsSync(f) ? (readFileSync(f, 'utf8').trim() || 'an earlier run') : null;
  } catch { /* unreadable: render */ }
  logTiming({ kind: 'cache', tool: check, cache: at ? 'hit' : 'miss', input: hash });
  return at;
}

export function recordPass(check, hash) {
  if (!hash) return;
  try {
    mkdirSync(dir(check), { recursive: true });
    let sha = 'uncommitted';
    try { sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a checkout */ }
    writeFileSync(join(dir(check), `${hash}.pass`), `${sha}\n`);
  } catch (e) {
    // A cache that cannot be written only costs a render next time.
    skipped(check, `could not write the record: ${e.message}`);
  }
}

// For logs: which inputs a hash covers, relative to the repo.
export const INPUT_PATHS = INPUTS.map((p) => relative(ROOT, join(ROOT, p)));

// Per-scene records, for checks whose scenes load different things (golden). A scene that passes
// records every file its page requested, with a hash of each, under a base key covering everything
// else that can change its pixels. A later run re-hashes those files and skips the scene when
// nothing it loaded changed. A new import can only appear by editing a file already loaded, and the
// base key covers the list of file names under src and public, so an added or removed file (which a
// glob import could pick up) re-renders every scene. Any doubt means "render".
const fileHashes = new Map();
export function fileHash(rel) {
  if (!fileHashes.has(rel)) {
    let h = null;
    try { h = createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex').slice(0, 24); } catch { /* missing: null */ }
    fileHashes.set(rel, h);
  }
  return fileHashes.get(rel);
}

// The repo files behind a page's requests; anything that is not one (the dev server's own modules,
// prebundled dependencies, other hosts) is covered by the base key or kept as a marker.
export function requestedFiles(urls) {
  const out = new Set();
  for (const u of urls) {
    let url;
    try { url = new URL(u); } catch { continue; }
    // Another host (the web fonts) is recorded by address only and always counts as unchanged.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) { out.add(`url:${url.origin}${url.pathname}`); continue; }
    const p = decodeURIComponent(url.pathname);
    // The dev server's client and prebundled dependencies (in its cache dir, .vite by default) follow
    // from the installed packages, which the base key covers.
    if (p.startsWith('/@vite/') || p.startsWith('/@id/') || p.startsWith('/node_modules/') || (p.startsWith('/.vite') && p.includes('/deps/'))) continue;
    let rel = null;
    if (p.startsWith('/@fs/')) rel = relative(ROOT, p.slice(4));
    else if (p === '/' || p === '/index.html') rel = 'index.html';
    else if (existsSync(join(ROOT, 'public', p))) rel = join('public', p.slice(1));
    else rel = p.slice(1);
    if (rel.startsWith('..')) { out.add(`outside:${p}`); continue; }
    out.add(rel);
  }
  return [...out].sort();
}

let baseCache = null;
function tree() {
  const list = [];
  for (const p of ['src', 'public']) files(p, list);
  return list.join('\n');
}
// Everything a scene's pixels can depend on besides the files it loads: the scene itself, the check
// and harness code, installed tools and browser, Node, the lockfile, the build config, and the list
// of source and public file names.
export function sceneBase(check, scene, toolFiles) {
  if (process.env.HITL_NO_CHECK_CACHE === '1') return null;
  try {
    baseCache ??= `${process.version}\n${installed()}\n${['package-lock.json', 'vite.config.js', 'index.html', ...toolFiles].map((f) => `${f}:${fileHash(f)}`).join('\n')}\n${createHash('sha256').update(tree()).digest('hex')}`;
    return createHash('sha256').update(`${check}\n${JSON.stringify(scene)}\n${baseCache}`).digest('hex').slice(0, 32);
  } catch (e) {
    skipped(check, `could not build the key: ${e.message}`);
    return null;
  }
}

const sceneFile = (check, name) => join(dir(`${check}-scenes`), `${name}.json`);
// True when this scene last passed (or was updated) with this base key, this reference image, and
// every file it loaded unchanged.
export function sceneUpToDate(check, name, base, refRel) {
  if (!base) return false;
  try {
    const rec = JSON.parse(readFileSync(sceneFile(check, name), 'utf8'));
    if (rec.base !== base || rec.ref !== fileHash(refRel)) return false;
    return Object.entries(rec.files).every(([f, h]) => (f.includes(':') ? true : fileHash(f) === h));
  } catch {
    return false;
  }
}
export function recordScene(check, name, base, requested, refRel) {
  if (!base) return;
  try {
    fileHashes.delete(refRel);
    const files = Object.fromEntries(requested.map((f) => [f, f.includes(':') ? f : fileHash(f)]));
    const missing = Object.keys(files).filter((f) => files[f] === null);
    if (missing.length) { skipped(check, `${name}: a requested file is missing (${missing[0]})`); return; }
    mkdirSync(dir(`${check}-scenes`), { recursive: true });
    writeFileSync(sceneFile(check, name), JSON.stringify({ base, ref: fileHash(refRel), files }));
  } catch (e) { skipped(check, `${name}: could not write the record: ${e.message}`); }
}

// Forget a scene's record, so a failed or interrupted run cannot leave an earlier success behind
// that a later run would trust.
export function clearScene(check, name) {
  try { rmSync(sceneFile(check, name), { force: true }); } catch { /* unremovable: the base key still guards it */ }
}

// Whole-check records keyed by the files a pass loaded, for checks that run many scenes (stage, clip,
// standup). graphBase(check, extra) covers what is not a loaded file: the check's flags (extra), Node,
// the installed tools and browser, the lockfile, build config and page shell, and the recorder that
// feeds it. recordGraphPass stores every file the clean pass loaded with its hash: what the caller
// reports (the engine processes' module loads, the pages' requests) plus the static import graph of
// the check's own entry script, which covers the code the checking process itself runs. The file
// names under a directory a loaded module globs are stored too, so a file added there re-runs the
// check. graphPassedAt skips only while all of it is unchanged, so an edit to a file the check never
// loaded (the UI, the audio, a reference image, another check) keeps the skip. Any doubt means "run".
const BASE_FILES = ['package-lock.json', 'package.json', 'vite.config.js', 'index.html', 'scripts/studio/load-log.mjs'];

export function graphBase(check, extra = '') {
  if (process.env.HITL_NO_CHECK_CACHE === '1') return null;
  try {
    const parts = BASE_FILES.map((f) => `${f}:${fileHash(f)}`);
    return createHash('sha256').update(`${check}\n${extra}\n${process.version}\n${installed()}\n${parts.join('\n')}`).digest('hex').slice(0, 32);
  } catch (e) {
    skipped(check, `could not build the key: ${e.message}`);
    return null;
  }
}

// The repo files an entry script imports, transitively, by literal specifier (static, re-exported
// and dynamic). A dynamic import whose specifier is computed adds every module beside that file.
const SCRIPT = /\.(m?js|ts)$/;
export function moduleGraph(entry) {
  const seen = new Set();
  const pending = [resolve(entry)];
  const resolveSpec = (from, spec) => {
    const base = spec.startsWith('.') ? resolve(dirname(from), spec) : /^\/(src|blender|scripts)\//.test(spec) ? join(ROOT, spec) : null;
    if (!base) return null;
    for (const c of [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')]) {
      try { if (statSync(c).isFile()) return c; } catch { /* try the next spelling */ }
    }
    return null;
  };
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file) || !SCRIPT.test(file) || /(^|\/)node_modules\//.test(file) || relative(ROOT, file).startsWith('..')) continue;
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    seen.add(file);
    const specs = new Set();
    for (const re of [/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g]) {
      for (const m of text.matchAll(re)) specs.add(m[1]);
    }
    for (const spec of specs) { const r = resolveSpec(file, spec); if (r) pending.push(r); }
    if (/\bimport\(\s*(?!['"])/.test(text)) {
      for (const n of readdirSync(dirname(file))) if (SCRIPT.test(n)) pending.push(join(dirname(file), n));
    }
  }
  return [...seen];
}

// The directories a module globs with a wildcard (import.meta.glob), with a hash of the file names
// under each: a file added there changes what the module imports without touching any loaded file.
function globDirs(rels) {
  const dirs = new Set();
  for (const rel of rels) {
    if (!rel.startsWith('src/') || !SCRIPT.test(rel)) continue;
    let text;
    try { text = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
    for (const call of text.matchAll(/import\.meta\.glob\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`]*`)/g)) {
      for (const lit of call[1].matchAll(/['"`]([^'"`]+)['"`]/g)) {
        const pattern = lit[1];
        if (!/[*{?[]/.test(pattern)) continue;
        const abs = pattern.startsWith('/') ? join(ROOT, pattern) : resolve(dirname(join(ROOT, rel)), pattern);
        const head = abs.split(/[*{?[]/)[0];
        dirs.add(relative(ROOT, head.endsWith('/') ? head.slice(0, -1) : dirname(head)) || '.');
      }
    }
  }
  return [...dirs].sort();
}
function listHash(rel) {
  const out = [];
  files(rel, out);
  return createHash('sha256').update(out.join('\n')).digest('hex').slice(0, 24);
}

const graphFile = (check, base) => join(dir(check), `graph-${base}.json`);

// The files a run loaded, as repo-relative paths: absolute paths under the repo are made relative;
// node_modules (covered by the installed versions) and anything outside the repo are dropped; a
// marker with a colon (another host's address) is kept and always counts as unchanged.
export function loadedFiles(paths) {
  const out = new Set();
  for (const p of paths) {
    if (!p) continue;
    if (p.includes(':') && !p.startsWith('/')) { out.add(p); continue; }
    const rel = p.startsWith('/') ? relative(ROOT, p) : p;
    if (rel.startsWith('..') || /(^|\/)node_modules(\/|$)/.test(rel)) continue;
    out.add(rel);
  }
  return [...out].sort();
}

// The commit a previous clean pass recorded when every file it loaded is unchanged, or null. A lookup
// goes to the timing log as a hit or a miss, as passedAt's does.
export function graphPassedAt(check, base) {
  if (!base) { logTiming({ kind: 'cache', tool: check, cache: 'off' }); return null; }
  let at = null;
  try {
    const rec = JSON.parse(readFileSync(graphFile(check, base), 'utf8'));
    const same = Object.entries(rec.files).every(([f, h]) => (f.includes(':') ? true : fileHash(f) === h))
      && Object.entries(rec.lists ?? {}).every(([d, h]) => listHash(d) === h);
    if (same) at = rec.commit || 'an earlier run';
  } catch { /* none or unreadable: run */ }
  logTiming({ kind: 'cache', tool: check, cache: at ? 'hit' : 'miss', input: base });
  return at;
}

// A run that loaded no game source recorded nothing that proves what it ran, so it records nothing.
// `loaded` is what the run reports; the entry script's own import graph is added here.
export function recordGraphPass(check, base, loaded, entry = process.argv[1]) {
  if (!base) return;
  try {
    const rels = loadedFiles([...loaded, ...(entry ? moduleGraph(entry) : [])]);
    if (!rels.some((f) => f.startsWith('src/'))) { skipped(check, 'no game source loaded'); return; }
    const lists = Object.fromEntries(globDirs(rels).map((d) => [d, listHash(d)]));
    const files = Object.fromEntries(rels.map((f) => [f, f.includes(':') ? f : fileHash(f)]));
    const missing = Object.keys(files).filter((f) => files[f] === null);
    if (missing.length) { skipped(check, `a loaded file is missing (${missing[0]})`); return; }
    let commit = 'uncommitted';
    try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a checkout */ }
    mkdirSync(dir(check), { recursive: true });
    writeFileSync(graphFile(check, base), JSON.stringify({ commit, files, lists }));
    // Records pile up, one per distinct base; old ones are never matched again.
    for (const name of readdirSync(dir(check))) {
      const f = join(dir(check), name);
      if (name.startsWith('graph-') && Date.now() - statSync(f).mtimeMs > 14 * 864e5) rmSync(f, { force: true });
    }
  } catch (e) { skipped(check, `could not write the record: ${e.message}`); }
}

// Per-item records for media made from game captures (feature media, #550): one record per item id
// under ~/.cache/hitl-ci/<kind>-items/, so a run re-renders only the items whose inputs changed.
//   const base = itemBase('feature-media', item, ['scripts/feature-media/render.mjs', 'scripts/capture.js'])
//   itemStatus('feature-media', item.id, base)  -> { upToDate, reason }
//   clearItem('feature-media', item.id)          before re-rendering it
//   recordItem('feature-media', item.id, base, loaded)   after a good render
// itemBase covers what is not a loaded file: the item's spec (functions in it by their source), the
// tool files with their import graphs, and what graphBase covers. `loaded` is what the capture loaded:
// the page's request URLs, repo paths, or both. A record holds each loaded file's hash and the file
// names under every directory a loaded module globs. Any doubt means "stale".
const itemFile = (kind, id) => join(dir(`${kind}-items`), `${encodeURIComponent(String(id))}.json`);
const specText = (spec) => JSON.stringify(spec, (_, v) => (typeof v === 'function' ? `fn:${v.toString()}` : v));

export function itemBase(kind, spec, toolFiles = []) {
  if (process.env.HITL_NO_CHECK_CACHE === '1') return null;
  try {
    const tools = loadedFiles(toolFiles.flatMap((f) => [f, ...moduleGraph(join(ROOT, f))]));
    const parts = [...BASE_FILES, ...tools].map((f) => `${f}:${fileHash(f)}`);
    return createHash('sha256').update(`${kind}\n${specText(spec)}\n${process.version}\n${installed()}\n${parts.join('\n')}`).digest('hex').slice(0, 32);
  } catch (e) {
    skipped(kind, `could not build the key: ${e.message}`);
    return null;
  }
}

export function itemStatus(kind, id, base) {
  if (!base) return { upToDate: false, reason: 'cache off' };
  let rec;
  try { rec = JSON.parse(readFileSync(itemFile(kind, id), 'utf8')); } catch { return { upToDate: false, reason: 'no record' }; }
  if (rec.base !== base) return { upToDate: false, reason: 'spec or tools changed' };
  for (const [f, h] of Object.entries(rec.files ?? {})) if (!f.includes(':') && fileHash(f) !== h) return { upToDate: false, reason: `changed: ${f}` };
  for (const [d, h] of Object.entries(rec.lists ?? {})) if (listHash(d) !== h) return { upToDate: false, reason: `files added or removed under ${d}` };
  return { upToDate: true, reason: null, commit: rec.commit };
}

export function recordItem(kind, id, base, loaded) {
  if (!base) return false;
  try {
    const urls = loaded.filter((p) => /^[a-z]+:\/\//i.test(p));
    const rels = [...new Set([...requestedFiles(urls), ...loadedFiles(loaded.filter((p) => !urls.includes(p)))])].sort();
    if (!rels.some((f) => f.startsWith('src/'))) { skipped(kind, `${id}: no game source loaded`); return false; }
    const files = Object.fromEntries(rels.map((f) => [f, f.includes(':') ? f : fileHash(f)]));
    const missing = Object.keys(files).filter((f) => files[f] === null);
    if (missing.length) { skipped(kind, `${id}: a loaded file is missing (${missing[0]})`); return false; }
    const lists = Object.fromEntries(globDirs(rels).map((d) => [d, listHash(d)]));
    let commit = 'uncommitted';
    try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a checkout */ }
    mkdirSync(dir(`${kind}-items`), { recursive: true });
    writeFileSync(itemFile(kind, id), JSON.stringify({ base, commit, files, lists }));
    return true;
  } catch (e) { skipped(kind, `${id}: could not write the record: ${e.message}`); return false; }
}

export function clearItem(kind, id) {
  try { rmSync(itemFile(kind, id), { force: true }); } catch { /* unremovable: the base still guards it */ }
}
