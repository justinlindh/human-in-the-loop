import { registerHooks } from 'node:module';
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.endsWith('/scripts/perf/bench.js') || result.source == null) return result;
    let source = String(result.source);
    source = source.replace("q.set('quality', quality);", "q.set('quality', quality); q.set('eras', ''); q.set('eraArt', 'dotcom');");
    source = source.replace("symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));", "if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));");
    return { ...result, source };
  },
});
