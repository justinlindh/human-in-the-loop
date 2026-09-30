import { registerHooks } from 'node:module';
const era = process.env.ERA_ART ?? 'dotcom';
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    const replacements = url.endsWith('/blender/checks/harness.mjs')
      ? [['${base}?snap=1&${query}', '${base}?snap=1&eras&eraArt=' + era + '&${query}']]
      : url.endsWith('/scripts/studio/runtime.mjs')
        ? [['  installLoader({ initialPerkDelay });', `  globalThis.location.search += '&eras&eraArt=${era}';\n  installLoader({ initialPerkDelay });`]]
        : url.endsWith('/blender/checks/clip.mjs')
          ? [["inputHash('clip', rig)", `inputHash('clip', rig + ':eraArt=${era}:batch2')`]]
          : url.endsWith('/blender/checks/stage.mjs')
            ? [["inputHash('stage',", `inputHash('stage', 'eraArt=${era}:batch2:' +`]]
            : [];
    if (!replacements.length) return result;
    let source = String(result.source);
    for (const [from, to] of replacements) {
      if (!source.includes(from)) throw new Error(`Preview injection target missing: ${url}`);
      source = source.replace(from, to);
    }
    return { ...result, source };
  },
});
