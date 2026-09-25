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
