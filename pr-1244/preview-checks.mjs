import { registerHooks } from 'node:module';
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    const replacements = url.endsWith('/blender/checks/harness.mjs')
      ? [['async openScene(query, {', "async openScene(query, {"],
         ['${base}?snap=1&${query}', '${base}?snap=1&eras&eraArt=dotcom&${query}']]
      : url.endsWith('/scripts/studio/runtime.mjs')
        ? [['  installLoader({ initialPerkDelay });', "  globalThis.location.search += '&eras&eraArt=dotcom';\n  installLoader({ initialPerkDelay });"]]
        : url.endsWith('/blender/checks/clip.mjs')
          ? [["inputHash('clip', rig)", "inputHash('clip', rig + ':eraArt=dotcom')"]]
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
