import { expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { join, resolve } from 'node:path';

export const build = resolve('scripts/events/build.js');
export const shortRun = { seed: 7, bot: 'balanced', weeks: 24 };
export const shortArgs = ['--seeds', String(shortRun.seed), '--bots', shortRun.bot, '--weeks', String(shortRun.weeks), '--jobs', '1'];
export const run = (cache, args = []) => spawnSync(process.execPath, [build, ...args], {
  env: { ...process.env, HITL_EVENTS_DIR: cache }, encoding: 'utf8', timeout: 120000,
});
export function workspace() {
  const root = mkdtempSync(join(toolTmp(), 'events-build-'));
  return {
    directory(name) { const dir = join(root, name); mkdirSync(dir, { recursive: true }); return dir; },
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}
export function compareSnapshots(a, b) {
  const files = readdirSync(join(a, 'snapshots')).sort();
  expect(readdirSync(join(b, 'snapshots')).sort()).toEqual(files);
  for (const f of files) expect(readFileSync(join(a, 'snapshots', f)).equals(readFileSync(join(b, 'snapshots', f))), f).toBe(true);
  return files;
}
