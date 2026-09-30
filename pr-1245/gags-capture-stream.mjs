import { registerHooks } from 'node:module';
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.endsWith('/blender/checks/harness.mjs')) return result;
    const source = String(result.source);
    const target = 'window.__reseedGame = () => { s = SEED; };';
    if (!source.includes(target)) throw new Error('Capture reseed target missing');
    return { ...result, source: source.replace(target, 'window.__reseedGame = () => { s = 987654321; };') };
  },
});
