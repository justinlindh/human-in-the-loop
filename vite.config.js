import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LongestFirst } from './scripts/tools/test-order.mjs';

// vitest keeps a module cache of tens of megabytes per run in a fresh directory under TMPDIR and
// leaves it behind when a run is killed; /tmp is RAM on the team's machine. Under vitest (also a
// direct `npx vitest`), a caller with no TMPDIR, or /tmp, gets a directory on disk instead.
if (process.env.VITEST && (!process.env.TMPDIR || process.env.TMPDIR === '/tmp')) {
  const disk = process.env.HITL_TMPDIR || join(homedir(), '.cache', 'hitl-ci', 'tmp');
  try {
    mkdirSync(disk, { recursive: true });
    process.env.TMPDIR = disk;
    // Run directories left over from killed runs go once they are two hours old.
    for (const name of readdirSync(disk)) {
      const dir = join(disk, name);
      if (/^[A-Za-z0-9_-]{21}$/.test(name) && Date.now() - statSync(dir).mtimeMs > 2 * 3600e3) rmSync(dir, { recursive: true, force: true });
    }
  } catch { /* keep the default */ }
}

// The version the title shows: HITL_VERSION when the release build sets it, else the nearest
// release tag (v0.4.0, or v0.4.0-3-gabc1234 past it), else the package version plus '-dev'.
function buildVersion() {
  if (process.env.HITL_VERSION) return process.env.HITL_VERSION;
  try {
    const tag = execSync("git describe --tags --match 'v*' --dirty", { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (tag) return tag;
  } catch { /* no git or no tags */ }
  try {
    return `${JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version}-dev`;
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: { __HITL_VERSION__: JSON.stringify(buildVersion()) },
  // The dependency cache lives in each worktree, not in node_modules: worktrees can share one
  // node_modules, and the version define gives every commit a different cache hash, so a shared
  // cache was rebuilt under a running server and its module fetches failed.
  // HITL_VITE_CACHE gives a dev server its own dependency cache, for runs side by side in one tree.
  cacheDir: process.env.HITL_VITE_CACHE || '.vite',
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  // DOM tests opt in per file with // @vitest-environment happy-dom; sim tests stay in Node.
  // maxWorkers caps the suite's parallelism (the default is a worker per core, and tool tests start
  // browsers of their own); HITL_TEST_WORKERS raises or lowers it, and --maxWorkers overrides both.
  // The slow files start first (scripts/tools/test-order.mjs), so the run never waits on one alone.
  // They then run side by side, which on a four-core runner slows each case several times over: the
  // timeout leaves room for that and still stops a hung test within a minute.
  test: { include: ['tests/**/*.test.js', 'src/**/*.test.js'], environment: 'node', testTimeout: 60000, maxWorkers: Number(process.env.HITL_TEST_WORKERS) || 4, sequence: { sequencer: LongestFirst } },
});
