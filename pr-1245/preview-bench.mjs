import { registerHooks } from 'node:module';
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.endsWith('/scripts/perf/bench.js')) return result;
    const source = String(result.source);
    const target = 'const q = new URLSearchParams(def.query);';
    if (!source.includes(target)) throw new Error('Benchmark query target missing');
    return { ...result, source: source.replace(target, `${target}\n  q.set('eras', ''); q.set('eraArt', '${process.env.ERA_ART ?? 'dotcom'}');`).replace("symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));", "if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));") };
  },
});
