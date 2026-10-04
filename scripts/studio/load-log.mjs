// Preloaded (node --import) into an engine process whose caller wants to know which files the run
// used, when HITL_LOAD_TRACK is set: every module that loads (scripts/studio/loader.mjs adds the
// game's own, which it loads itself), plus every public asset the page-side fetch reads
// (platform.mjs). The set is globalThis.__hitlLoaded, for the process to report to its caller.
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

if (process.env.HITL_LOAD_TRACK) {
  const loaded = new Set();
  globalThis.__hitlLoaded = loaded;
  registerHooks({
    load(url, context, next) {
      if (url.startsWith('file:')) loaded.add(fileURLToPath(url));
      return next(url, context);
    },
  });
}
