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
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
  } catch {
    return null;
  }
}

// What node_modules and the browser cache actually hold, which a stale install can make differ
// from the lockfile.
function installed() {
  const version = (pkg) => JSON.parse(readFileSync(join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  return ['three', 'vite', 'playwright'].map((p) => `${p}@${version(p)}`).concat(`chromium:${chromium.executablePath()}`).join(' ');
}

const dir = (check) => join(homedir(), '.cache', 'hitl-ci', check);

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
  } catch {
    // A cache that cannot be written only costs a render next time.
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
  } catch {
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
    if (Object.values(files).some((h) => h === null)) return;
    mkdirSync(dir(`${check}-scenes`), { recursive: true });
    writeFileSync(sceneFile(check, name), JSON.stringify({ base, ref: fileHash(refRel), files }));
  } catch { /* a record that cannot be written only costs a render next time */ }
}
