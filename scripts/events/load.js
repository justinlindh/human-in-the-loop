// Opening a headless page at an indexed moment (see build.js): the tools' --snapshot and --event
// flags go through here.
//
//   resolveTarget({ snapshot, event }) -> { file, row } | throws
//     snapshot  a snapshot path (as find.js prints it)
//     event     a find query ("printer_jam --choice 0 --stage floor"); the first match with a snapshot.
//               Without an index for this sim code, one is built first.
//   openAt(H, target, { width, height, quality }) -> { page, errors, row, state: { week, pending } }
//     H is a started harness (blender/checks/harness.mjs). The page loads the snapshot through the
//     game's own save and continueGame, so it is the same state a player loading that save would see,
//     decision open and prop staged. It is not stepped yet.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, simHash, readIndex, match, parseQuery, indexDir } from './lib.js';

export function resolveTarget({ snapshot, event }) {
  const hash = simHash();
  if (snapshot) {
    if (!existsSync(snapshot)) throw new Error(`no snapshot at ${snapshot}`);
    const idx = readIndex(hash);
    const row = idx?.rows.find((r) => r.snapshot === basename(snapshot)) ?? null;
    if (!row) console.warn(`events: ${basename(snapshot)} is not in the index for this sim code (${hash}); it may come from older code`);
    return { file: snapshot, row };
  }
  let idx = readIndex(hash);
  if (!idx) {
    // No index for this sim code yet: build one (about half a minute) rather than answer from old code.
    console.log(`events: no index for this sim code (${hash}); building it`);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/events/build.js')], { stdio: 'inherit' });
    idx = r.status === 0 ? readIndex(hash) : null;
    if (!idx) throw new Error('events: building the index failed');
  }
  const q = { ...parseQuery(event), snapshot: true };
  const [row] = match(idx.rows, q);
  if (!row) throw new Error(`no indexed moment with a snapshot matches "${event}"`);
  return { file: join(indexDir(hash), 'snapshots', row.snapshot), row };
}

// The snapshot as localStorage entries, written by the game's own saveGame. A page that sets these
// before the game loads and then calls controls.continueGame() plays from the snapshot.
export async function snapshotEntries(file) {
  const { saveGame } = await import(pathToFileURL(join(ROOT, 'src/save/save.js')).href);
  const state = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  if (!saveGame(state, storage)) throw new Error(`could not save ${file} as a game`);
  return [...mem.entries()];
}

// Loads a snapshot into an already-open page through the game's own save and continueGame, exactly
// as a player loading that save would see it (decision open, prop staged). Safe to call more than
// once on the same page: each call is an ordinary in-game load, indistinguishable from a player
// picking a different save from the title screen mid-session.
export async function applySnapshot(page, file) {
  const items = await snapshotEntries(file);
  const res = await page.evaluate((list) => {
    for (const [k, v] of list) localStorage.setItem(k, v);
    const r = window.__HITL.controls.continueGame();
    const S = window.__HITL.state;
    // The sim announced the open decision the week it was raised; a load does not, so announce it
    // again for the renderer to start its moment.
    if (r.ok && S.pendingDecision) window.__HITL.emit([{ type: 'decision' }]);
    // Loading sets the game's speed, which is 0 in snap mode; the harness steps a running diorama.
    window.__hitlRender.setSpeed?.(1);
    window.__hitlRender.setPaused?.(false);
    return { ...r, week: S.week, pending: S.pendingDecision?.eventId ?? null, title: window.__HITL.titleShown ?? !!document.querySelector('.title-mode') };
  }, items);
  if (!res.ok) throw new Error(`continueGame failed on ${file}: ${JSON.stringify(res)}`);
  // A capture under the title screen would judge the menu, not the moment.
  if (res.title) throw new Error(`the title screen is still up after loading ${file}`);
  return { week: res.week, pending: res.pending };
}

export async function openAt(H, target, { width = 1280, height = 800, quality = 'medium', slot = 0 } = {}) {
  const { page, errors } = await H.openScene(`quality=${quality}`, { width, height, slot });
  const state = await applySnapshot(page, target.file);
  return { page, errors, row: target.row, state };
}
