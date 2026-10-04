// Preloaded (node --import) into an engine process whose caller wants to know which files the run
// used: every module that loads, plus every public asset the page-side fetch reads (platform.mjs adds
// those to globalThis.__hitlLoaded). The list is appended, one path per line, to $HITL_LOAD_LOG when
// the process exits.
import { registerHooks } from 'node:module';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const log = process.env.HITL_LOAD_LOG;
if (log) {
  const loaded = new Set();
  globalThis.__hitlLoaded = loaded;
  registerHooks({
    load(url, context, next) {
      if (url.startsWith('file:')) loaded.add(fileURLToPath(url));
      return next(url, context);
    },
  });
  process.on('exit', () => { try { appendFileSync(log, `${[...loaded].join('\n')}\n`); } catch { /* the caller then records nothing */ } });
}
