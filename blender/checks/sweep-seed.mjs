// One seeded game of an engine sweep (scripts/studio/sweep-host.mjs hostSeed), played in a process of its own.
// The game's modules keep state for the life of a process (caches, shared geometry), so a seed played after other
// scenes in one process could play differently from the same seed played alone; a fresh process per seed plays it
// as a fresh `dump.mjs --sweep-row` or `sweep.mjs --replay` does, so every row a sweep reports reproduces there.
//
// seedInChild(options, { reap }) starts this file as a child in its own process group, hands it the options and
// resolves with hostSeed's result and the child's `pid`. `reap(group)` is called with the child's group, for the caller's reaper to end
// it if the caller dies. With HITL_LOAD_TRACK set, the result also lists the files the child loaded (`loaded`).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

export function seedInChild(options, { reap = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SELF], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], detached: true });
    reap(child.pid);
    let result = null;
    child.on('message', (m) => { result = m; });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (result?.error) reject(new Error(`sweep: seed ${options.seed}: ${result.error}`));
      else if (result?.r) resolve({ ...result.r, loaded: result.loaded ?? [], pid: child.pid });
      else reject(new Error(`sweep: seed ${options.seed} ended without a result (${signal ? `signal ${signal}` : `exit ${code}`})`));
    });
    child.send(options);
  });
}

if (process.argv[1] === SELF) {
  // Signals take their default action, as in the parent, and the parent's reaper ends this group; a parent that
  // goes away between weeks ends it too.
  process.on('disconnect', () => process.exit(1));
  process.once('message', async (options) => {
    try {
      if (process.env.HITL_LOAD_TRACK) await import('../../scripts/studio/load-log.mjs');
      const host = await import('../../scripts/studio/sweep-host.mjs');
      const r = await host.hostSeed(options);
      const loaded = [...(globalThis.__hitlLoaded ?? [])];
      process.send({ r, loaded }, () => process.exit(0));
    } catch (e) {
      process.send({ error: e?.stack ?? String(e) }, () => process.exit(1));
    }
  });
}
