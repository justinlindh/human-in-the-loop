import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// The version the title shows: HITL_VERSION when the release build sets it, else the nearest
// release tag (v0.4.0, or v0.4.0-3-gabc1234 past it), else 'dev'.
function buildVersion() {
  if (process.env.HITL_VERSION) return process.env.HITL_VERSION;
  try {
    return execSync("git describe --tags --match 'v*' --dirty", { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: { __HITL_VERSION__: JSON.stringify(buildVersion()) },
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.js', 'src/**/*.test.js'], environment: 'node', testTimeout: 20000 },
});
