import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
  cacheDir: '.vite',
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.js', 'src/**/*.test.js'], environment: 'node', testTimeout: 20000 },
});
